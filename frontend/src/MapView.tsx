import React, { useMemo, useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography, Graticule, Marker, Sphere, ZoomableGroup, useZoomPanContext } from 'react-simple-maps';
import { scaleLog, scaleSqrt } from 'd3-scale';
import { COUNTRIES, COUNTRY_BY_CODE, type Country } from './countries';

export type DynamicStatus = 'stable' | 'tense' | 'conflict';
export type StatusColor = DynamicStatus | 'unknown';
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type ColorMode = 'status' | 'incidents' | 'spending' | 'alliances';
export type MapLayers = { incidents: boolean; capitals: boolean; labels: boolean };
export type CountryMetrics = { recent_events: number; state_based_events: number; state_battle_deaths_this_year: number };
export type MapEvent = {
    event_id: string;
    country: string;
    country_key: string;
    headline: string;
    severity: Severity;
    best_deaths: number;
    date: string;
    latitude: number | null;
    longitude: number | null;
};

export const statusColors: Record<StatusColor, string> = { stable: '#16a34a', tense: '#eab308', conflict: '#dc2626', unknown: '#64748b' };
export const statusLabels: Record<StatusColor, string> = { stable: 'Stable', tense: 'Tense', conflict: 'Active Conflict', unknown: 'Status unavailable' };
export const severityColors: Record<Severity, string> = { low: '#22c55e', moderate: '#eab308', high: '#f97316', critical: '#ef4444' };
const severityRadius: Record<Severity, number> = { low: 2.2, moderate: 3, high: 4, critical: 5.5 };
const allianceColors = { both: '#3b82f6', nato: '#8b5cf6', eu: '#14b8a6', neither: '#64748b' };
const allianceLabels = { both: 'NATO + EU', nato: 'NATO only', eu: 'EU only', neither: 'Neither' };
const OUTSIDE_FILL = '#1e293b';
const NO_DATA_FILL = '#475569';

const COUNTRY_CODE_BY_NAME = Object.fromEntries(COUNTRIES.map(country => [country.name.toLowerCase(), country.code]));
const spendingScale = scaleLog<string>().domain([0.1, 5, 200]).range(['#0c2d48', '#2563eb', '#a5f3fc']).clamp(true);
const maxIncidents = (metrics: Record<string, CountryMetrics>) => Math.max(1, ...Object.values(metrics).map(metric => metric.recent_events));

export function getMapCountryCode(properties: any) {
    const alpha2 = properties?.ISO_A2 || properties?.ISO_A2_E;
    if (alpha2 && alpha2 !== '-99') return alpha2;
    const name = (properties?.ADMIN || properties?.NAME || properties?.name || '').toLowerCase();
    return COUNTRY_CODE_BY_NAME[name] || properties?.ADM0_A3 || properties?.ISO_A3 || '';
}

