# GrowEasy AI CSV Importer

An AI-powered CSV importer that ingests **any** lead export - Facebook Lead Ads,
Google Ads, real-estate CRM dumps, sales reports, or a manually created
spreadsheet - and intelligently maps it into GrowEasy's fixed CRM schema,
regardless of column names or layout.

Built for the GrowEasy Software Developer (Intern / Full-Time) assignment.

## How it works

1. **Upload** - user drags & drops (or picks) a `.csv` file in the browser.
2. **Preview** - the file is parsed client-side and shown in a table exactly as
   uploaded. No AI call happens at this point.
3. **Confirm** - only when the user clicks "Confirm Import" does the frontend
   send the file to the backend.
4. **AI Extraction** - the backend re-parses the CSV, splits rows into
   batches, and asks an LLM (Claude, GPT, or Gemini - configurable) to map
   each row's arbitrary columns onto the 15 GrowEasy CRM fields, enforcing the
   status/source allow-lists, multi-email/phone consolidation, and the
   "skip if no email or phone" rule.
5. **Results** - the frontend shows imported vs. skipped records, with counts
   and skip reasons.

## Project structure

```
groweasy-csv-importer/
├── backend/           Express + TypeScript API
│   ├── src/
│   │   ├── index.ts               App entrypoint
│   │   ├── routes/import.ts       /api/import/preview & /api/import/confirm
│   │   ├── services/
│   │   │   ├── csvParser.ts       Header-agnostic CSV -> row objects
│   │   │   ├── promptBuilder.ts   System prompt encoding every AI rule from the spec
│   │   │   ├── aiClient.ts        Provider-agnostic LLM call (Anthropic/OpenAI/Gemini)
│   │   │   └── aiExtractor.ts     Batching, retries, validation, hard-rule enforcement
│   │   ├── types/crm.ts           Canonical CRM record + enum types
│   │   └── __tests__/             Unit tests (node:test)
│   └── Dockerfile
├── frontend/           Next.js (App Router) + TypeScript + Tailwind
│   ├── app/page.tsx                Upload -> Preview -> Confirm -> Results flow
│   ├── components/                 CsvDropzone, PreviewTable, ResultsTable, StepIndicator, ThemeToggle
│   ├── lib/                        Shared types, client-side CSV parsing, API client
│   └── Dockerfile
├── sample-data/         Example CSVs in different layouts, for manual testing
└── docker-compose.yml
```

## Why this design

- **The backend never trusts column names.** `csvParser.ts` just turns each
  row into `{ [originalHeader]: value }`. All the "intelligence" lives in the
  AI prompt (`promptBuilder.ts`), which is given the raw headers + values and
  the full CRM schema, and decides the mapping itself - this is what lets
  Facebook exports, Google Ads exports, and hand-made spreadsheets all work
  through the same code path.
- **Hard rules are enforced twice.** The prompt asks the model to follow the
  enum allow-lists, the skip-if-no-contact rule, and the multi-value
  consolidation rule - but `aiExtractor.ts` also re-validates every field
  after the AI responds (invalid `crm_status`/`data_source` values are
  blanked, unparsable dates are nulled, and any record without an email or
  phone is force-skipped even if the model tried to import it). This keeps
  correctness independent of how well the model follows instructions.
- **Batching + retries.** Rows are chunked (`AI_BATCH_SIZE`, default 25).
  Batches run concurrently but capped at `AI_MAX_CONCURRENT_BATCHES` (default
  5) so a large CSV doesn't fire hundreds of simultaneous requests and blow
  through the AI provider's rate limits. A failed batch is retried with
  backoff (`AI_MAX_RETRIES`, default 3) before its rows are marked skipped
  with the underlying error as the reason - so one bad batch never crashes
  the whole import. All of `AI_BATCH_SIZE` / `AI_MAX_RETRIES` /
  `AI_MAX_CONCURRENT_BATCHES` are clamped to safe minimums even if the env
  var is misconfigured (e.g. `0` or negative), so a bad config value fails
  gracefully instead of hanging the server.
- **Timeouts that close cleanly, not hang.** Every AI provider call
  (`AI_TIMEOUT_MS`, default 45s) and the frontend's confirm request
  (`NEXT_PUBLIC_API_TIMEOUT_MS`, default 120s) are wrapped in an abort
  timeout. The `/api/import/confirm` route itself is also guarded
  (`IMPORT_ROUTE_TIMEOUT_MS`, default 150s, see `utils/connectionGuard.ts`):
  if processing runs long, the client gets one clean JSON 504 instead of the
  connection hanging or being abruptly reset by a hosting platform's proxy;
  and if the client disconnects first, the server stops trying to write to
  the now-dead socket instead of throwing.
- **Provider-agnostic AI client.** `AI_PROVIDER` env var switches between
  Gemini (default), Anthropic, and OpenAI without touching business logic.
- **Delimiter auto-detection + duplicate header handling.** `csvParser.ts`
  detects comma/semicolon/tab/pipe-delimited files instead of assuming comma,
  and renames duplicate column headers (e.g. two "Phone" columns) instead of
  silently dropping data.

## Prerequisites

- Node.js 18+
- An API key for at least one of: Anthropic (Claude), OpenAI, or Gemini

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env and set AI_PROVIDER + the matching *_API_KEY
npm install
npm run dev       # starts on http://localhost:4000
```

Run the unit tests any time with:

```bash
npm test
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL should point at the backend above
npm install
npm run dev        # starts on http://localhost:3000
```

Open `http://localhost:3000`, upload one of the CSVs in `sample-data/`, preview
it, click **Confirm Import**, and watch the AI-mapped results appear.

