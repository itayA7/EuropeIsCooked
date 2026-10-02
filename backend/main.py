import asyncio
import csv
import io
import json
import logging
import os
import re
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from xml.etree import ElementTree
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from langdetect import DetectorFactory, LangDetectException, detect
from starlette.middleware.trustedhost import TrustedHostMiddleware

REFRESH_INTERVAL_SECONDS = 15 * 60
STATUS_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60
ARTICLE_RETENTION = timedelta(days=7)
NEWS_REFRESH_CONCURRENCY = 5
UCDP_DOWNLOADS_URL = "https://ucdp.uu.se/downloads/"
CACHE_DB = Path(__file__).with_name("news_cache.sqlite3")
CACHE_LOCKS: dict[str, asyncio.Lock] = {}
CACHE_SCHEMA_VERSION = 2
NEWS_REFRESH_IN_PROGRESS = False
NEWS_COUNTRIES_PENDING: set[str] = set()
STATUS_REFRESH_IN_PROGRESS = False
logger = logging.getLogger(__name__)
load_dotenv(Path(__file__).with_name(".env"))


def normalize_domain(value: str) -> str:
    parsed = urlparse(value if "://" in value else f"//{value}")
    return (parsed.hostname or value).casefold().removeprefix("www.").rstrip(".")


NEWS_SOURCE_DOMAINS = frozenset(
    normalize_domain(domain.strip())
    for domain in os.getenv("NEWS_SOURCE_DOMAINS", "").split(",")
    if domain.strip()
)
NEWS_CACHE_NAMESPACE = f"politics-v6-en:{json.dumps(sorted(NEWS_SOURCE_DOMAINS), separators=(',', ':'))}"
DetectorFactory.seed = 0
POLITICAL_HEADLINE = re.compile(
    r"\b(election|elections|vote|voting|parliament|congress|senate|government|cabinet|"
    r"president|prime minister|chancellor|premier|minister|politic(?:s|al)|diplomac\w*|"
    r"sanctions?|treat(?:y|ies)|legislation|lawmakers?|policy|policies|coalition|opposition|"
    r"political party|referendum|summit|foreign affairs|foreign policy|state visit|"
    r"european commission|european council|NATO|protests?|protesting|demonstrat\w*|march\w*|"
    r"housing crisis|eviction|troops|military|armed forces|army|official visit|attack\w*|"
    r"war|warfare|conflict|invasion|airstrikes?|missiles?|ceasefire|frontline|"
    r"battlefield|combat|shelling|bombing|occupation|war crimes?|casualties|weapons|"
    r"defen[cs]e ministry|soldiers|hostilities|armed conflict)\b",
    re.IGNORECASE,
)
COUNTRY_NEWS_TERMS = {
    "albania": ("albania", "albanian"), "austria": ("austria", "austrian"),
    "belgium": ("belgium", "belgian"), "bulgaria": ("bulgaria", "bulgarian"),
    "switzerland": ("switzerland", "swiss"), "cyprus": ("cyprus", "cypriot"),
    "czechia": ("czechia", "czech"), "germany": ("germany", "german"),
    "denmark": ("denmark", "danish"), "estonia": ("estonia", "estonian"),
    "spain": ("spain", "spanish", "madrid"), "finland": ("finland", "finnish"),
    "france": ("france", "french", "paris"), "united kingdom": ("united kingdom", "britain", "british", "uk"),
    "greece": ("greece", "greek"), "croatia": ("croatia", "croatian"),
    "hungary": ("hungary", "hungarian"), "ireland": ("ireland", "irish"),
    "iceland": ("iceland", "icelandic"), "italy": ("italy", "italian"),
    "lithuania": ("lithuania", "lithuanian"), "luxembourg": ("luxembourg",),
    "latvia": ("latvia", "latvian"), "moldova": ("moldova", "moldovan"),
    "montenegro": ("montenegro", "montenegrin"), "north macedonia": ("north macedonia", "macedonian"),
    "netherlands": ("netherlands", "dutch"), "norway": ("norway", "norwegian"),
    "poland": ("poland", "polish"), "portugal": ("portugal", "portuguese"),
    "romania": ("romania", "romanian"), "serbia": ("serbia", "serbian"),
    "sweden": ("sweden", "swedish"), "slovenia": ("slovenia", "slovenian"),
    "slovakia": ("slovakia", "slovak"), "ukraine": ("ukraine", "ukrainian", "kyiv", "kiev"),
    "bosnia and herzegovina": ("bosnia", "bosnian"), "belarus": ("belarus", "belarusian"),
    "russia": ("russia", "russian"), "türkiye": ("türkiye", "turkey", "turkish"),
}
COUNTRY_NAME_BY_KEY = {
    country.casefold(): country.title().replace(" And ", " and ")
    for country in COUNTRY_NEWS_TERMS
}
COUNTRY_STATUS_ALIASES = {
    "czech republic": "czechia",
    "turkey": "türkiye",
    "bosnia-herzegovina": "bosnia and herzegovina",
}


class UcdpCandidateLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.csv_links: list[tuple[tuple[int, int, int], str]] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        match = re.search(r"GEDEvent_v(\d+)_(\d+)_(\d+)\.csv$", href, re.IGNORECASE)
        if match:
            version = tuple(int(part) for part in match.groups())
            self.csv_links.append((version, urljoin(UCDP_DOWNLOADS_URL, href)))


def ucdp_country_key(value: str) -> Optional[str]:
    country_key = value.strip().casefold()
    country_key = COUNTRY_STATUS_ALIASES.get(country_key, country_key)
    return country_key if country_key in COUNTRY_NEWS_TERMS else None


def calculate_country_statuses(rows: list[dict]) -> tuple[dict[str, dict], str, list[dict]]:
    parsed_events = []
    for row in rows:
        country_key = ucdp_country_key(row.get("country", ""))
        try:
            event_date = date.fromisoformat((row.get("date_end") or "")[:10])
            violence_type = int(row.get("type_of_violence") or 0)
            best_deaths = int(float(row.get("best") or 0))
        except (TypeError, ValueError):
            continue
        if country_key:
            conflict_id = row.get("conflict_new_id") or row.get("conflict_dset_id") or row.get("relid", "unknown")
            parsed_events.append((country_key, event_date, violence_type, best_deaths, str(conflict_id), row))

    if not parsed_events:
        raise ValueError("UCDP response contained no recognized country events")

    data_through = max(event[1] for event in parsed_events)
    recent_cutoff = data_through - timedelta(days=90)
    recent_event_counts: dict[str, int] = {}
    recent_type_counts: dict[str, dict[int, int]] = {}
    multi_source_event_counts: dict[str, int] = {}
    conflict_year_deaths: dict[tuple[str, int, str], int] = {}
    state_deaths_this_year: dict[str, int] = {}
    recent_event_records = []

    for country_key, event_date, violence_type, best_deaths, conflict_id, row in parsed_events:
        if recent_cutoff <= event_date <= data_through:
            recent_event_counts[country_key] = recent_event_counts.get(country_key, 0) + 1
            country_types = recent_type_counts.setdefault(country_key, {})
            country_types[violence_type] = country_types.get(violence_type, 0) + 1
            try:
                source_count = max(0, int(row.get("number_of_sources") or 0))
            except (TypeError, ValueError):
                source_count = 0
            if source_count >= 2:
                multi_source_event_counts[country_key] = multi_source_event_counts.get(country_key, 0) + 1
        if violence_type == 1 and event_date.year == data_through.year:
            conflict_key = (country_key, event_date.year, str(conflict_id))
            conflict_year_deaths[conflict_key] = conflict_year_deaths.get(conflict_key, 0) + best_deaths
            state_deaths_this_year[country_key] = state_deaths_this_year.get(country_key, 0) + best_deaths
        if recent_cutoff <= event_date <= data_through:
            category = {1: "State-based conflict", 2: "Non-state conflict", 3: "One-sided violence"}.get(violence_type, "Organized violence")
            try:
                latitude = float(row["latitude"]) if row.get("latitude") else None
                longitude = float(row["longitude"]) if row.get("longitude") else None
            except (TypeError, ValueError):
                latitude = longitude = None
            location = row.get("where_description") or row.get("where_coordinates") or row.get("adm_1") or COUNTRY_NAME_BY_KEY[country_key]
            headlines = row.get("source_headline", "")
            short_headline = next((part.strip().strip('"') for part in headlines.split(";") if part.strip()), "")
            if not short_headline:
                short_headline = f"{category} event near {location}"
            severity = "critical" if best_deaths >= 25 else "high" if best_deaths >= 5 else "moderate" if best_deaths > 0 else "low"
            recent_event_records.append({
                "event_id": row.get("id") or row.get("relid") or f"{country_key}:{event_date}:{conflict_id}",
                "country_key": country_key,
                "country": COUNTRY_NAME_BY_KEY[country_key],
                "date": event_date.isoformat(),
                "category": category,
                "violence_type": violence_type,
                "headline": short_headline,
                "severity": severity,
                "source_count": source_count,
                "best_deaths": best_deaths,
                "latitude": latitude,
                "longitude": longitude,
                "location": location,
                "details": {
                    "conflict": row.get("conflict_name"),
                    "actor_a": row.get("side_a"),
                    "actor_b": row.get("side_b"),
                    "source_headlines": headlines,
                    "where_description": row.get("where_description"),
                    "best_deaths": best_deaths,
                    "high_deaths": row.get("high"),
                    "low_deaths": row.get("low"),
                },
            })

    conflict_countries = {
        country_key
        for (country_key, _year, _conflict_id), deaths in conflict_year_deaths.items()
        if deaths >= 25
    }
    statuses = {}
    for country_key in COUNTRY_NEWS_TERMS:
        recent_event_count = recent_event_counts.get(country_key, 0)
        if country_key in conflict_countries:
            status = "conflict"
        elif recent_event_count:
            status = "tense"
        else:
            status = "stable"
        statuses[country_key] = {
            "status": status,
            "recent_events": recent_event_count,
            "state_based_events": recent_type_counts.get(country_key, {}).get(1, 0),
            "non_state_events": recent_type_counts.get(country_key, {}).get(2, 0),
            "one_sided_violence_events": recent_type_counts.get(country_key, {}).get(3, 0),
            "state_battle_deaths_this_year": state_deaths_this_year.get(country_key, 0),
            "multi_source_events": multi_source_event_counts.get(country_key, 0),
        }
    recent_event_records.sort(key=lambda event: (event["date"], event["event_id"]), reverse=True)
    return statuses, data_through.isoformat(), recent_event_records


