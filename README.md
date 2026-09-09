# ORCA — Your Marine Assistant (SIH 2026 MVP)

Fisherman-first marine safety chatbot. Mobile-first, dark-ocean UI with
cyan/aqua accents. No dashboards, no agent jargon — just a clear answer:
green = go, yellow = be careful, red = stay on land.

> Note: the Stitch MCP design server was unreachable during this build
> (auth server rejects dynamic client registration, no API key configured),
> so the UI was implemented faithfully from the written product spec:
> rounded cards, dark ocean identity, cyan accents, safety states,
> "Why did ORCA say this?" explanations, mic + input + send, bottom nav.

## Run

```bash
npm install
npm run server   # ORCA API on http://localhost:3001 (terminal 1)
npm run dev      # web UI on http://localhost:5173, /api proxied (terminal 2)
```

Single-port demo (API + production UI together):

```bash
npm run build && npm run serve   # http://localhost:3001
```

Other commands: `npm test` (34 tests), `npm run typecheck`, `npm run build`.

Requires Node 18+. No API keys needed. Data source is selected with
`ORCA_DATA_SOURCE` (see `.env.example`):

| Value | Behavior |
|---|---|
| `demo` (default) | Offline-safe sample scenarios; `meta.live === false`. Scripted SAFE/CAUTION/DANGER for the demo script. |
| `open-meteo` | Live Open-Meteo Marine + Forecast data for Indian-coast demo zones; `meta.live === true`. Needs internet. |

Advisories (`ORCA_ADVISORY_SOURCE`, see `.env.example`):

| Value | Behavior |
|---|---|
| unset (default) | Paired: demo marine → scripted demo advisories; live marine → **none** (live readings are never mixed with scripted warnings). |
| `demo` | Scripted advisories, always labeled `(demo)`; `advisoryLive === false`. |
| `none` | No advisories. |
| `incois` | Official INCOIS path — no public machine-readable SVAS/advisory API exists (verified; see `server/safety/incois.ts`), so requests fail honestly with 502. |

`/api/health` reports `{ dataSource, live, advisorySource, advisoryLive }`
(configuration semantics: `live` means a live source is configured; a failed
upstream surfaces as 502, never fake data).

Examples:

```bash
ORCA_DATA_SOURCE=open-meteo npm run serve   # live single-port demo
npm run server   # honors ORCA_DATA_SOURCE too (dev, with `npm run dev`)
```

`/api/health` always reports the truth: `{ dataSource, live }`. If the live
upstream fails, `/api/chat` returns 502 `PROVIDER_UNAVAILABLE` — never fake
live data. The header badge reads "Live marine data" (green) vs "Demo mode"
from the response `meta`; the chat falls back to offline answers if the
server itself is unreachable.

Location honesty: the UI sends only a free-text area label, or — after the
fisherman taps "📍 Use My Location" and grants browser permission — a GPS
fix used for that request only (never stored, never logged, never echoed in
responses). The server resolves gps → exact fix, matched zone label →
manual, anything else → demo default, and reports it as
`meta.locationMode`. Denied/unavailable permission falls back to the label
with a plain-words notice; raw coordinates are never shown in the UI.

## Demo script (hits all three states)

| Say / type | State |
|---|---|
| `Can I go fishing tomorrow?` | 🟢 SAFE |
| `How is the sea today?` | 🟡 CAUTION |
| `Will there be strong winds?` | 🟡 CAUTION |
| `Where is it safer to fish?` | 🟡 CAUTION |
| `Is there any danger nearby?` | 🔴 DANGER |

Every answer shows: headline → summary → best time → sea/wind/weather →
important warning → recommendation → expandable **"Why did ORCA say this?"**
(checks + plain-language explanation).

## Voice

Uses the browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`,
works in Chrome/Edge). Elsewhere it shows a friendly
"voice typing is not available — please type instead" notice and never breaks.
Speaker button on each answer reads it aloud via `speechSynthesis` (best-effort).

## Project layout

```
shared/
  orca-contract.ts        # ORCAResponse wire contract (server + UI import it)
