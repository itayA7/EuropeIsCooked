import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { COUNTRIES, COUNTRY_BY_CODE, MILITARY_BUDGET_YEAR, STATIC_DATA_AS_OF, type Country } from './countries';
import {
    MapView, getMapCountryCode, severityColors, statusColors as colors, statusLabels as labels, zoomForFeature,
    type ColorMode, type CountryMetrics, type DynamicStatus, type MapLayers, type Severity, type StatusColor,
} from './MapView';
import './styles.css';

const GEO = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const API = 'http://localhost:8000/api';
const HOME_VIEW: { center: [number, number]; zoom: number } = { center: [15, 52], zoom: 1 };
const SEVERITIES: Severity[] = ['critical', 'high', 'moderate', 'low'];
const COLOR_MODES: { key: ColorMode; label: string }[] = [
    { key: 'status', label: 'Status' },
    { key: 'incidents', label: 'Incidents' },
    { key: 'spending', label: 'Spending' },
    { key: 'alliances', label: 'Alliances' },
];
const COUNTRY_CODE_BY_NAME = Object.fromEntries(COUNTRIES.map(country => [country.name.toLowerCase(), country.code]));

function rankOf(value: number | null, values: (number | null)[]) {
    if (value === null) return null;
    return values.filter(other => other !== null && other > value).length + 1;
}

/** Weekly incident counts for the 13 weeks ending at the dataset's latest date. */
const WEEKS = 13;