def write_country_statuses(statuses: dict[str, dict], data_through: str, source_version: str, events: list[dict]) -> None:
    updated_at = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(CACHE_DB) as connection:
        connection.executemany(
            "INSERT INTO country_status (country_key, status, metrics, data_through, source_version, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(country_key) DO UPDATE SET status = excluded.status, metrics = excluded.metrics, "
            "data_through = excluded.data_through, source_version = excluded.source_version, updated_at = excluded.updated_at",
            [
                (country_key, result["status"], json.dumps(result), data_through, source_version, updated_at)
                for country_key, result in statuses.items()
            ],
        )
        connection.execute("DELETE FROM security_events")
        connection.executemany(
            "INSERT INTO security_events (event_id, country_key, event_date, category, violence_type, headline, severity, "
            "source_count, best_deaths, latitude, longitude, location, details) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    str(event["event_id"]), event["country_key"], event["date"], event["category"],
                    event["violence_type"], event["headline"], event["severity"], event["source_count"], event["best_deaths"],
                    event["latitude"], event["longitude"], event["location"], json.dumps(event["details"]),
                )
                for event in events
            ],
        )


def read_country_statuses() -> dict:
    with sqlite3.connect(CACHE_DB) as connection:
        rows = connection.execute(
            "SELECT country_key, status, metrics, data_through, source_version, updated_at FROM country_status"
        ).fetchall()
    statuses = {country_key: {**json.loads(metrics), "status": status} for country_key, status, metrics, _, _, _ in rows}
    metadata = rows[0] if rows else None
    return {
        "statuses": statuses,
        "data_through": metadata[3] if metadata else None,
        "source_version": metadata[4] if metadata else None,
        "updated_at": metadata[5] if metadata else None,
        "available": bool(rows),
        "refreshing": STATUS_REFRESH_IN_PROGRESS,
        "source": "UCDP Candidate Events",
    }