server/
  index.ts                # bootstrap: API + static dist on one port (PORT, default 3001)
  app.ts                  # POST /api/chat, GET /api/health, validation, error mapping
  orchestrator.ts         # intent → agents (parallel) → fusion → guardrail → ORCAResponse
  agents/types.ts         # OrcaAgent + AgentResult contract (assessment/confidence/evidence)
  agents/index.ts         # sea / weather / hazard / location specialists (no cross-talk)
  reasoning/engine.ts     # ReasoningEngine + shared per-domain assessors (thresholds live once)
  reasoning/fusion.ts     # EvidenceFusion: provenance, conflicts, guardrail (final authority)
  reasoning/explain.ts    # evidence-backed fisherman explanations (no invented facts)
  location/areas.ts       # DEMO Indian-coast zones + resolver (no geocoding yet)
  providers/types.ts      # MarineDataProvider interface + ProviderError + isLiveSource
  providers/demo.ts       # DEMO scenarios only — kept for offline demonstrations
  providers/select.ts     # ORCA_DATA_SOURCE / ORCA_ADVISORY_SOURCE → providers
  providers/openMeteoMarine.ts  # LIVE Open-Meteo provider (marine + forecast, cached)
  safety/types.ts         # MarineSafetyProvider + SafetyAdvisory + validity/mapping
  safety/demoSafety.ts    # scripted demo advisories (labeled demo, never live)
  safety/incois.ts        # INCOIS research findings + honest stub (no public advisory API)
  reasoning/thresholds.ts # the ONLY place safety numbers live
  ecosystem/types.ts      # MarineEcosystemProvider + EcosystemReading + NullEcosystem
  ecosystem/incoisEcosystem.ts  # LIVE INCOIS ERDDAP SST with freshness gate (chl: none current)
  ecosystem/demoEcosystem.ts    # scripted demo SST/chlorophyll (labeled demo)
  ecosystem/pfz.ts        # PFZ extension point (no implementation — no authorized source)
  ecosystem/select.ts     # ORCA_ECOSYSTEM_SOURCE → provider (paired defaults)
src/
  App.tsx                 # shell: header, area, chat, composer, bottom nav
  api/client.ts           # POST /api/chat + contract→UI adapter; timeout + ApiError
  types.ts                # SafetyState, OrcaAnswer, ChatMessage, Locale
  mock/brain.ts           # offline fallback only (used when the API is unreachable)
  ...components/hooks/i18n (unchanged UI)
```

## API

`POST /api/chat` → `{ "message": "Can I go fishing tomorrow?", "location": "Your Fishing Area" }`

Returns `ORCAResponse`: `{ status: "safe"|"caution"|"danger", headline, summary,
bestTime?, conditions{sea,wind,weather}, warning?, recommendation?,
explanation?, evidence?, meta? }`. Errors are JSON: 400 `INVALID_REQUEST`,
502 `PROVIDER_UNAVAILABLE`, 500 `INTERNAL_ERROR`, 404 `NOT_FOUND`.

`GET /api/health` → `{ status, version, dataSource: "demo", live: false }`.

The UI calls same-origin `/api/chat` (Vite proxy in dev), adapts the response
to the existing `OrcaAnswer` model, and falls back to the offline mock brain
with an "Offline mode" notice if the server is unreachable. Set
`VITE_ORCA_API_URL` for a remote server (see `.env.example`).

## Tests

`npm test` — 183 tests: collaborative agents (contracts, assessments,
provenance), fusion (conflicts, tie-breaks, dedupe, guardrail), evidence-backed
explanations, ecosystem (dataset freshness, provider, agent, selection,
collaboration), reasoning SAFE/CAUTION/DANGER boundaries, orchestrator
(all states, unknown question, provider failure, trace), API (contract shape,
malformed → 400 incl. coordinates, health incl. advisory/ecosystem fields, 404,
live-health, dead marine → 502, dead safety → 502, dead ecosystem → 200),
Open-Meteo normalization / malformed / HTTP / timeout / cache / GPS /
selection, advisory mapping + expiry + demo/stub providers + selection
pairing, demo-area resolution, geolocation mocks, client mapping + error codes
+ meta passthrough. HTTP and GPS are mocked; tests never need the internet.

Ecosystem honesty: INCOIS ERDDAP holds no current SST/chlorophyll grids
(verified per-dataset; freshest usable holding ends 2025-04), so the live
ecosystem provider enforces a freshness gate (`ORCA_ECOSYSTEM_MAX_AGE_HOURS`,
default 96) and reports unavailable rather than labeling history as live.
SST-only; chlorophyll stays undefined until a current dataset exists. The
ecosystem agent is informational (`unknown`) and can never create DANGER.

## Conventions for this MVP

- No hardcoded ports/cities — only the generic **"Your Fishing Area"** label,
  renameable in the UI.
- No language is claimed as supported unless its dictionary ships
  (Hindi/Marathi appear as "soon", disabled).
- Simple language everywhere; agent terminology stays out of the conversation.