export function getFlag(code: string) {
    return code.length === 2 ? [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('') : '';
}

function allianceKey(country: Country) {
    return country.nato && country.eu ? 'both' : country.nato ? 'nato' : country.eu ? 'eu' : 'neither';
}

/** Markers live inside the zoom transform, so divide by the zoom level to keep them a readable on-screen size. */
function useCounterScale(exponent = 0.85) {
    const { k } = useZoomPanContext();
    return 1 / Math.pow(k, exponent);
}

function EventMarkers({ events, activeId, onSelect, onHover }: {
    events: MapEvent[];
    activeId: string | null;
    onSelect: (event: MapEvent) => void;
    onHover: (event: MapEvent | null) => void;
}) {
    const scale = useCounterScale();
    const ordered = useMemo(() => {
        const rank: Record<Severity, number> = { low: 0, moderate: 1, high: 2, critical: 3 };
        return events.filter(event => event.latitude !== null && event.longitude !== null).sort((a, b) => rank[a.severity] - rank[b.severity]);
    }, [events]);
    return <g className="eventLayer">
        {ordered.map(event => {
            const r = severityRadius[event.severity] * scale;
            const active = event.event_id === activeId;
            return <Marker key={event.event_id} coordinates={[event.longitude!, event.latitude!]}>
                <g
                    className={`incident severity-${event.severity}${active ? ' isActive' : ''}`}
                    onClick={clickEvent => { clickEvent.stopPropagation(); onSelect(event); }}
                    onMouseEnter={() => onHover(event)}
                    onMouseLeave={() => onHover(null)}
                >
                    {(event.severity === 'critical' || active) && <circle className="incidentPulse" r={r} style={{ stroke: severityColors[event.severity] }} />}
                    <circle r={active ? r * 1.6 : r} fill={severityColors[event.severity]} strokeWidth={0.6 * scale} />
                </g>
            </Marker>;
        })}
    </g>;
}

function CapitalMarkers({ selectedCode }: { selectedCode: string | null }) {
    const scale = useCounterScale();
    return <g className="capitalLayer">
        {COUNTRIES.map(country => <Marker key={country.code} coordinates={country.capitalCoords}>
            <rect
                x={-2 * scale} y={-2 * scale} width={4 * scale} height={4 * scale}
                transform="rotate(45)"
                className={country.code === selectedCode ? 'capital isSelected' : 'capital'}
                strokeWidth={0.7 * scale}
            />
            {country.code === selectedCode && <text className="capitalLabel" y={-6 * scale} style={{ fontSize: 9 * scale, strokeWidth: 2.5 * scale }} textAnchor="middle">{country.capital}</text>}
        </Marker>)}
    </g>;
}

function CountryLabels({ features }: { features: any[] }) {
    const scale = useCounterScale(0.6);
    return <g>
        {features.map(feature => {
            const code = getMapCountryCode(feature.properties);
            const longitude = Number(feature.properties?.LABEL_X);
            const latitude = Number(feature.properties?.LABEL_Y);
            if (!COUNTRY_BY_CODE[code] || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
            return <Marker key={`${code}-label`} coordinates={[longitude, latitude]}>
                <text className="countryCodeLabel" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 7 * scale, strokeWidth: 2 * scale }}>{code}</text>
            </Marker>;
        })}
    </g>;
}

type Hover = { kind: 'country'; code: string; name: string } | { kind: 'event'; event: MapEvent };