async def refresh_ucdp_country_statuses() -> None:
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(120, connect=15),
        follow_redirects=True,
        headers={"User-Agent": "EuropeSecurityMonitor/1.0"},
    ) as client:
        downloads_page = await client.get(UCDP_DOWNLOADS_URL)
        downloads_page.raise_for_status()
        parser = UcdpCandidateLinkParser()
        parser.feed(downloads_page.text)
        if not parser.csv_links:
            raise RuntimeError("No UCDP Candidate Events CSV was found on the downloads page")
        version, csv_url = max(parser.csv_links, key=lambda item: item[0])
        csv_response = await client.get(csv_url)
        csv_response.raise_for_status()

    rows = list(csv.DictReader(io.StringIO(csv_response.text)))
    statuses, data_through, events = calculate_country_statuses(rows)
    source_version = ".".join(str(part) for part in version)
    write_country_statuses(statuses, data_through, source_version, events)


async def refresh_country_status_cache() -> None:
    global STATUS_REFRESH_IN_PROGRESS
    loop = asyncio.get_running_loop()
    while True:
        refresh_started = loop.time()
        STATUS_REFRESH_IN_PROGRESS = True
        try:
            await refresh_ucdp_country_statuses()
        except Exception:
            logger.exception("UCDP country status refresh failed; retaining the previous status snapshot")
        finally:
            STATUS_REFRESH_IN_PROGRESS = False
        next_refresh = refresh_started + STATUS_REFRESH_INTERVAL_SECONDS
        await asyncio.sleep(max(0, next_refresh - loop.time()))


def is_political_article(article: dict, country_name: Optional[str] = None) -> bool:
    title = article.get("title", "")
    source = article.get("source", "")
    headline = title
    if source and title.lower().endswith(f" - {source}".lower()):
        headline = title[: -(len(source) + 3)]
    try:
        if detect(headline) != "en":
            return False
    except LangDetectException:
        return False
    if not POLITICAL_HEADLINE.search(headline):
        return False
    if not country_name:
        return True
    country_terms = COUNTRY_NEWS_TERMS.get(country_name.lower(), (country_name,))
    return any(re.search(rf"\b{re.escape(term)}\b", headline, re.IGNORECASE) for term in country_terms)


def is_configured_source(article: dict) -> bool:
    domain = normalize_domain(article.get("source_domain", ""))
    return any(domain == allowed or domain.endswith(f".{allowed}") for allowed in NEWS_SOURCE_DOMAINS)


