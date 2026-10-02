import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { COUNTRIES, COUNTRY_BY_CODE, MILITARY_BUDGET_YEAR, STATIC_DATA_AS_OF, type Country } from './countries';
import './styles.css';

const GEO = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API = 'http://localhost:8000/api';
type DynamicStatus = 'stable' | 'tense' | 'conflict';
type StatusColor = DynamicStatus | 'unknown';
const colors: Record<StatusColor, string> = { stable: '#16a34a', tense: '#eab308', conflict: '#dc2626', unknown: '#64748b' };
const labels: Record<StatusColor, string> = { stable: 'Stable', tense: 'Tense', conflict: 'Active Conflict', unknown: 'Status unavailable' };
const COUNTRY_CODE_BY_NAME = Object.fromEntries(COUNTRIES.map(country => [country.name.toLowerCase(), country.code]));

function getMapCountryCode(properties: any) {
    const alpha2 = properties?.ISO_A2 || properties?.ISO_A2_E;
    if (alpha2 && alpha2 !== '-99') return alpha2;
    const name = (properties?.ADMIN || properties?.NAME || properties?.name || '').toLowerCase();
    return COUNTRY_CODE_BY_NAME[name] || properties?.ADM0_A3 || properties?.ISO_A3 || '';
}

type NewsArticle = { title: string; url: string; source: string; published?: string };
type NewsEvent = { title: string; latest_published?: string; article_count: number; countries: string[]; articles: NewsArticle[] };
type SecurityEvent = {
    event_id: string;
    country_key: string;
    country: string;
    date: string;
    category: string;
    violence_type: number;
    headline: string;
    severity: 'low' | 'moderate' | 'high' | 'critical';
    source_count: number;
    best_deaths: number;
    latitude: number | null;
    longitude: number | null;
    location: string;
    details: Record<string, string | number | null>;
};
type AssessmentFactor = { key: string; label: string; count: number; items: SecurityEvent[] | NewsArticle[] };
type CountryAssessment = {
    status: DynamicStatus;
    evidence_confidence_pct: number;
    confidence_method: string;
    assessed_at: string;
    data_through: string;
    source_version: string;
    factors: AssessmentFactor[];
};

