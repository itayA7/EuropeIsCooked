# Europe Security Monitor

Interactive Europe security dashboard.

## Run

### Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Map features

- **Color modes**: switch country colouring between UCDP status, incident density (latest 90 days), military spending (log scale), and NATO/EU membership.
- **Layers**: toggle located UCDP incidents (sized and coloured by severity; critical events pulse), capital markers, and country-code labels.
- **Timeline**: the bar chart at the bottom of the map shows weekly incident counts for the 13 weeks ending at the dataset's latest date. Click a week to filter the map and feed to it, or press ▶ to play through the weeks.
- **Navigation**: clicking a country, an incident, or a search result flies the map to it. Zoom buttons, a reset button, and a "focus selected country" button sit at the bottom right.
- **Search**: press `/` to search by country name, ISO code, or capital.
- **Deep links**: the URL hash tracks the open country (for example `#UA`), so links open straight to it.
- **Keyboard**: `Esc` closes the event popup, then the country panel, then resets the view; `+` / `-` zoom.
- **Country panel**: a 13-week incident trend, spending and personnel ranks among the monitored countries, and spending per active soldier.

Country details, baseline statuses, leadership, and military estimates are static in the frontend. Personnel estimates use the IISS Military Balance 2026 comparison; military expenditure uses SIPRI's 2025 current-USD data, released in 2026; leader names are a snapshot checked 2026-09-26. Reserve data is not reported for Iceland, and the 2025 SIPRI table has no Türkiye figure.

The backend fetches English-language, country-specific political and war/security headlines from Google News RSS, with GDELT as a fallback. It refreshes all supported countries in the background at startup and every 15 minutes. Results are filtered for language, topic, country relevance, and backend-configured publisher domains before they are cached. Client requests only read SQLite; they never trigger feed requests. Articles older than 7 days are removed during background cleanup and are never returned. If both providers fail, the last cached articles are retained only while they are within the 7-day window. The dashboard shows each country's last refresh time beside its news heading.

The Regional overview reads the saved country feeds and groups similar headlines into events, showing the countries and source links for each group. Country news uses the same grouping. Grouping is performed at request time and does not alter the cached articles.

Configure allowed publishers only on the backend in `backend/.env`, using a comma-separated list of hostnames in `NEWS_SOURCE_DOMAINS` (without a URL scheme or path). Only articles from those domains are cached. Restart the backend after changing the setting.

The cache schema is versioned. On its first startup after this update, the backend recreates the old news-cache table so it cannot serve entries from the previous source rules; later restarts preserve the new cache.

The backend restricts CORS to the local dashboard, validates country names, and rejects unexpected Host headers. It is intended for local development and binds to loopback with the documented Uvicorn command. Do not expose it directly to the internet; production deployment should use HTTPS, a reverse proxy, explicit production host/origin allowlists, and appropriate authentication and rate limiting.

Map status colors are refreshed daily from the public UCDP Candidate Events monthly CSV. “Conflict” means at least 25 UCDP-recorded state-based battle deaths for a country/conflict in the dataset's latest year; “Tense” means at least one other recorded organized-violence event within 90 days of the dataset's latest event date; “Stable” means no qualifying recent events were recorded. The legend displays the source version and data-through date. These are conflict-data indicators, not a general safety rating; reporting gaps and the monthly release lag mean “Stable” does not mean risk-free.
