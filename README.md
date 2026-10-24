# ArambyaAIAgent

Public demo: https://arambya-ai-agent.glossychar1.chatgpt.site

Repository: https://github.com/kallurayaankit/ArambyaAIAgent

The hosted version runs the same live public-data tools on a server and streams activity to the browser. It is not LLM-powered: the public demo uses the explicit rule-based fallback. Public results may be cached for up to five minutes with original retrieval timestamps preserved. See `hosted/` for the deployed Sites/Vinext source and the limitations below.

A local discovery and day-planning prototype, outside QA. It executes real public-data tools, streams their activity to a browser, then creates a provisional walking itinerary with sources and downloadable Markdown/JSON.

**Default reasoning mode: rule-based fallback, not an LLM.** No API key, account, installation of dependencies, or paid API is needed. Offline demo is a separate, explicit selection. A failed live request never silently becomes a demo.

## Run on Windows

Requires Node.js 22 or newer (verified here with Node 24.16.0 and npm 11.13.0).

```powershell
git clone https://github.com/kallurayaankit/ArambyaAIAgent.git
cd ArambyaAIAgent
npm.cmd start
```

Open **http://127.0.0.1:4317**. Leave the terminal running; Ctrl+C stops the server. The local version binds only to `127.0.0.1`, not your LAN. The separately hosted public demo is linked above.

```powershell
npm.cmd test        # offline unit + HTTP integration tests
npm.cmd run build   # syntax checks and self-contained dist/ copy
node dist/server.js # run the built copy instead of npm start
npm.cmd run check:live # optional real public-data smoke check; saves test-results/live-result.json
```

No `npm install` is required. Do not run source and built servers on the same port. For another port: `$env:PORT='4318'; npm.cmd start`. `npm.cmd run dev` watches server files; reload the browser after UI changes.

## Try it

Keep Melbourne, today's date, AUD 80, and art/history/nature. Choose **Live public tools** and build the day. Watch each retrieval appear in Tool activity. Cancel is available while working, and a new run replaces the previous result. Choose **Offline demo · Melbourne sample data** to explore without networking. Demo supports Melbourne only and labels every result as illustrative.

Results show the resolved city/country/timezone, provisional stop times, walking estimates, regular-hours status, cost allowances, source links, weather, and matching event date ranges. Events stay in a separate shortlist because a date range does not establish a bookable session. Use **Export itinerary .md**, **Export data .json**, or **Print / PDF**. Exports include provenance, warnings and the activity log. Downloads are user initiated; no plan history is stored by the server.

## What is live

| Tool | Public source | Behaviour |
| --- | --- | --- |
| City lookup | Open-Meteo geocoding / GeoNames | Takes the first matching city; displays the resolved country and timezone. |
| Weather | Open-Meteo forecast | Date-specific temperature and precipitation. Missing/out-of-range forecasts are visible failures, not invented weather. |
| Places + hours | OpenStreetMap through Overpass | Searches selected categories within 2.2 km of the centre; reads `opening_hours` and `fee` when present. Two bounded endpoint attempts. |
| Melbourne place fallback | City of Melbourne landmark directory | Real records fetched at request time if Overpass fails. Directory records may be old; no hours or prices are assumed to be published by this dataset. |
| Official hours enrichment | What's On Melbourne, State Library Victoria | When this named landmark is discovered in the fallback, retrieves its published weekly hours. Fails closed to **unknown** if markup is incomplete/changed. This enrichment covers one verified venue in v0.1. |
| Events | What's On Melbourne | Reads up to eight featured listing pages and parses schema.org Event metadata. Filters date ranges and cancelled listings. Limited sample, not exhaustive search. Melbourne only. |

Open-Meteo's free endpoint is for noncommercial prototyping, subject to its usage terms. OSM: © OpenStreetMap contributors, ODbL. Open-Meteo and GeoNames: CC BY attribution. City of Melbourne landmark data: CC BY (see source metadata). Event content belongs to its publishers; only short metadata and source links are displayed.

Sources and implementation references:

- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/geocoding-api
- https://open-meteo.com/en/terms
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://wiki.openstreetmap.org/wiki/Key:opening_hours
- https://www.openstreetmap.org/copyright
- https://data.melbourne.vic.gov.au/explore/dataset/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/
- https://whatson.melbourne.vic.gov.au/things-to-do
- https://whatson.melbourne.vic.gov.au/things-to-do/state-library-victoria

## Planner and limitations