function getCountryFlag(countryKey: string) {
    const code = COUNTRY_CODE_BY_NAME[countryKey] || '';
    return [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

function EventList({ events, showCountries = true }: { events: NewsEvent[]; showCountries?: boolean }) {
    return <div className="eventList">
        {events.map((event, index) => <article className="eventItem" key={`${event.title}-${index}`}>
            <div className="eventTitleRow">
                <b>{event.title}</b>
                <span>{event.article_count} {event.article_count === 1 ? 'report' : 'reports'}</span>
            </div>
            {showCountries && event.countries.length > 0 && <p className="eventCountries">{event.countries.join(' · ')}</p>}
            <div className="eventSources">
                {event.articles.slice(0, 4).map((article, articleIndex) => <a key={`${article.url}-${articleIndex}`} href={article.url} target="_blank" rel="noopener noreferrer">
                    {article.source}{article.published ? ` · ${article.published}` : ''}
                </a>)}
            </div>
        </article>)}
    </div>;
}

function SecurityEventFeed({ events, loading, refreshing, error, animatedIds, onSelect }: {
    events: SecurityEvent[];
    loading: boolean;
    refreshing: boolean;
    error: boolean;
    animatedIds: Set<string>;
    onSelect: (event: SecurityEvent) => void;
}) {
    return <section className="liveEventFeed">
        <div className="feedHeading">
            <div><div className="eyebrow">UCDP CANDIDATE EVENTS</div><h2>Live security events</h2></div>
            <span className={refreshing ? 'feedPulse isRefreshing' : 'feedPulse'}>{refreshing ? 'Updating' : 'Latest'}</span>
        </div>
        {loading && events.length === 0 ? <p className="muted">Loading saved events…</p>
            : error ? <p className="muted">Event feed is temporarily unavailable.</p>
                : events.length === 0 ? <p className="muted">No recent events in the current dataset.</p>
                    : <div className="securityEventList">{events.map(event => <button
                        type="button"
                        className={`securityEvent severity-${event.severity}${animatedIds.has(event.event_id) ? ' isNew' : ''}`}
                        key={event.event_id}
                        onClick={() => onSelect(event)}
                    >
                        <span className="eventFlag" aria-label={`${event.country} flag`}>{getCountryFlag(event.country_key) || '◇'}</span>
                        <span className="eventMain">
                            <span className="eventMeta"><b>{event.country}</b><span>{event.category}</span></span>
                            <span className="eventHeadline">{event.headline}</span>
                            <span className="eventMeta eventFoot"><time dateTime={event.date}>{new Date(`${event.date}T00:00:00Z`).toLocaleDateString()}</time><span>{event.source_count} {event.source_count === 1 ? 'source' : 'sources'}</span></span>
                        </span>
                        <span className="severityMark" title={`Severity: ${event.severity}`} />
                    </button>)}</div>}
    </section>;
}

function App() {
    const [dashboardView, setDashboardView] = useState<'map' | 'regional'>('map');
    const [selected, setSelected] = useState<Country | null>(null);
    const [mapCenter, setMapCenter] = useState<[number, number]>([15, 52]);
    const [mapZoom, setMapZoom] = useState(1);
    const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
    const [eventFeedLoading, setEventFeedLoading] = useState(true);
    const [eventFeedRefreshing, setEventFeedRefreshing] = useState(false);
    const [eventFeedError, setEventFeedError] = useState(false);
    const [eventDataThrough, setEventDataThrough] = useState<string | null>(null);
    const [animatedEventIds, setAnimatedEventIds] = useState<Set<string>>(new Set());
    const [activeEvent, setActiveEvent] = useState<SecurityEvent | null>(null);
    const [countryAssessment, setCountryAssessment] = useState<CountryAssessment | null>(null);
    const [assessmentLoading, setAssessmentLoading] = useState(false);
    const [assessmentError, setAssessmentError] = useState(false);
    const [expandedFactor, setExpandedFactor] = useState<string | null>(null);
    const [countryStatuses, setCountryStatuses] = useState<Record<string, DynamicStatus>>({});
    const [statusDataThrough, setStatusDataThrough] = useState<string | null>(null);
    const [statusSourceVersion, setStatusSourceVersion] = useState<string | null>(null);
    const [statusUpdatedAt, setStatusUpdatedAt] = useState<string | null>(null);
    const [statusRefreshing, setStatusRefreshing] = useState(false);
    const [statusUnavailable, setStatusUnavailable] = useState(false);
    const [news, setNews] = useState<NewsArticle[]>([]);
    const [countryEvents, setCountryEvents] = useState<NewsEvent[]>([]);
    const [regionalEvents, setRegionalEvents] = useState<NewsEvent[]>([]);
    const [loadingNews, setLoadingNews] = useState(false);
    const [newsError, setNewsError] = useState(false);
    const [newsRefreshing, setNewsRefreshing] = useState(false);
    const [lastNewsRefresh, setLastNewsRefresh] = useState<string | null>(null);
    const [lastRegionalRefresh, setLastRegionalRefresh] = useState<string | null>(null);
    const [regionalLoading, setRegionalLoading] = useState(false);
    const [regionalRefreshing, setRegionalRefreshing] = useState(false);
    const [regionalError, setRegionalError] = useState(false);
    const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
    const [sourceConfigured, setSourceConfigured] = useState<boolean | null>(null);
    const newsRequestId = useRef(0);
    const newsRefreshTimer = useRef<number | null>(null);
    const overviewRequestId = useRef(0);
    const overviewRefreshTimer = useRef<number | null>(null);
    const assessmentRequestId = useRef(0);
    const eventIdsSeen = useRef<Set<string> | null>(null);
    const eventFeedTimer = useRef<number | null>(null);

    useEffect(() => {
        let stopped = false;
        async function loadSecurityEvents() {
            try {
                const response = await fetch(`${API}/events?limit=100`);
                if (!response.ok) throw new Error('Security event request failed');
                const data: { events?: SecurityEvent[]; data_through?: string | null; refreshing?: boolean } = await response.json();
                if (stopped) return;
                const events = data.events || [];
                const seen = eventIdsSeen.current;
                const newEvents = seen ? events.filter(event => !seen.has(event.event_id)) : [];
                eventIdsSeen.current = new Set(events.map(event => event.event_id));
                setSecurityEvents(events);
                setEventDataThrough(data.data_through ?? null);
                setEventFeedRefreshing(data.refreshing ?? false);
                setEventFeedError(false);
                if (newEvents.length) {
                    setAnimatedEventIds(new Set(newEvents.map(event => event.event_id)));
                    window.setTimeout(() => setAnimatedEventIds(new Set()), 1800);
                }
                setEventFeedLoading(false);
                eventFeedTimer.current = window.setTimeout(loadSecurityEvents, data.refreshing ? 5000 : 15 * 60 * 1000);
            } catch {
                if (stopped) return;
                setEventFeedError(true);
                setEventFeedLoading(false);
                eventFeedTimer.current = window.setTimeout(loadSecurityEvents, 60 * 1000);
            }
        }
        void loadSecurityEvents();
        return () => {
            stopped = true;
            if (eventFeedTimer.current !== null) window.clearTimeout(eventFeedTimer.current);
        };
    }, []);

    async function requestCountryAssessment(country: Country) {
        const requestId = ++assessmentRequestId.current;
        setAssessmentLoading(true);
        setAssessmentError(false);
        setCountryAssessment(null);
        setExpandedFactor(null);
        try {
            const response = await fetch(`${API}/status/${encodeURIComponent(country.name)}`);
            if (!response.ok) throw new Error('Status assessment request failed');
            const data = await response.json();
            if (!data.available) throw new Error('Status assessment is not available yet');
            if (requestId !== assessmentRequestId.current) return;
            setCountryAssessment(data as CountryAssessment);
        } catch {
            if (requestId === assessmentRequestId.current) setAssessmentError(true);
        } finally {
            if (requestId === assessmentRequestId.current) setAssessmentLoading(false);
        }
    }

    useEffect(() => {
        let stopped = false;
        let timer: number | undefined;

        async function loadStatuses() {
            try {
                const response = await fetch(`${API}/status`);
                if (!response.ok) throw new Error('Country status request failed');
                const data: {
                    statuses?: Record<string, { status: DynamicStatus }>;
                    data_through?: string | null;
                    source_version?: string | null;
                    updated_at?: string | null;
                    available?: boolean;
                    refreshing?: boolean;
                } = await response.json();
                if (stopped) return;
                const statusesByCode = Object.fromEntries(
                    COUNTRIES.flatMap(country => {
                        const status = data.statuses?.[country.name.toLowerCase()];
                        return status ? [[country.code, status.status]] : [];
                    }),
                );
                setCountryStatuses(statusesByCode);
                setStatusDataThrough(data.data_through ?? null);
                setStatusSourceVersion(data.source_version ?? null);
                setStatusUpdatedAt(data.updated_at ?? null);
                setStatusRefreshing(data.refreshing ?? false);
                setStatusUnavailable(!data.available && !data.refreshing);
                timer = window.setTimeout(loadStatuses, data.refreshing ? 5000 : 15 * 60 * 1000);
            } catch {
                if (stopped) return;
                setStatusUnavailable(true);
                timer = window.setTimeout(loadStatuses, 60 * 1000);
            }
        }

        void loadStatuses();
        return () => {
            stopped = true;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, []);

    async function requestNews(country: Country) {
        if (newsRefreshTimer.current !== null) {
            window.clearTimeout(newsRefreshTimer.current);
            newsRefreshTimer.current = null;
        }
        const requestId = ++newsRequestId.current;
        setLoadingNews(true);
        setNewsError(false);

        try {
            const response = await fetch(`${API}/news?country=${encodeURIComponent(country.name)}`);
            if (!response.ok) throw new Error('News request failed');
            const data: { news?: NewsArticle[]; events?: NewsEvent[]; source_configured?: boolean; refreshing?: boolean; updated_at?: string | null } = await response.json();
            if (requestId !== newsRequestId.current) return;
            setNews(data.news || []);
            setCountryEvents(data.events || []);
            setSourceConfigured(data.source_configured ?? true);
            setNewsRefreshing(data.refreshing ?? false);
            setLastNewsRefresh(data.updated_at ?? null);
            if (data.refreshing) {
                newsRefreshTimer.current = window.setTimeout(() => {
                    if (requestId === newsRequestId.current) void requestNews(country);
                }, 5000);
            }
        } catch {
            if (requestId === newsRequestId.current) {
                setNewsError(true);
                setNewsRefreshing(false);
            }
        } finally {
            if (requestId === newsRequestId.current) setLoadingNews(false);
        }
    }

    async function requestRegionalOverview() {
        if (overviewRefreshTimer.current !== null) {
            window.clearTimeout(overviewRefreshTimer.current);
            overviewRefreshTimer.current = null;
        }
        const requestId = ++overviewRequestId.current;
        setRegionalLoading(true);
        setRegionalError(false);
        try {
            const response = await fetch(`${API}/news/overview`);
            if (!response.ok) throw new Error('Regional news request failed');
            const data: { events?: NewsEvent[]; updated_at?: string | null; refreshing?: boolean } = await response.json();
            if (requestId !== overviewRequestId.current) return;
            setRegionalEvents(data.events || []);
            setLastRegionalRefresh(data.updated_at ?? null);
            setRegionalRefreshing(data.refreshing ?? false);
            if (data.refreshing) {
                overviewRefreshTimer.current = window.setTimeout(() => {
                    if (requestId === overviewRequestId.current) void requestRegionalOverview();
                }, 5000);
            }
        } catch {
            if (requestId === overviewRequestId.current) setRegionalError(true);
        } finally {
            if (requestId === overviewRequestId.current) setRegionalLoading(false);
        }
    }

    function changeView(view: 'map' | 'regional') {
        setDashboardView(view);
        if (view === 'regional') void requestRegionalOverview();
        else {
            overviewRequestId.current += 1;
            if (overviewRefreshTimer.current !== null) {
                window.clearTimeout(overviewRefreshTimer.current);
                overviewRefreshTimer.current = null;
            }
        }
    }

    function openCountry(code: string) {
        const country = COUNTRY_BY_CODE[code];
        if (!country) return;

        setSelected(country);
        setActiveEvent(null);
        setNews([]);
        setCountryEvents([]);
        setSourceConfigured(null);
        setNewsRefreshing(false);
        setLastNewsRefresh(null);
        void requestCountryAssessment(country);
        void requestNews(country);
    }

    function selectSecurityEvent(event: SecurityEvent) {
        const countryCode = COUNTRY_CODE_BY_NAME[event.country_key];
        if (countryCode) openCountry(countryCode);
        setDashboardView('map');
        setActiveEvent(event);
        if (event.latitude !== null && event.longitude !== null) {
            setMapCenter([event.longitude, event.latitude]);
            setMapZoom(4);
        }
    }

    function closeCountry() {
        newsRequestId.current += 1;
        assessmentRequestId.current += 1;
        if (newsRefreshTimer.current !== null) {
            window.clearTimeout(newsRefreshTimer.current);
            newsRefreshTimer.current = null;
        }
        overviewRequestId.current += 1;
        if (overviewRefreshTimer.current !== null) {
            window.clearTimeout(overviewRefreshTimer.current);
            overviewRefreshTimer.current = null;
        }
        setSelected(null);
        setActiveEvent(null);
        setNewsRefreshing(false);
    }

    return <div className="app">
        <header>
            <div><div className="eyebrow">LIVE SECURITY DASHBOARD</div><h1>Europe Security Monitor</h1></div>
            <nav className="viewTabs" aria-label="Dashboard view">
                <button type="button" aria-pressed={dashboardView === 'map'} onClick={() => changeView('map')}>Map</button>
                <button type="button" aria-pressed={dashboardView === 'regional'} onClick={() => changeView('regional')}>Regional overview</button>
            </nav>
            <div className="live"><span /> LIVE <small>{new Date().toUTCString()}</small></div>
        </header>
        <main>
            {dashboardView === 'map' ? <section className="mapWrap">
                <div className="legend">
                    <b>Status</b>
                    <span><i style={{ background: colors.stable }} />Stable</span>
                    <span><i style={{ background: colors.tense }} />Tense</span>
                    <span><i style={{ background: colors.conflict }} />Conflict</span>
                    <span><i style={{ background: colors.unknown }} />Unavailable</span>
                    <small className="statusAttribution">
                        {statusUnavailable ? 'UCDP status unavailable' : statusRefreshing && !statusDataThrough ? 'Loading UCDP status…' : `UCDP Candidate ${statusSourceVersion || ''}${statusDataThrough ? ` · events through ${statusDataThrough}` : ''}`}
                        {statusUpdatedAt ? ` · checked ${new Date(statusUpdatedAt).toLocaleString()}` : ''}
                    </small>
                </div>
                <div className="mapCountryLabel" aria-live="polite">{hoveredCountry || 'Hover over a country'}</div>
                <ComposableMap projection="geoMercator" projectionConfig={{ scale: 470 }}>
                    <ZoomableGroup
                        center={mapCenter}
                        zoom={mapZoom}
                        minZoom={1}
                        maxZoom={5}
                        onMoveEnd={({ coordinates, zoom }: { coordinates?: [number, number]; zoom?: number }) => {
                            if (coordinates) setMapCenter(coordinates);
                            if (zoom !== undefined) setMapZoom(zoom);
                        }}
                    >
                        <Geographies geography={GEO}>
                            {({ geographies }) => <>
                                {geographies.map((geo: any) => {
                                    const code = getMapCountryCode(geo.properties);
                                    const country = COUNTRY_BY_CODE[code];
                                    const status = countryStatuses[code] || 'unknown';
                                    const name = geo.properties?.ADMIN || geo.properties?.NAME || geo.properties?.name || 'Unknown country';
                                    return <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        fill={country ? colors[status] : '#334155'}
                                        stroke="#0f172a"
                                        strokeWidth={0.6}
                                        onClick={() => openCountry(code)}
                                        onMouseEnter={() => setHoveredCountry(name)}
                                        onMouseLeave={() => setHoveredCountry(null)}
                                        onFocus={() => setHoveredCountry(name)}
                                        onBlur={() => setHoveredCountry(null)}
                                        style={{ cursor: country ? 'pointer' : 'default' }}
                                    />;
                                })}
                                {geographies.map((geo: any) => {
                                    const properties = geo.properties;
                                    const code = getMapCountryCode(properties);
                                    const longitude = Number(properties?.LABEL_X);
                                    const latitude = Number(properties?.LABEL_Y);
                                    if (!code || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
                                    return <Marker key={`${geo.rsmKey}-label`} coordinates={[longitude, latitude]}>
                                        <text className="countryCodeLabel" textAnchor="middle" dominantBaseline="central">{code}</text>
                                    </Marker>;
                                })}
                            </>}
                        </Geographies>
                        {activeEvent?.latitude !== null && activeEvent?.longitude !== null && activeEvent && <Marker coordinates={[activeEvent.longitude, activeEvent.latitude]}>
                            <circle className={`eventMapMarker severity-${activeEvent.severity}`} r={5} />
                        </Marker>}
                    </ZoomableGroup>
                </ComposableMap>
                {activeEvent && <aside className="eventPopup" role="dialog" aria-label="Security event details">
                    <button type="button" className="close" aria-label="Close event details" onClick={() => setActiveEvent(null)}>×</button>
                    <div className="eyebrow">{getCountryFlag(activeEvent.country_key)} {activeEvent.country} · {activeEvent.category}</div>
                    <h2>{activeEvent.headline}</h2>
                    <p>{activeEvent.location} · {new Date(`${activeEvent.date}T00:00:00Z`).toLocaleDateString()}</p>
                    <p>{activeEvent.best_deaths} estimated deaths · {activeEvent.source_count} sources</p>
                    <details>
                        <summary>Event details</summary>
                        <p>{activeEvent.details.conflict || 'Organized violence event'}</p>
                        {activeEvent.details.actor_a && <p>Actor A: {activeEvent.details.actor_a}</p>}
                        {activeEvent.details.actor_b && <p>Actor B: {activeEvent.details.actor_b}</p>}
                        {activeEvent.details.source_headlines && <p>{activeEvent.details.source_headlines}</p>}
                    </details>
                </aside>}
            </section> : <section className="overviewWrap">
                <div className="overviewHeader">
                    <div><div className="eyebrow">EUROPE-WIDE COVERAGE</div><h2>Regional overview</h2></div>
                    <div className="overviewStatus">
                        <span>{regionalRefreshing ? 'Updating' : 'From saved news'}</span>
                        <time>{lastRegionalRefresh ? `Last refreshed ${new Date(lastRegionalRefresh).toLocaleString()}` : 'Not refreshed yet'}</time>
                    </div>
                </div>
                {regionalLoading && regionalEvents.length === 0 ? <p className="muted">Loading saved regional news…</p>
                    : regionalError ? <p className="muted">Regional news is temporarily unavailable.</p>
                        : regionalEvents.length ? <EventList events={regionalEvents} />
                            : regionalRefreshing ? <p className="loading">Waiting for the first background refresh…</p>
                                : <p className="muted">No regional news is currently saved.</p>}
            </section>}
            {dashboardView === 'map' && <aside className="panel">
                <SecurityEventFeed
                    events={securityEvents}
                    loading={eventFeedLoading}
                    refreshing={eventFeedRefreshing}
                    error={eventFeedError}
                    animatedIds={animatedEventIds}
                    onSelect={selectSecurityEvent}
                />
                {!selected ? <div className="empty"><div className="globe">◎</div><h2>Select a country</h2><p>Hover over a country to inspect its status, then click it for static country information and current news.</p></div> : <div className="country">
                    <button className="close" onClick={closeCountry}>×</button>
                    <div className="countryHead">
                        <div><div className="eyebrow">COUNTRY</div><h2>{selected.name}</h2></div>
                        {(() => {
                            const status: StatusColor = countryStatuses[selected.code] || 'unknown';
                            return <div className="badge" style={{ borderColor: colors[status], color: colors[status] }}><i style={{ background: colors[status] }} />{labels[status]}</div>;
                        })()}
                    </div>
                    <details className="whyStatus">
                        <summary>Why this status?</summary>
                        {assessmentLoading ? <p className="muted">Loading status evidence…</p>
                            : assessmentError ? <p className="muted">Status evidence is temporarily unavailable.</p>
                                : countryAssessment ? <>
                                    <div className="assessmentConfidence">
                                        <b>Evidence confidence: {countryAssessment.evidence_confidence_pct}%</b>
                                        <small>{countryAssessment.confidence_method}</small>
                                    </div>
                                    <p className="assessmentMeta">Assessed {new Date(countryAssessment.assessed_at).toLocaleString()} · UCDP events through {countryAssessment.data_through}</p>
                                    {countryAssessment.factors.map(factor => <details className="assessmentFactor" key={factor.key}>
                                        <summary>{factor.label} <b>{factor.count}</b></summary>
                                        {factor.key === 'news'
                                            ? (factor.items as NewsArticle[]).length ? (factor.items as NewsArticle[]).map((article, index) => <a className="assessmentEvidence" key={`${article.url}-${index}`} href={article.url} target="_blank" rel="noopener noreferrer">{article.title}<small>{article.source} · {article.published || 'recent'}</small></a>) : <p className="muted">No matching saved reports.</p>
                                            : (factor.items as SecurityEvent[]).length ? (factor.items as SecurityEvent[]).map(event => <button className="assessmentEvidence" type="button" key={event.event_id} onClick={() => selectSecurityEvent(event)}>{event.headline}<small>{event.category} · {event.date} · {event.source_count} sources</small></button>) : <p className="muted">No matching recorded events.</p>}
                                    </details>)}
                                    <p className="assessmentDisclaimer">Automated assessment from available data, not a prediction or a general safety rating.</p>
                                </> : <p className="muted">Status evidence is not available yet.</p>}
                    </details>
                    <section className="whyStatus">
                        <details>
                            <summary>Why this status?</summary>
                            {assessmentLoading ? <p className="muted">Loading status evidence…</p>
                                : assessmentError ? <p className="muted">Status evidence is temporarily unavailable.</p>
                                    : countryAssessment ? <>
                                        <div className="assessmentConfidence">
                                            <b>Evidence confidence: {countryAssessment.evidence_confidence_pct}%</b>
                                            <small>{countryAssessment.confidence_method}</small>
                                        </div>
                                        <p className="assessmentMeta">Assessed {new Date(countryAssessment.assessed_at).toLocaleString()} · UCDP events through {countryAssessment.data_through}</p>
                                        {countryAssessment.factors.map(factor => <details className="assessmentFactor" key={factor.key}>
                                            <summary>{factor.label} <b>{factor.count}</b></summary>
                                            {factor.key === 'news'
                                                ? (factor.items as NewsArticle[]).length ? (factor.items as NewsArticle[]).map((article, index) => <a className="assessmentEvidence" key={`${article.url}-${index}`} href={article.url} target="_blank" rel="noopener noreferrer">{article.title}<small>{article.source} · {article.published || 'recent'}</small></a>) : <p className="muted">No matching saved reports.</p>
                                                : (factor.items as SecurityEvent[]).length ? (factor.items as SecurityEvent[]).map(event => <button className="assessmentEvidence" type="button" key={event.event_id} onClick={() => selectSecurityEvent(event)}>{event.headline}<small>{event.category} · {event.date} · {event.source_count} sources</small></button>) : <p className="muted">No matching recorded events.</p>}
                                        </details>)}
                                        <p className="assessmentDisclaimer">Automated assessment from available data, not a prediction or a general safety rating.</p>
                                    </> : <p className="muted">Status evidence is not available yet.</p>}
                        </details>
                    </section>
                    <div className="grid">
                        <div><span>Capital</span><b>{selected.capital}</b></div>
                        <div><span>NATO</span><b>{selected.nato ? 'Yes' : 'No'}</b></div>
                        <div><span>EU</span><b>{selected.eu ? 'Yes' : 'No'}</b></div>
                    </div>
                    <h3>National leader</h3>
                    <div className="leaderInfo"><span>{selected.leaderTitle}</span><b>{selected.leaderName}</b></div>
                    <h3>Armed forces</h3>
                    <div className="armyInfo">
                        <div><span>Active personnel (approx.)</span><b>{selected.activePersonnel.toLocaleString()}</b></div>
                        <div><span>Reserve personnel (approx.)</span><b>{selected.reservePersonnel === null ? 'Not reported' : selected.reservePersonnel.toLocaleString()}</b></div>
                        <div><span>Military spending ({MILITARY_BUDGET_YEAR}, USD)</span><b>{selected.militaryBudgetUsdBillions === null ? 'Not reported' : `$${selected.militaryBudgetUsdBillions.toFixed(2)}B`}</b></div>
                    </div>
                    <p className="dataNote">Personnel: IISS Military Balance 2026. Spending: SIPRI 2025 data, released 2026. Leader snapshot: {STATIC_DATA_AS_OF}.</p>
                    <div className="newsHeading">
                        <h3>Latest news</h3>
                        <time dateTime={lastNewsRefresh || undefined}>
                            {lastNewsRefresh ? `Last refreshed ${new Date(lastNewsRefresh).toLocaleString()}` : 'Not refreshed yet'}
                        </time>
                    </div>
                    <div className="news">
                        {loadingNews && !news.length ? <div className="loading">Loading saved news…</div> : newsError ? <p className="muted">News is temporarily unavailable.</p> : sourceConfigured === false ? <p className="muted">Set NEWS_SOURCE_DOMAINS in backend/.env to enable news.</p> : <>
                            {countryEvents.length ? <EventList events={countryEvents} showCountries={false} /> : news.map((article, index) => <a key={`${article.url}-${index}`} href={article.url} target="_blank" rel="noopener noreferrer"><b>{article.title}</b><small>{article.source} · {article.published || 'recent'}</small></a>)}
                            {!news.length && newsRefreshing && <div className="loading">News refresh in progress…</div>}
                            {!news.length && !newsRefreshing && !loadingNews && <p className="muted">No current news articles returned.</p>}
                        </>}
                    </div>
                </div>}
            </aside>}
        </main>
        <footer><span>Country and military figures are static estimates.</span><span>UCDP organized-violence indicators are not an overall safety rating.</span></footer>
    </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