### 3. Docker (optional)

```bash
# from the project root
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build
```

This builds and runs both services (`frontend` on :3000, `backend` on :4000).

## API

### `POST /api/import/preview`
`multipart/form-data`, field `file`. Parses the CSV only (no AI) and returns
`{ headers, rows, totalRows }`. Used for the Step 2 preview (the frontend
also parses client-side with PapaParse for an instant preview; this endpoint
exists so the same validation logic can be reused server-side).

### `POST /api/import/confirm`
`multipart/form-data`, field `file`. Runs the full pipeline: parse -> batch ->
AI extraction -> validation. Returns:

```jsonc
{
  "imported": [ /* CrmRecord[] */ ],
  "skipped": [ { "row": {...}, "rowIndex": 0, "reason": "..." } ],
  "totalRows": 5,
  "totalImported": 4,
  "totalSkipped": 1,
  "batches": 1,
  "summary": {
    "successRate": 80,
    "headline": "4 of 5 rows imported (80%). 1 skipped - No email or mobile number found.",
    "skipReasons": [ { "label": "No email or mobile number found", "count": 1 } ],
    "statusBreakdown": [ { "label": "GOOD_LEAD_FOLLOW_UP", "count": 3 }, { "label": "SALE_DONE", "count": 1 } ],
    "dataSourceBreakdown": [ { "label": "Unspecified", "count": 4 } ]
  }
}
```

`summary` is computed once on the backend (`services/summarize.ts`) so every
client sees the same recap - a ready-to-display headline sentence plus
grouped counts of why rows were skipped and what the imported leads look
like (status/source mix). The frontend renders this at the top of the
Results step.

### `GET /api/import/health`
Returns `{ status: "ok", aiProvider: "anthropic" }` - useful for confirming
which AI provider is active without exposing the key.

## CRM field mapping rules (enforced in `aiExtractor.ts` + the AI prompt)

- `crm_status` must be one of `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`,
  `BAD_LEAD`, `SALE_DONE`, or blank.
- `data_source` must be one of `leads_on_demand`, `meridian_tower`,
  `eden_park`, `varah_swamy`, `sarjapur_plots`, or blank.
- `created_at` is validated with `new Date(created_at)`; anything unparsable
  is nulled rather than passed through.
- Extra emails/phone numbers beyond the first are appended into `crm_note`.
- Rows with neither an email nor a phone number are skipped, even if the AI
  attempts to import them (enforced server-side as a safety net).

## Sample data

`sample-data/` includes four CSVs with completely different layouts to
exercise the AI mapping:

- `facebook_lead_export.csv` - Meta Lead Ads-style export (includes a row with
  no email, and a fully blank row to test skip behavior).
- `google_ads_export.csv` - different date format, semicolon-separated
  multiple emails in one field, free-text notes to infer `crm_status` from.
- `real_estate_crm_export.csv` - already in GrowEasy's own format (the sample
  given in the assignment spec) - a sanity check that well-formed input
  passes straight through.
- `manual_spreadsheet_messy.csv` - loosely structured, mixed contact info in
  a single free-text column, multiple phone numbers per row, and one row with
  no contact info at all (should be skipped).

## Testing performed

- `backend`: `npm run build` (tsc) and `npm test` (8 unit tests covering CSV
  parsing edge cases, enum enforcement, the hard skip rule, retry/failure
  handling, and date validation) both pass.
- `frontend`: `npm run build` (Next.js production build, including
  type-checking and linting) passes with no errors.
- An end-to-end dry run of `parseCsv -> extractCrmRecords` against
  `manual_spreadsheet_messy.csv` with a scripted stand-in AI function
  confirmed the full pipeline (batching, field mapping, enum sanitization,
  and the skip rule) behaves as intended before wiring up a real LLM key.

## Bonus features implemented

- Drag & drop upload
- Animated progress messages during AI processing
- Retry mechanism for failed AI batches (exponential backoff, configurable)
- Dark mode (persisted via `localStorage`, respects system preference)
- Unit tests (Node's built-in test runner, no extra dependency needed)
- Docker setup for both services + `docker-compose.yml`
- This README

## Deployment

### Backend: Render

A [`render.yaml`](./render.yaml) Blueprint is included at the project root, so
the backend can be deployed without manually clicking through service
settings:

1. Push this repo to GitHub.
2. In the Render dashboard: **New +** -> **Blueprint** -> select the repo.
   Render reads `render.yaml` and creates a web service rooted at `backend/`
   with the build command `npm install && npm run build` and start command
   `npm start`.
3. Before the first deploy finishes, open the service's **Environment** tab
   and set the API key for whichever provider you're using (only one is
   required) - `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`.
   These are intentionally left blank in `render.yaml` (`sync: false`) so no
   secret ever gets committed to the repo.
4. Once your frontend is deployed too, come back and set `FRONTEND_ORIGIN`
   to its exact URL (it defaults to `*` so the first deploy doesn't fail
   closed, but should be locked down afterward).
5. Render assigns the service a URL like
   `https://groweasy-csv-importer-backend.onrender.com` - use that as
   `NEXT_PUBLIC_API_URL` for the frontend. `/api/import/health` is wired up
   as the health check endpoint.

Don't want to use the Blueprint? The same settings work if you create the
web service manually: root directory `backend`, build command
`npm install && npm run build`, start command `npm start`, and the env vars
listed in `backend/.env.example`.

Railway or Fly.io work too, with the same build/start commands.

### Frontend: Vercel

Vercel is the natural fit for Next.js - set `NEXT_PUBLIC_API_URL` to the
deployed backend's URL as an environment variable.