The orchestrator validates the request, geocodes the city, runs place/weather/event tools, optionally ranks candidate IDs with a local model, and schedules up to four stops. Interest matches, category variety, proximity, available hours and indoor options during rain influence the score. It avoids listed closed hours, walks over 3.5 estimated km per leg, activities above the allowance, and finishes after 17:00. It starts from the city centre at 10:00 and leaves 15-minute breaks between stops.

- Walking time is straight-line distance × 1.35 at 4.5 km/h, plus a 10-minute buffer. No real routing, transit, accessibility, elevation, or road-crossing checks.
- Budget is always **AUD**, even outside Australia. Generic allowances (AUD 20 café / AUD 25 indoor attraction; assumed free park or OSM `fee=no`) are **not live prices**. 25% of the budget is reserved. Food/transport/ticketed exhibitions may cost extra. There is no guarantee actual spending fits the estimate.
- Hours support `24/7`, simple daily time windows, day/day-range windows and `off`/`closed`. Complex expressions, holidays, overnight spans and missing data are unknown. Unknown-hour visits remain visibly provisional. Known hours are not a guarantee the venue is open.
- The geocoder chooses one result; ambiguous cities require checking the displayed country. City centre is approximate. Melbourne is the best-supported destination; non-Melbourne places rely on Overpass and have no event adapter.
- Open data can be stale. The Melbourne fallback is a landmark directory, not a real-time business directory. It contains no cafés, and its combined gallery/museum classification is approximate.
- Events are featured-page samples; date-range matches may not run every day. No event is automatically booked or inserted into the timed plan.
- Public endpoints may rate-limit, time out, change HTML, or deny access. Individual failures yield a partial result. Geocoding failure stops the request. Each run has a 90-second bound and client cancellation propagates to fetches.
- No LLM is required or implied. Demo data is synthetic/illustrative. No cloud credentials are read or used.

## Optional local-model provider

If an OpenAI-compatible server and model are **already installed and running locally**, opt in with:

```powershell
$env:PLANNER_PROVIDER='local'
$env:LOCAL_LLM_URL='http://127.0.0.1:11434/v1/chat/completions'
$env:LOCAL_LLM_MODEL='<your already-installed model name>'
npm.cmd start
```

The adapter only permits HTTP loopback endpoints and rejects redirects; remote paid/cloud endpoints are intentionally unsupported. It sends candidate names, categories and interests to that local server and expects a JSON array of existing IDs. Model output only influences ranking; the deterministic scheduler still enforces its constraints. Invalid output or an unavailable local model is logged and falls back visibly. No local model was installed or called during validation; adapter success/failure was tested with mock responses. Remove these variables to return to the default. Do not add credentials to the browser or source tree.

## Architecture and checks

- `server.js`: Node HTTP, localhost binding, origin/host checks, request limits, NDJSON streaming, cancellation.
- `src/tools.js`: bounded public retrieval, source normalization, official-hours and event parsing.
- `src/agent.js`: orchestration, tool logs, partial failure handling, mode separation.
- `src/planner.js`: input validation, hours checks, distance/budget/schedule rules.
- `src/provider.js`: configurable local-model ranking adapter.
- `src/demo.js`: explicitly illustrative data, never injected into live mode.
- `public/`: accessible vanilla HTML/CSS/JavaScript, escaped external text, responsive layout, exports.
- `test/`: deterministic Node tests covering validation, budgets, hours, event dates, fallback, cancellation, request security and repeat streams.
- `scripts/live-check.js`: optional public-network smoke test. `test-results/` is local, ignored evidence.

The app uses no personal documents, cookies, account data, or stored credentials. Only the entered city/date/interests and derived city coordinates are sent to the relevant public services. Results remain in memory until exported. The server does not expose arbitrary files or proxy arbitrary URLs. External text is rendered as text/escaped HTML. This is a local prototype, not a production service.

## Troubleshooting

If live sources are blocked by your network, use the explicit offline demo; do not disable TLS or system security. Overpass can be slow: Melbourne will attempt the official directory fallback. Other cities may return no stops. Forecasts normally cover roughly the coming two weeks; a distant date can still produce places with a weather warning. If a port is busy, stop the earlier instance or select another port. No broad process termination is needed.

The test suite currently contains 18 passing tests. The hosted adapter adds streaming, origin/body checks and transparent five-minute caching. Hosted deployment source is in `hosted/`; public hosting disables local-model access.