export function MapView(props: {
    geoData: any;
    center: [number, number];
    zoom: number;
    onMoveEnd: (center: [number, number], zoom: number) => void;
    colorMode: ColorMode;
    layers: MapLayers;
    statuses: Record<string, DynamicStatus>;
    metrics: Record<string, CountryMetrics>;
    events: MapEvent[];
    activeEventId: string | null;
    selectedCode: string | null;
    onCountryClick: (code: string) => void;
    onEventClick: (event: MapEvent) => void;
}) {
    const { geoData, colorMode, layers, statuses, metrics, selectedCode } = props;
    const [hover, setHover] = useState<Hover | null>(null);
    const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const incidentScale = useMemo(() => scaleSqrt<string>().domain([0, maxIncidents(metrics)]).range(['#1f2937', '#ef4444']), [metrics]);
    const eventsByCountry = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const event of props.events) counts[event.country_key] = (counts[event.country_key] || 0) + 1;
        return counts;
    }, [props.events]);

    function fillFor(code: string) {
        const country = COUNTRY_BY_CODE[code];
        if (!country) return OUTSIDE_FILL;
        if (colorMode === 'status') return statusColors[statuses[code] || 'unknown'];
        if (colorMode === 'alliances') return allianceColors[allianceKey(country)];
        if (colorMode === 'spending') return country.militaryBudgetUsdBillions ? spendingScale(country.militaryBudgetUsdBillions) : NO_DATA_FILL;
        const metric = metrics[country.name.toLowerCase()];
        return metric ? incidentScale(metric.recent_events) : NO_DATA_FILL;
    }

    const features = geoData?.features ?? [];
    const hoveredCountry = hover?.kind === 'country' ? COUNTRY_BY_CODE[hover.code] : undefined;

    return <div
        className="mapCanvas"
        ref={wrapRef}
        onMouseMove={mouseEvent => {
            const bounds = wrapRef.current?.getBoundingClientRect();
            if (bounds) setPointer({ x: mouseEvent.clientX - bounds.left, y: mouseEvent.clientY - bounds.top });
        }}
        onMouseLeave={() => { setHover(null); setPointer(null); }}
    >
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 470 }}>
            <defs>
                <radialGradient id="oceanGlow" cx="55%" cy="40%" r="75%">
                    <stop offset="0%" stopColor="#0b2a45" />
                    <stop offset="100%" stopColor="#040b17" />
                </radialGradient>
                <filter id="selectedGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#7dd3fc" floodOpacity="0.85" />
                </filter>
            </defs>
            <ZoomableGroup
                center={props.center}
                zoom={props.zoom}
                minZoom={1}
                maxZoom={10}
                onMoveEnd={({ coordinates, zoom }) => {
                    if (coordinates && zoom !== undefined) props.onMoveEnd(coordinates, zoom);
                }}
            >
                <Sphere id="mapSphere" fill="url(#oceanGlow)" stroke="#1e3a5f" strokeWidth={0.5} />
                <Graticule stroke="#13304d" strokeWidth={0.4} step={[5, 5]} />
                {geoData && <Geographies geography={geoData}>
                    {({ geographies }) => geographies.map((geo: any) => {
                        const code = getMapCountryCode(geo.properties);
                        const monitored = Boolean(COUNTRY_BY_CODE[code]);
                        const selected = code === selectedCode;
                        const name = geo.properties?.ADMIN || geo.properties?.NAME || 'Unknown country';
                        return <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={fillFor(code)}
                            className={`countryShape${monitored ? ' isMonitored' : ''}${selected ? ' isSelected' : ''}${selectedCode && !selected && monitored ? ' isDimmed' : ''}`}
                            stroke={selected ? '#e0f2fe' : '#0b1220'}
                            strokeWidth={selected ? 1.4 : 0.5}
                            filter={selected ? 'url(#selectedGlow)' : undefined}
                            tabIndex={monitored ? 0 : -1}
                            aria-label={monitored ? name : undefined}
                            onClick={() => monitored && props.onCountryClick(code)}
                            onKeyDown={keyEvent => { if (monitored && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) props.onCountryClick(code); }}
                            onMouseEnter={() => setHover({ kind: 'country', code, name })}
                            onMouseLeave={() => setHover(null)}
                        />;
                    })}
                </Geographies>}
                {/* Re-draw the selected outline on top so neighbours don't cover its stroke. */}
                {geoData && selectedCode && <Geographies geography={geoData}>
                    {({ geographies }) => geographies.filter((geo: any) => getMapCountryCode(geo.properties) === selectedCode).map((geo: any) =>
                        <Geography key={`${geo.rsmKey}-outline`} geography={geo} fill="none" stroke="#e0f2fe" strokeWidth={1.4} className="selectedOutline" />)}
                </Geographies>}
                {layers.labels && <CountryLabels features={features} />}
                {layers.capitals && <CapitalMarkers selectedCode={selectedCode} />}
                {layers.incidents && <EventMarkers
                    events={props.events}
                    activeId={props.activeEventId}
                    onSelect={props.onEventClick}
                    onHover={event => setHover(event ? { kind: 'event', event } : null)}
                />}
            </ZoomableGroup>
        </ComposableMap>
        <MapLegend colorMode={colorMode} metrics={metrics} />
        {hover && pointer && <div
            className="mapTooltip"
            style={{ left: pointer.x, top: pointer.y, transform: `translate(${pointer.x > (wrapRef.current?.clientWidth ?? 0) - 260 ? 'calc(-100% - 14px)' : '14px'}, 14px)` }}
        >
            {hover.kind === 'event' ? <>
                <div className="tipTitle"><span className="tipDot" style={{ background: severityColors[hover.event.severity] }} />{hover.event.country} · {hover.event.severity}</div>
                <div className="tipBody">{hover.event.headline}</div>
                <div className="tipMeta">{new Date(`${hover.event.date}T00:00:00Z`).toLocaleDateString()} · {hover.event.best_deaths} est. deaths</div>
            </> : hoveredCountry ? <>
                <div className="tipTitle">{getFlag(hoveredCountry.code)} {hoveredCountry.name}</div>
                <div className="tipRow"><span>Status</span><b style={{ color: statusColors[statuses[hoveredCountry.code] || 'unknown'] }}>{statusLabels[statuses[hoveredCountry.code] || 'unknown']}</b></div>
                <div className="tipRow"><span>Incidents (90d)</span><b>{metrics[hoveredCountry.name.toLowerCase()]?.recent_events ?? eventsByCountry[hoveredCountry.name.toLowerCase()] ?? '—'}</b></div>
                <div className="tipRow"><span>Defence spend</span><b>{hoveredCountry.militaryBudgetUsdBillions === null ? 'n/a' : `$${hoveredCountry.militaryBudgetUsdBillions.toFixed(1)}B`}</b></div>
                <div className="tipRow"><span>Alliances</span><b>{allianceLabels[allianceKey(hoveredCountry)]}</b></div>
                <div className="tipMeta">Click for details</div>
            </> : <div className="tipTitle muted">{hover.name}</div>}
        </div>}
    </div>;
}

