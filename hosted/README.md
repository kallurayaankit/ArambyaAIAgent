# ArambyaAIAgent hosted application

Server-backed hosted version of [ArambyaAIAgent](https://github.com/kallurayaankit/ArambyaAIAgent). Uses the official Sites Vinext/Cloudflare Workers starter and preserves its `sites()` build integration.

The browser UI at `/planner.html` calls `/api/plan`. The Worker invokes the same public-data tools and deterministic planner as the local Node application and streams NDJSON activity/results. This is not a screenshot or fixture-only demo. The public service intentionally disables the local LLM provider; all planning is labelled rule-based. Offline sample mode is explicit.

`src/` contains the planner and tools. `worker/index.ts` supplies the hosting adapter. `public/` contains the UI. `app/page.tsx` redirects the root to the planner. The hosting manifest identifies this Site; use a new Site ID for a separate deployment.

Install with `npm ci`, build with `npm run build`, and preview the built Worker with `npm start`. Node 22.13+ is required. Hosting is managed through the Sites tools, not direct Wrangler account credentials.

Public requests have an 8 KB body limit, bounded tool fetches, a 75-second overall timeout, a per-isolate concurrency cap, and a bounded five-minute in-memory result cache. Cache hits retain original retrieval timestamps and show a cache activity message. These are prototype safeguards, not a distributed abuse-prevention system.

Public APIs may fail or rate-limit. Melbourne has a live city-directory fallback; other cities rely on Overpass. Events are a small Melbourne featured-listing sample. Only one fallback venue has a dedicated official-hours adapter. Unknown hours are provisional. Budgets are approximate AUD allowances, and walking times are heuristic estimates. No booking, purchase, private connector access, model credentials or personal documents are involved.

See the main repository README for data attribution, setup, tests and limitations. This source includes official Sites framework/runtime helper code; those helpers are retained for reproducible builds.