def is_within_retention(article: dict, now: Optional[datetime] = None) -> bool:
    published = article.get("published")
    if not published:
        return False
    try:
        try:
            article_date = parsedate_to_datetime(published)
        except (TypeError, ValueError, OverflowError):
            try:
                article_date = datetime.strptime(published, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                article_date = datetime.fromisoformat(published.replace("Z", "+00:00"))
        if article_date.tzinfo is None:
            article_date = article_date.replace(tzinfo=timezone.utc)
        current_time = now or datetime.now(timezone.utc)
        return current_time - article_date.astimezone(timezone.utc) <= ARTICLE_RETENTION
    except (TypeError, ValueError, OverflowError):
        return False


def article_datetime(article: dict) -> datetime:
    published = article.get("published") or ""
    try:
        try:
            parsed = parsedate_to_datetime(published)
        except (TypeError, ValueError, OverflowError):
            try:
                parsed = datetime.strptime(published, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
            except ValueError:
                parsed = datetime.fromisoformat(published.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return datetime.min.replace(tzinfo=timezone.utc)


def event_tokens(article: dict) -> set[str]:
    title = article.get("title", "")
    source = article.get("source", "")
    if source and title.lower().endswith(f" - {source}".lower()):
        title = title[: -(len(source) + 3)]
    ignored = {"about", "after", "amid", "from", "have", "into", "over", "says", "that", "their", "they", "this", "with", "will"}
    return {token for token in re.findall(r"[a-z0-9]+", title.casefold()) if len(token) > 2 and token not in ignored}


def group_articles(articles: list[dict]) -> list[dict]:
    unique_articles: dict[str, dict] = {}
    for article in articles:
        url = article.get("url") or f"{article.get('title', '')}:{article.get('source', '')}"
        existing = unique_articles.get(url)
        if existing:
            countries = set(existing.get("countries", [])) | set(article.get("countries", []))
            if article.get("country"):
                countries.add(article["country"])
            existing["countries"] = sorted(countries)
        else:
            countries = set(article.get("countries", []))
            if article.get("country"):
                countries.add(article["country"])
            unique_articles[url] = {**article, "countries": sorted(countries)}

    sorted_articles = sorted(unique_articles.values(), key=article_datetime, reverse=True)
    clusters: list[dict] = []
    for article in sorted_articles:
        tokens = event_tokens(article)
        best_cluster = None
        best_score = 0.0
        for cluster in clusters:
            overlap = len(tokens & cluster["tokens"])
            union = len(tokens | cluster["tokens"])
            jaccard = overlap / union if union else 0.0
            similarity = SequenceMatcher(None, " ".join(sorted(tokens)), " ".join(sorted(cluster["tokens"]))).ratio()
            score = max(jaccard, similarity)
            if overlap >= 3 and (jaccard >= 0.55 or similarity >= 0.78) and score > best_score:
                best_cluster = cluster
                best_score = score
        if best_cluster is None:
            clusters.append({"article": article, "articles": [article], "tokens": tokens})
        else:
            best_cluster["articles"].append(article)
            best_cluster["tokens"].update(tokens)

    events = []
    for cluster in clusters:
        event_articles = cluster["articles"]
        countries = sorted({country for article in event_articles for country in article.get("countries", [])})
        events.append({
            "title": cluster["article"].get("title", "Untitled story"),
            "latest_published": cluster["article"].get("published"),
            "article_count": len(event_articles),
            "countries": countries,
            "articles": event_articles,
        })
    return events


def cache_key_for_country(country_name: Optional[str]) -> str:
    normalized_country = (country_name or "").strip().casefold()
    return f"{NEWS_CACHE_NAMESPACE}:{json.dumps(normalized_country, ensure_ascii=False)}"


def prune_expired_articles() -> None:
    with sqlite3.connect(CACHE_DB) as connection:
        rows = connection.execute("SELECT query, articles FROM news_cache").fetchall()
        for query, articles_json in rows:
            recent_articles = [article for article in json.loads(articles_json) if is_within_retention(article)]
            connection.execute(
                "UPDATE news_cache SET articles = ? WHERE query = ?",
                (json.dumps(recent_articles), query),
            )


@asynccontextmanager
async def lifespan(_app):
    with sqlite3.connect(CACHE_DB) as connection:
        schema_version = connection.execute("PRAGMA user_version").fetchone()[0]
        if schema_version > CACHE_SCHEMA_VERSION:
            raise RuntimeError("News cache database was created by a newer application version")
        if schema_version < CACHE_SCHEMA_VERSION:
            connection.execute("DROP TABLE IF EXISTS news_cache")
            connection.execute(f"PRAGMA user_version = {CACHE_SCHEMA_VERSION}")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS news_cache ("
            "query TEXT PRIMARY KEY, articles TEXT NOT NULL, updated_at TEXT NOT NULL, fetched_at REAL NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS country_status ("
            "country_key TEXT PRIMARY KEY, status TEXT NOT NULL, metrics TEXT NOT NULL, "
            "data_through TEXT NOT NULL, source_version TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS security_events ("
            "event_id TEXT PRIMARY KEY, country_key TEXT NOT NULL, event_date TEXT NOT NULL, "
            "category TEXT NOT NULL, violence_type INTEGER NOT NULL, headline TEXT NOT NULL, "
            "severity TEXT NOT NULL, source_count INTEGER NOT NULL, best_deaths INTEGER NOT NULL, "
            "latitude REAL, longitude REAL, location TEXT NOT NULL, details TEXT NOT NULL)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS security_events ("
            "event_id TEXT PRIMARY KEY, country_key TEXT NOT NULL, event_date TEXT NOT NULL, "
            "category TEXT NOT NULL, violence_type INTEGER NOT NULL, headline TEXT NOT NULL, "
            "severity TEXT NOT NULL, source_count INTEGER NOT NULL, best_deaths INTEGER NOT NULL, "
            "latitude REAL, longitude REAL, location TEXT NOT NULL, details TEXT NOT NULL)"
        )
        connection.execute(
            "DELETE FROM news_cache WHERE query NOT LIKE ?",
            (f"{NEWS_CACHE_NAMESPACE}:%",),
        )
    prune_expired_articles()
    if NEWS_SOURCE_DOMAINS:
        NEWS_COUNTRIES_PENDING.update(COUNTRY_NEWS_TERMS)
    refresh_tasks = [
        asyncio.create_task(refresh_cached_news()),
        asyncio.create_task(refresh_country_status_cache()),
    ]
    try:
        yield
    finally:
        for task in refresh_tasks:
            task.cancel()
        await asyncio.gather(*refresh_tasks, return_exceptions=True)


app = FastAPI(title="Europe Security Monitor API", version="1.0.0", lifespan=lifespan)
allowed_hosts = [host.strip().casefold() for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=[],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

async def gdelt(country_name: Optional[str] = None):
    query = f'"{country_name or "Europe"}" (election OR government OR parliament OR president OR diplomacy OR sanctions OR political OR war OR conflict OR invasion OR military OR missile OR ceasefire OR attack OR troops)'
    url = "https://api.gdeltproject.org/api/v2/doc/doc"
    params = {"query": query, "mode": "ArtList", "format": "json", "maxrecords": 75, "sort": "HybridRel", "timespan": "24h"}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent":"EuropeSecurityMonitor/1.0"}) as client:
            r = await client.get(url, params=params)
            r.raise_for_status(); data = r.json()
            articles=[]
            for x in data.get("articles", []):
                title=x.get("title", ""); domain=x.get("domain", "")
                article = {"title":title,"url":x.get("url"),"source":domain,"source_domain":domain,"published":x.get("seendate"),"country":country_name}
                if is_political_article(article, country_name):
                    articles.append(article)
            return articles
    except Exception:
        return None


async def google_news(country_name: Optional[str] = None):
    query = f'"{country_name or "Europe"}" (election OR government OR parliament OR president OR diplomacy OR sanctions OR political OR minister OR war OR conflict OR invasion OR military OR missile OR ceasefire OR attack OR troops) when:1d'
    url = "https://news.google.com/rss/search"
    params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "EuropeSecurityMonitor/1.0"}) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
        root = ElementTree.fromstring(response.content)
        articles = []
        for item in root.findall("./channel/item")[:50]:
            title = item.findtext("title")
            link = item.findtext("link")
            source_element = item.find("source")
            if not title or not link:
                continue
            article = {
                "title": title,
                "url": link,
                "source": source_element.text if source_element is not None and source_element.text else "Google News",
                "source_domain": normalize_domain(source_element.get("url", "")) if source_element is not None else "",
                "published": item.findtext("pubDate"),
                "country": country_name,
            }
            if is_political_article(article, country_name):
                articles.append(article)
        return articles
    except Exception:
        return None


async def fetch_news(country_name: Optional[str] = None):
    if not NEWS_SOURCE_DOMAINS:
        return []

    articles = await google_news(country_name)
    if articles:
        configured_articles = [article for article in articles if is_configured_source(article)]
        if configured_articles:
            return configured_articles
    fallback_articles = await gdelt(country_name)
    if fallback_articles is not None:
        return [article for article in fallback_articles if is_configured_source(article)]
    if articles is None:
        return None
    return [article for article in articles if is_configured_source(article)]


def read_cached_news(query: str):
    with sqlite3.connect(CACHE_DB) as connection:
        row = connection.execute(
            "SELECT articles, updated_at, fetched_at FROM news_cache WHERE query = ?",
            (query,),
        ).fetchone()
    if row is None:
        return None
    articles = [article for article in json.loads(row[0]) if is_within_retention(article)]
    return {"articles": articles, "updated_at": row[1], "fetched_at": row[2]}


def write_cached_news(query: str, articles: list[dict]):
    updated_at = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(CACHE_DB) as connection:
        recent_articles = [article for article in articles if is_within_retention(article)]
        connection.execute(
            "INSERT INTO news_cache (query, articles, updated_at, fetched_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(query) DO UPDATE SET articles = excluded.articles, "
            "updated_at = excluded.updated_at, fetched_at = excluded.fetched_at",
            (query, json.dumps(recent_articles), updated_at, time.time()),
        )
    return {"articles": recent_articles, "updated_at": updated_at}


async def refresh_country_news(country_name: str, semaphore: asyncio.Semaphore) -> None:
    country_key = country_name.casefold()
    try:
        async with semaphore:
            articles = await fetch_news(country_name)
        if articles is not None:
            write_cached_news(cache_key_for_country(country_name), articles)
    finally:
        NEWS_COUNTRIES_PENDING.discard(country_key)


async def refresh_all_news() -> None:
    NEWS_COUNTRIES_PENDING.update(COUNTRY_NEWS_TERMS)
    semaphore = asyncio.Semaphore(NEWS_REFRESH_CONCURRENCY)
    await asyncio.gather(
        *(refresh_country_news(country_name, semaphore) for country_name in COUNTRY_NEWS_TERMS),
        return_exceptions=True,
    )
    prune_expired_articles()


async def refresh_cached_news():
    global NEWS_REFRESH_IN_PROGRESS
    loop = asyncio.get_running_loop()
    while True:
        refresh_started = loop.time()
        NEWS_REFRESH_IN_PROGRESS = True
        try:
            await refresh_all_news()
        except Exception:
            logger.exception("News refresh cycle failed")
        finally:
            NEWS_REFRESH_IN_PROGRESS = False
        next_refresh = refresh_started + REFRESH_INTERVAL_SECONDS
        await asyncio.sleep(max(0, next_refresh - loop.time()))

@app.get("/api/news")
async def news(country: Optional[str] = Query(default=None, max_length=64, pattern=r"^[\w .'-]+$")):
    if country and country.casefold() not in COUNTRY_NEWS_TERMS:
        raise HTTPException(status_code=422, detail="Unsupported country")
    cache_key = cache_key_for_country(country)
    cached_news = read_cached_news(cache_key)
    return {
        "updated_at": cached_news["updated_at"] if cached_news else None,
        "news": cached_news["articles"] if cached_news else [],
        "events": group_articles(cached_news["articles"]) if cached_news else [],
        "source_configured": bool(NEWS_SOURCE_DOMAINS),
        "refreshing": bool(country and country.casefold() in NEWS_COUNTRIES_PENDING),
    }


@app.get("/api/news/overview")
async def news_overview():
    prefix = f"{NEWS_CACHE_NAMESPACE}:"
    with sqlite3.connect(CACHE_DB) as connection:
        rows = connection.execute(
            "SELECT query, articles, updated_at FROM news_cache WHERE query LIKE ?",
            (f"{prefix}%",),
        ).fetchall()

    articles = []
    updated_at = None
    for query, articles_json, row_updated_at in rows:
        country_key = json.loads(query.removeprefix(prefix))
        country = COUNTRY_NAME_BY_KEY.get(country_key, country_key)
        if row_updated_at and (updated_at is None or row_updated_at > updated_at):
            updated_at = row_updated_at
        for article in json.loads(articles_json):
            if is_within_retention(article):
                articles.append({**article, "country": country, "countries": [country] if country else []})

    return {
        "updated_at": updated_at,
        "events": group_articles(articles),
        "source_configured": bool(NEWS_SOURCE_DOMAINS),
        "refreshing": bool(NEWS_COUNTRIES_PENDING),
    }


@app.get("/api/status")
async def country_status():
    return read_country_statuses()


def read_security_events(country_key: Optional[str] = None, limit: int = 100) -> list[dict]:
    query = (
        "SELECT event_id, country_key, event_date, category, violence_type, headline, severity, "
        "source_count, best_deaths, latitude, longitude, location, details "
        "FROM security_events"
    )
    parameters: list = []
    if country_key:
        query += " WHERE country_key = ?"
        parameters.append(country_key)
    query += " ORDER BY event_date DESC, event_id DESC LIMIT ?"
    parameters.append(limit)
    with sqlite3.connect(CACHE_DB) as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [
        {
            "event_id": row[0], "country_key": row[1], "country": COUNTRY_NAME_BY_KEY.get(row[1], row[1]),
            "date": row[2], "category": row[3], "violence_type": row[4], "headline": row[5],
            "severity": row[6], "source_count": row[7], "best_deaths": row[8],
            "latitude": row[9], "longitude": row[10], "location": row[11], "details": json.loads(row[12]),
        }
        for row in rows
    ]


@app.get("/api/events")
async def security_events(
    country: Optional[str] = Query(default=None, max_length=64, pattern=r"^[\w .'-]+$"),
    limit: int = Query(default=100, ge=1, le=500),
):
    country_key = None
    if country:
        country_key = country.casefold()
        if country_key not in COUNTRY_NEWS_TERMS:
            raise HTTPException(status_code=422, detail="Unsupported country")
    status_snapshot = read_country_statuses()
    return {
        "events": read_security_events(country_key, limit),
        "data_through": status_snapshot["data_through"],
        "source_version": status_snapshot["source_version"],
        "updated_at": status_snapshot["updated_at"],
        "refreshing": status_snapshot["refreshing"],
    }


@app.get("/api/status/{country}")
async def country_status_assessment(country: str):
    country_key = country.casefold()
    if country_key not in COUNTRY_NEWS_TERMS:
        raise HTTPException(status_code=422, detail="Unsupported country")
    status_snapshot = read_country_statuses()
    metrics = status_snapshot["statuses"].get(country_key)
    if not metrics:
        return {"available": False, "refreshing": status_snapshot["refreshing"], "country": COUNTRY_NAME_BY_KEY[country_key]}

    events = read_security_events(country_key, 500)
    news_snapshot = read_cached_news(cache_key_for_country(country_key))
    articles = news_snapshot["articles"] if news_snapshot else []
    military_events = [event for event in events if event["violence_type"] == 1]
    corroborated_events = [event for event in events if event["source_count"] >= 2]
    data_through = status_snapshot["data_through"]
    data_age_days = max(0, (date.today() - date.fromisoformat(data_through)).days) if data_through else 90
    freshness_score = max(0, 100 - max(0, data_age_days - 31) * 4)
    source_score = (
        round(sum(min(2, event["source_count"]) / 2 for event in events) / len(events) * 100)
        if events else 50
    )
    evidence_confidence = round(freshness_score * 0.7 + source_score * 0.3)
    factors = [
        {"key": "incidents", "label": "Recorded security incidents in the latest 90 days", "count": metrics["recent_events"], "items": events},
        {"key": "military", "label": "State-based conflict events in the latest 90 days", "count": metrics["state_based_events"], "items": military_events},
        {"key": "news", "label": "Relevant news reports in the saved 7-day window", "count": len(articles), "items": articles},
        {"key": "corroborated", "label": "Incidents cited by at least two sources", "count": metrics["multi_source_events"], "items": corroborated_events},
    ]
    return {
        "available": True,
        "country": COUNTRY_NAME_BY_KEY[country_key],
        "status": metrics["status"],
        "evidence_confidence_pct": evidence_confidence,
        "confidence_method": "Heuristic evidence coverage: 70% dataset freshness and 30% source corroboration; not a probability.",
        "assessed_at": status_snapshot["updated_at"],
        "data_through": data_through,
        "source_version": status_snapshot["source_version"],
        "automated_assessment": True,
        "is_prediction": False,
        "factors": factors,
    }