function MapLegend({ colorMode, metrics }: { colorMode: ColorMode; metrics: Record<string, CountryMetrics> }) {
    if (colorMode === 'status') return <div className="mapLegendScale">
        {(['stable', 'tense', 'conflict', 'unknown'] as StatusColor[]).map(status => <span key={status}><i style={{ background: statusColors[status] }} />{statusLabels[status]}</span>)}
    </div>;
    if (colorMode === 'alliances') return <div className="mapLegendScale">
        {(Object.keys(allianceColors) as (keyof typeof allianceColors)[]).map(key => <span key={key}><i style={{ background: allianceColors[key] }} />{allianceLabels[key]}</span>)}
    </div>;
    const gradient = colorMode === 'spending'
        ? `linear-gradient(90deg, ${spendingScale(0.1)}, ${spendingScale(5)}, ${spendingScale(200)})`
        : 'linear-gradient(90deg, #1f2937, #ef4444)';
    const [low, high] = colorMode === 'spending' ? ['$0.1B', '$200B (log)'] : ['0', `${maxIncidents(metrics)} incidents`];
    return <div className="mapLegendScale isGradient">
        <span className="legendCaption">{colorMode === 'spending' ? 'Military spending' : 'Incidents, latest 90 days'}</span>
        <div className="gradientBar" style={{ background: gradient }} />
        <div className="gradientTicks"><span>{low}</span><span>{high}</span></div>
    </div>;
}

/** Rough zoom level that frames a country, from the extent of its largest polygon. */
export function zoomForFeature(feature: any) {
    const geometry = feature?.geometry;
    if (!geometry) return 3;
    const polygons: number[][][][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    let bestSpan = 0;
    for (const polygon of polygons) {
        const ring = polygon[0];
        const lons = ring.map(point => point[0]);
        const lats = ring.map(point => point[1]);
        const span = Math.max(Math.max(...lons) - Math.min(...lons), (Math.max(...lats) - Math.min(...lats)) * 1.6);
        bestSpan = Math.max(bestSpan, span);
    }
    if (!bestSpan) return 3;
    return Math.min(7, Math.max(1.3, 26 / bestSpan));
}