/** Index 0..12 of the week an event falls in, counting back from the dataset's latest date (12 = latest week). */
function weekIndex(date: string, dataThrough: string) {
    const ageDays = (Date.parse(`${dataThrough}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
    const index = WEEKS - 1 - Math.floor(ageDays / 7);
    return index >= 0 && index < WEEKS ? index : null;
}

function weekRangeLabel(index: number, dataThrough: string) {
    const end = new Date(Date.parse(`${dataThrough}T00:00:00Z`) - (WEEKS - 1 - index) * 7 * 86400000);
    const start = new Date(end.getTime() - 6 * 86400000);
    const format = (value: Date) => value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return `${format(start)} – ${format(end)}`;
}

/** Weekly incident counts for the 13 weeks ending at the dataset's latest date. */
function weeklyCounts(events: SecurityEvent[], dataThrough: string | null) {
    const weeks = new Array(WEEKS).fill(0);
    if (!dataThrough) return weeks;
    for (const event of events) {
        const index = weekIndex(event.date, dataThrough);
        if (index !== null) weeks[index] += 1;
    }
    return weeks;
}

function Timeline({ counts, dataThrough, selectedWeek, playing, onSelectWeek, onTogglePlay }: {
    counts: number[];
    dataThrough: string;
    selectedWeek: number | null;
    playing: boolean;
    onSelectWeek: (week: number | null) => void;
    onTogglePlay: () => void;
}) {
    const max = Math.max(1, ...counts);
    return <div className="timeline" role="group" aria-label="Incident timeline">
        <button type="button" className="timelinePlay" onClick={onTogglePlay} aria-label={playing ? 'Pause playback' : 'Play weekly playback'} title={playing ? 'Pause' : 'Play week by week'}>{playing ? '❚❚' : '▶'}</button>
        <div className="timelineBars">
            {counts.map((count, index) => <button
                key={index}
                type="button"
                className={`timelineBar${selectedWeek === index ? ' isSelected' : ''}${selectedWeek !== null && selectedWeek !== index ? ' isMuted' : ''}`}
                onClick={() => onSelectWeek(selectedWeek === index ? null : index)}
                aria-pressed={selectedWeek === index}
                aria-label={`${weekRangeLabel(index, dataThrough)}: ${count} incidents`}
                title={`${weekRangeLabel(index, dataThrough)} · ${count} incidents`}
            ><span style={{ height: `${count ? Math.max(8, (count / max) * 100) : 4}%` }} /></button>)}
        </div>
        <div className="timelineLabel">
            <b>{selectedWeek === null ? 'Last 13 weeks' : weekRangeLabel(selectedWeek, dataThrough)}</b>
            {selectedWeek === null ? <span>Click a week to filter</span> : <button type="button" onClick={() => onSelectWeek(null)}>Show all</button>}
        </div>
    </div>;
}

function Sparkline({ values }: { values: number[] }) {
    const max = Math.max(1, ...values);
    const width = 300;
    const height = 46;
    const step = width / values.length;
    return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Weekly incidents: ${values.join(', ')}`}>
        {values.map((value, index) => {
            const barHeight = value ? Math.max(3, (value / max) * (height - 4)) : 1.5;
            return <rect key={index} x={index * step + 2} y={height - barHeight} width={step - 4} height={barHeight} rx={1.5} className={value ? 'bar' : 'bar isEmpty'}>
                <title>{value} {value === 1 ? 'incident' : 'incidents'}</title>
            </rect>;
        })}
    </svg>;
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

function SecurityEventFeed({ events, loading, refreshing, error, animatedIds, onSelect, severityFilter, onToggleSeverity, severityCounts, scopeCountry, onClearScope }: {
    events: SecurityEvent[];
    loading: boolean;
    refreshing: boolean;
    error: boolean;
    animatedIds: Set<string>;
    onSelect: (event: SecurityEvent) => void;
    severityFilter: Set<Severity>;
    onToggleSeverity: (severity: Severity) => void;
    severityCounts: Record<Severity, number>;
    scopeCountry: Country | null;
    onClearScope: () => void;
}) {
    return <section className="liveEventFeed">
        <div className="feedHeading">
            <div><div className="eyebrow">UCDP CANDIDATE EVENTS</div><h2>Live security events</h2></div>
            <span className={refreshing ? 'feedPulse isRefreshing' : 'feedPulse'}>{refreshing ? 'Updating' : 'Latest'}</span>
        </div>
        <div className="severityChips" role="group" aria-label="Filter events by severity">
            {SEVERITIES.map(severity => <button
                key={severity}
                type="button"
                aria-pressed={severityFilter.has(severity)}
                onClick={() => onToggleSeverity(severity)}
                style={{ '--chip': severityColors[severity] } as React.CSSProperties}
            ><i />{severity}<small>{severityCounts[severity]}</small></button>)}
        </div>
        {scopeCountry && <div className="feedScope">Showing {scopeCountry.name} only <button type="button" onClick={onClearScope}>Show all Europe</button></div>}
        {loading && events.length === 0 ? <p className="muted">Loading saved events…</p>
            : error ? <p className="muted">Event feed is temporarily unavailable.</p>
                : events.length === 0 ? <p className="muted">No events match the current filters.</p>
                    : <div className="securityEventList">{events.slice(0, 150).map(event => <button
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
    const [mapCenter, setMapCenter] = useState<[number, number]>(HOME_VIEW.center);
    const [mapZoom, setMapZoom] = useState(HOME_VIEW.zoom);
    const [geoData, setGeoData] = useState<any>(null);
    const [geoError, setGeoError] = useState(false);
    const [colorMode, setColorMode] = useState<ColorMode>('status');
    const [layers, setLayers] = useState<MapLayers>({ incidents: true, capitals: true, labels: true });
    const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(new Set(SEVERITIES));
    const [countryMetrics, setCountryMetrics] = useState<Record<string, CountryMetrics>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchIndex, setSearchIndex] = useState(0);
    const [clock, setClock] = useState(() => new Date());
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
    const [playing, setPlaying] = useState(false);
    const flyAnimation = useRef<number | null>(null);
    const viewRef = useRef({ center: HOME_VIEW.center, zoom: HOME_VIEW.zoom });
    const searchInput = useRef<HTMLInputElement>(null);
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
    const [sourceConfigured, setSourceConfigured] = useState<boolean | null>(null);
    const newsRequestId = useRef(0);
    const newsRefreshTimer = useRef<number | null>(null);
    const overviewRequestId = useRef(0);
    const overviewRefreshTimer = useRef<number | null>(null);
    const assessmentRequestId = useRef(0);
    const eventIdsSeen = useRef<Set<string> | null>(null);
    const eventFeedTimer = useRef<number | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setClock(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        let stopped = false;
        fetch(GEO)
            .then(response => {
                if (!response.ok) throw new Error('Map geometry request failed');
                return response.json();
            })
            .then(data => { if (!stopped) setGeoData(data); })
            .catch(() => { if (!stopped) setGeoError(true); });
        return () => { stopped = true; };
    }, []);

    useEffect(() => {
        let stopped = false;
        async function loadSecurityEvents() {
            try {
                const response = await fetch(`${API}/events?limit=500`);
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
                    statuses?: Record<string, CountryMetrics & { status: DynamicStatus }>;
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
                setCountryMetrics(data.statuses ?? {});
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

    function flyTo(center: [number, number], zoom: number) {
        if (flyAnimation.current !== null) cancelAnimationFrame(flyAnimation.current);
        const start = viewRef.current;
        const startedAt = performance.now();
        const duration = 750;
        const step = (now: number) => {
            const t = Math.min(1, (now - startedAt) / duration);
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const nextCenter: [number, number] = [
                start.center[0] + (center[0] - start.center[0]) * eased,
                start.center[1] + (center[1] - start.center[1]) * eased,
            ];
            // Interpolate zoom geometrically so zooming in and out feel equally fast.
            const nextZoom = start.zoom * Math.pow(zoom / start.zoom, eased);
            viewRef.current = { center: nextCenter, zoom: nextZoom };
            setMapCenter(nextCenter);
            setMapZoom(nextZoom);
            flyAnimation.current = t < 1 ? requestAnimationFrame(step) : null;
        };
        flyAnimation.current = requestAnimationFrame(step);
    }

    function zoomBy(factor: number) {
        flyTo(viewRef.current.center, Math.min(10, Math.max(1, viewRef.current.zoom * factor)));
    }

    function flyToCountry(code: string) {
        const country = COUNTRY_BY_CODE[code];
        const feature = geoData?.features?.find((candidate: any) => getMapCountryCode(candidate.properties) === code);
        const labelX = Number(feature?.properties?.LABEL_X);
        const labelY = Number(feature?.properties?.LABEL_Y);
        const center: [number, number] | null = Number.isFinite(labelX) && Number.isFinite(labelY) ? [labelX, labelY] : country?.capitalCoords ?? null;
        if (center) flyTo(center, zoomForFeature(feature));
    }

    function openCountry(code: string, options: { fly?: boolean } = {}) {
        const country = COUNTRY_BY_CODE[code];
        if (!country) return;

        setSelected(country);
        setActiveEvent(null);
        setNews([]);
        setCountryEvents([]);
        setSourceConfigured(null);
        setNewsRefreshing(false);
        setLastNewsRefresh(null);
        if (options.fly !== false) flyToCountry(code);
        if (window.location.hash !== `#${code}`) window.history.replaceState(null, '', `#${code}`);
        void requestCountryAssessment(country);
        void requestNews(country);
    }

    function selectSecurityEvent(event: SecurityEvent) {
        const countryCode = COUNTRY_CODE_BY_NAME[event.country_key];
        if (countryCode && countryCode !== selected?.code) openCountry(countryCode, { fly: false });
        setDashboardView('map');
        setActiveEvent(event);
        if (event.latitude !== null && event.longitude !== null) flyTo([event.longitude, event.latitude], Math.max(4, viewRef.current.zoom));
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
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    function toggleSeverity(severity: Severity) {
        setSeverityFilter(current => {
            const next = new Set(current);
            if (next.has(severity)) next.delete(severity);
            else next.add(severity);
            return next.size ? next : new Set(SEVERITIES);
        });
    }

    const severityCounts = useMemo(() => {
        const counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
        for (const event of securityEvents) {
            if (!selected || event.country_key === selected.name.toLowerCase()) counts[event.severity] += 1;
        }
        return counts;
    }, [securityEvents, selected]);
    const severityFilteredEvents = useMemo(
        () => securityEvents.filter(event => severityFilter.has(event.severity)),
        [securityEvents, severityFilter],
    );
    const timelineCounts = useMemo(() => weeklyCounts(severityFilteredEvents, eventDataThrough), [severityFilteredEvents, eventDataThrough]);
    const filteredEvents = useMemo(
        () => selectedWeek === null || !eventDataThrough
            ? severityFilteredEvents
            : severityFilteredEvents.filter(event => weekIndex(event.date, eventDataThrough) === selectedWeek),
        [severityFilteredEvents, selectedWeek, eventDataThrough],
    );
    const feedEvents = useMemo(
        () => selected ? filteredEvents.filter(event => event.country_key === selected.name.toLowerCase()) : filteredEvents,
        [filteredEvents, selected],
    );
    const summary = useMemo(() => {
        const statusCounts: Record<StatusColor, number> = { stable: 0, tense: 0, conflict: 0, unknown: 0 };
        for (const country of COUNTRIES) statusCounts[countryStatuses[country.code] || 'unknown'] += 1;
        const incidents = Object.values(countryMetrics).reduce((total, metric) => total + (metric.recent_events || 0), 0);
        const fatalities = securityEvents.reduce((total, event) => total + event.best_deaths, 0);
        return { statusCounts, incidents, fatalities };
    }, [countryStatuses, countryMetrics, securityEvents]);
    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return [];
        return COUNTRIES
            .filter(country => country.name.toLowerCase().includes(query) || country.code.toLowerCase() === query || country.capital.toLowerCase().includes(query))
            .sort((a, b) => Number(!a.name.toLowerCase().startsWith(query)) - Number(!b.name.toLowerCase().startsWith(query)) || a.name.localeCompare(b.name))
            .slice(0, 7);
    }, [searchQuery]);
    const countryInsights = useMemo(() => {
        if (!selected) return null;
        const key = selected.name.toLowerCase();
        const countryEventsList = securityEvents.filter(event => event.country_key === key);
        return {
            weekly: weeklyCounts(countryEventsList, eventDataThrough),
            spendingRank: rankOf(selected.militaryBudgetUsdBillions, COUNTRIES.map(country => country.militaryBudgetUsdBillions)),
            personnelRank: rankOf(selected.activePersonnel, COUNTRIES.map(country => country.activePersonnel)),
            spendingPerSoldier: selected.militaryBudgetUsdBillions && selected.activePersonnel
                ? (selected.militaryBudgetUsdBillions * 1e9) / selected.activePersonnel
                : null,
            deaths: countryEventsList.reduce((total, event) => total + event.best_deaths, 0),
        };
    }, [selected, securityEvents, eventDataThrough]);

    function chooseSearchResult(country: Country) {
        setSearchQuery('');
        setSearchOpen(false);
        setSearchIndex(0);
        searchInput.current?.blur();
        setDashboardView('map');
        openCountry(country.code);
    }

    // Deep link: open the country named in the URL hash once the map geometry is ready.
    useEffect(() => {
        if (!geoData) return;
        const fromHash = () => {
            const code = window.location.hash.slice(1).toUpperCase();
            if (COUNTRY_BY_CODE[code]) openCountry(code);
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
        return () => window.removeEventListener('hashchange', fromHash);
    }, [geoData]);

    useEffect(() => {
        if (!playing) return;
        if (selectedWeek === WEEKS - 1) {
            setPlaying(false);
            return;
        }
        const timer = window.setTimeout(() => setSelectedWeek(week => (week ?? -1) + 1), 900);
        return () => window.clearTimeout(timer);
    }, [playing, selectedWeek]);

    function togglePlayback() {
        if (playing) setPlaying(false);
        else {
            if (selectedWeek === null || selectedWeek === WEEKS - 1) setSelectedWeek(0);
            setPlaying(true);
        }
    }

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (typing) return;
            if (event.key === '/') {
                event.preventDefault();
                searchInput.current?.focus();
            } else if (event.key === 'Escape') {
                if (activeEvent) setActiveEvent(null);
                else if (selected) closeCountry();
                else flyTo(HOME_VIEW.center, HOME_VIEW.zoom);
            } else if (dashboardView === 'map' && (event.key === '+' || event.key === '=')) zoomBy(1.6);
            else if (dashboardView === 'map' && event.key === '-') zoomBy(1 / 1.6);
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    useEffect(() => () => { if (flyAnimation.current !== null) cancelAnimationFrame(flyAnimation.current); }, []);

    return <div className="app">
        <header>
            <div><div className="eyebrow">LIVE SECURITY DASHBOARD</div><h1>Europe Security Monitor</h1></div>
            <div className="headerTools">
                <div className="countrySearch">
                    <input
                        ref={searchInput}
                        type="search"
                        role="combobox"
                        aria-expanded={searchOpen && searchResults.length > 0}
                        aria-controls="countrySearchResults"
                        aria-autocomplete="list"
                        placeholder="Search country or capital…"
                        aria-label="Search countries"
                        value={searchQuery}
                        onChange={event => { setSearchQuery(event.target.value); setSearchOpen(true); setSearchIndex(0); }}
                        onFocus={() => setSearchOpen(true)}
                        onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                        onKeyDown={event => {
                            if (event.key === 'ArrowDown') { event.preventDefault(); setSearchIndex(index => Math.min(index + 1, searchResults.length - 1)); }
                            else if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => Math.max(index - 1, 0)); }
                            else if (event.key === 'Enter' && searchResults[searchIndex]) chooseSearchResult(searchResults[searchIndex]);
                            else if (event.key === 'Escape') { setSearchQuery(''); event.currentTarget.blur(); }
                        }}
                    />
                    <kbd>/</kbd>
                    {searchOpen && searchResults.length > 0 && <ul role="listbox" id="countrySearchResults">
                        {searchResults.map((country, index) => {
                            const status: StatusColor = countryStatuses[country.code] || 'unknown';
                            return <li
                                key={country.code}
                                role="option"
                                aria-selected={index === searchIndex}
                                onMouseDown={event => { event.preventDefault(); chooseSearchResult(country); }}
                                onMouseEnter={() => setSearchIndex(index)}
                            >
                                <span>{getCountryFlag(country.name.toLowerCase())} {country.name}<small>{country.capital}</small></span>
                                <i style={{ background: colors[status] }} title={labels[status]} />
                            </li>;
                        })}
                    </ul>}
                </div>
                <nav className="viewTabs" aria-label="Dashboard view">
                    <button type="button" aria-pressed={dashboardView === 'map'} onClick={() => changeView('map')}>Map</button>
                    <button type="button" aria-pressed={dashboardView === 'regional'} onClick={() => changeView('regional')}>Regional overview</button>
                </nav>
            </div>
            <div className="live"><span /> LIVE <small>{clock.toUTCString().replace('GMT', 'UTC')}</small></div>
        </header>
        <main>
            {dashboardView === 'map' ? <section className="mapWrap">
                <div className="statStrip" aria-label="Europe summary">
                    <div><b style={{ color: colors.conflict }}>{summary.statusCounts.conflict}</b><span>Conflict</span></div>
                    <div><b style={{ color: colors.tense }}>{summary.statusCounts.tense}</b><span>Tense</span></div>
                    <div><b style={{ color: colors.stable }}>{summary.statusCounts.stable}</b><span>Stable</span></div>
                    <div><b>{summary.incidents.toLocaleString()}</b><span>Incidents · 90d</span></div>
                    <div><b>{summary.fatalities.toLocaleString()}</b><span>Est. deaths · 90d</span></div>
                </div>
                <div className="mapControls">
                    <div className="segmented" role="group" aria-label="Colour countries by">
                        {COLOR_MODES.map(mode => <button key={mode.key} type="button" aria-pressed={colorMode === mode.key} onClick={() => setColorMode(mode.key)}>{mode.label}</button>)}
                    </div>
                    <div className="layerToggles" role="group" aria-label="Map layers">
                        {(Object.keys(layers) as (keyof MapLayers)[]).map(layer => <label key={layer}>
                            <input type="checkbox" checked={layers[layer]} onChange={() => setLayers(current => ({ ...current, [layer]: !current[layer] }))} />
                            {layer === 'incidents' ? 'Incidents' : layer === 'capitals' ? 'Capitals' : 'Labels'}
                        </label>)}
                    </div>
                    <small className="statusAttribution">
                        {statusUnavailable ? 'UCDP status unavailable' : statusRefreshing && !statusDataThrough ? 'Loading UCDP status…' : `UCDP Candidate ${statusSourceVersion || ''}${statusDataThrough ? ` · events through ${statusDataThrough}` : ''}`}
                        {statusUpdatedAt ? ` · checked ${new Date(statusUpdatedAt).toLocaleString()}` : ''}
                    </small>
                </div>
                {eventDataThrough && <Timeline
                    counts={timelineCounts}
                    dataThrough={eventDataThrough}
                    selectedWeek={selectedWeek}
                    playing={playing}
                    onSelectWeek={week => { setPlaying(false); setSelectedWeek(week); }}
                    onTogglePlay={togglePlayback}
                />}
                <div className="zoomControls">
                    <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1.6)}>+</button>
                    <button type="button" aria-label="Zoom out" title="Zoom out (−)" onClick={() => zoomBy(1 / 1.6)}>−</button>
                    <button type="button" aria-label="Reset view" title="Reset view (Esc)" onClick={() => flyTo(HOME_VIEW.center, HOME_VIEW.zoom)}>⌂</button>
                    {selected && <button type="button" aria-label={`Focus ${selected.name}`} title={`Focus ${selected.name}`} onClick={() => flyToCountry(selected.code)}>◎</button>}
                </div>
                {geoError && <p className="mapError">Map outlines could not be loaded. Check your connection and reload.</p>}
                {!geoData && !geoError && <p className="mapError">Loading map…</p>}
                <MapView
                    geoData={geoData}
                    center={mapCenter}
                    zoom={mapZoom}
                    onMoveEnd={(center, zoom) => {
                        if (flyAnimation.current !== null) return;
                        viewRef.current = { center, zoom };
                        setMapCenter(center);
                        setMapZoom(zoom);
                    }}
                    colorMode={colorMode}
                    layers={layers}
                    statuses={countryStatuses}
                    metrics={countryMetrics}
                    events={filteredEvents}
                    activeEventId={activeEvent?.event_id ?? null}
                    selectedCode={selected?.code ?? null}
                    onCountryClick={code => openCountry(code)}
                    onEventClick={event => selectSecurityEvent(event as SecurityEvent)}
                />
                {activeEvent && <aside className="eventPopup" role="dialog" aria-label="Security event details" style={{ borderTopColor: severityColors[activeEvent.severity] }}>
                    <button type="button" className="close" aria-label="Close event details" onClick={() => setActiveEvent(null)}>×</button>
                    <div className="eyebrow">{getCountryFlag(activeEvent.country_key)} {activeEvent.country} · {activeEvent.category}</div>
                    <h2>{activeEvent.headline}</h2>
                    <p>{activeEvent.location} · {new Date(`${activeEvent.date}T00:00:00Z`).toLocaleDateString()}</p>
                    <div className="popupStats">
                        <div><b style={{ color: severityColors[activeEvent.severity] }}>{activeEvent.severity}</b><span>Severity</span></div>
                        <div><b>{activeEvent.best_deaths}</b><span>Est. deaths</span></div>
                        <div><b>{activeEvent.source_count}</b><span>{activeEvent.source_count === 1 ? 'Source' : 'Sources'}</span></div>
                    </div>
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
                {!selected ? <div className="empty"><div className="globe">◎</div><h2>Select a country</h2><p>Hover the map for a quick look, click a country for details, or press <kbd>/</kbd> to search.</p></div> : <div className="country">
                    <button type="button" className="close" aria-label="Close country" onClick={closeCountry}>×</button>
                    <div className="countryHead">
                        <div><div className="eyebrow">COUNTRY · {selected.code}</div><h2><span className="countryFlag">{getCountryFlag(selected.name.toLowerCase())}</span>{selected.name}</h2></div>
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
                    <div className="grid">
                        <div><span>Capital</span><b>{selected.capital}</b></div>
                        <div><span>NATO</span><b>{selected.nato ? 'Yes' : 'No'}</b></div>
                        <div><span>EU</span><b>{selected.eu ? 'Yes' : 'No'}</b></div>
                    </div>
                    {countryInsights && <>
                        <h3>Incident trend · 13 weeks</h3>
                        <div className="trendCard">
                            <Sparkline values={countryInsights.weekly} />
                            <div className="trendFoot">
                                <span>{countryInsights.weekly.reduce((total, value) => total + value, 0)} incidents · {countryInsights.deaths.toLocaleString()} est. deaths</span>
                                <span>{eventDataThrough ? `to ${eventDataThrough}` : ''}</span>
                            </div>
                        </div>
                        <div className="rankTiles">
                            <div><span>Spending rank</span><b>{countryInsights.spendingRank ? `#${countryInsights.spendingRank}` : '—'}<small>of {COUNTRIES.length}</small></b></div>
                            <div><span>Personnel rank</span><b>#{countryInsights.personnelRank}<small>of {COUNTRIES.length}</small></b></div>
                            <div><span>Spend / soldier</span><b>{countryInsights.spendingPerSoldier ? `$${Math.round(countryInsights.spendingPerSoldier / 1000).toLocaleString()}k` : '—'}</b></div>
                        </div>
                    </>}
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
                <SecurityEventFeed
                    events={feedEvents}
                    loading={eventFeedLoading}
                    refreshing={eventFeedRefreshing}
                    error={eventFeedError}
                    animatedIds={animatedEventIds}
                    onSelect={selectSecurityEvent}
                    severityFilter={severityFilter}
                    onToggleSeverity={toggleSeverity}
                    severityCounts={severityCounts}
                    scopeCountry={selected}
                    onClearScope={closeCountry}
                />
            </aside>}
        </main>
        <footer><span>Country and military figures are static estimates.</span><span>UCDP organized-violence indicators are not an overall safety rating.</span></footer>
    </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
