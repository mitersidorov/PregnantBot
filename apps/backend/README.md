# PregnantBot backend

NestJS 12 API for the PregnantBot monorepo. TypeORM uses MySQL with synchronization disabled; schema changes are managed by migrations. S3-compatible object storage is external to the production app stack.

## Local setup

Requires Node.js 24.9+ and npm for the Jest 30 test runner (the Nest CLI runtime also supports Node.js 22.22.3+). Install dependencies in this directory, copy `.env.example` to `.env`, and fill every required blank value from a secure local source. Do not put credentials in Angular configuration or commit `.env`.

```sh
npm ci
cp .env.example .env
npm run start:dev
```

Required configuration: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`; `API_KEY`; `TELEGRAM_BOT_TOKEN`; distinct positive numeric `TELEGRAM_WIFE_USER_ID` and `TELEGRAM_HUSBAND_USER_ID`; `TELEGRAM_WEBHOOK_URL`; `TELEGRAM_WEBHOOK_SECRET`; and `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`. Each Telegram ID is explicitly bound to its role; only the wife may start a preparation. The HTTPS webhook URL is registered with Telegram at startup, and Telegram webhook requests must include the configured secret header. Startup fails rather than using default credentials or silently disabling persistence/storage. `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` defaults to 86400 and controls signed Telegram initData freshness. `HTTP_TIMEOUT_MS`, `HTTP_RETRIES`, and `HTTP_RETRY_DELAY_MS` configure the shared outbound HTTP client. `OPENAI_API_KEY` is required only when the user explicitly requests interpretation; `OPENAI_MODEL` selects the model (defaults to `gpt-4o-mini`). Uploads remain stored in a pending state if interpretation is unavailable or fails. Do not enable the OpenAI key without the users' informed consent and appropriate data-processing arrangements.

## Telegram reminders

The scheduler sends each configured user their outstanding applicable checklist items for the following week on Mondays and Thursdays at 11:00 `Asia/Tbilisi`. Both role IDs are required in production deployment configuration. Confirmed results that remain valid through that week are omitted; requirements marked as conditional only when indicated are not treated as active until the checklist is changed. A daily 11:00 check sends a reminder when a confirmed result is within 14 days of expiry. Delivery reservations are stored in `notification_deliveries` with unique event keys so repeated or overlapping scheduler runs do not send duplicate messages. A failed or ambiguous send keeps its reservation to prefer at-most-once delivery over duplicate Telegram messages.

`TELEGRAM_API_BASE_URL` optionally overrides the Telegram API origin for local E2E stubs; it defaults to `https://api.telegram.org`. Do not point production at an untrusted endpoint.

The backend must also be able to make outbound HTTPS connections to `api.telegram.org:443`; a reachable incoming webhook does not verify outbound network access. `/start` checks the sender ID against the two role variables and logs the ID and allowlist result. Starting a preparation is intentionally limited to the wife account. Login diagnostics are written for `GET /auth/me` without logging Telegram `initData`; outbound Telegram failures include a sanitized service origin, operation, and network error code. If a reply cannot be sent, the webhook returns an error so Telegram can retry; check the application log and outbound DNS/firewall/proxy settings.

## API authentication contract

Every API route, including health, requires both headers:

- `X-API-KEY`: server-side shared key. Browser clients must use a same-origin proxy that injects this secret; never expose it in the Web App.
- `X-Telegram-Init-Data`: the original Telegram Web App `initData` string. The API validates its HMAC with the configured bot token, rejects stale/future timestamps and duplicate fields, and authorizes only the two configured Telegram IDs. The authenticated Telegram user is attached to the request by the guard; a browser-supplied Telegram ID is never trusted.

Swagger UI is available at `/docs` and describes both header schemes. Set `SWAGGER_SERVER_URL=/api` when the app and API share a domain (the production Compose default); use a full `https://.../api` URL only for a separately hosted API, without a trailing slash. Authentication failures use stable `401` error codes (`INVALID_API_KEY`, `INVALID_TELEGRAM_AUTH`); invalid server configuration fails closed. Errors use `{ statusCode, path, message, errorCode? }`. Unexpected server errors return a generic message; query strings, credentials, initData, and medical/document data are not logged.

## Migrations and checks

```sh
npm run migration:generate -- src/migrations/DescribeChange
npm run migration:run
npm run migration:revert
npm run migration:show
npm test -- --runInBand
npm run build
npm run lint
```

Development migration commands use `src/common/database/data-source.ts`; production commands use compiled `data-source-prod.js`. Both use MySQL and keep `synchronize` disabled.

## Cycle and records API

All routes require both `X-API-KEY` and valid `X-Telegram-Init-Data`. IDs are UUIDs; caller identity comes only from validated Telegram data. Swagger at `/docs` describes request fields and both security headers. Standard failures use `{ statusCode, path, message, errorCode? }`; validation errors return 400, authorization 401, missing resources 404, unsupported upload types 415, and oversized uploads 413. Provider/storage failures use generic stable 5xx errors without provider payloads.

| Method and path | Success | Purpose |
| --- | --- | --- |
| `GET /auth/me` | 200 `{ patientRole }` | Returns only the authenticated `wife` or `husband` role for role-specific UI filtering. |
| `POST /cycles` | 201 cycle object | Body `{ startDate: "YYYY-MM-DD" }`; starts a cycle for the authenticated user and initializes its independent checklist. Valid confirmed results are reused. |
| `GET /cycles` | 200 cycle array | Cycle history. |
| `GET /cycles/{id}` | 200 cycle with checklist | Cycle detail and progress. |
| `PATCH /cycles/{id}/checklist/{requirementId}` | 200 progress | Body `{ status: "pending" | "complete" | "not_applicable" }`. |
| `POST /records/uploads` | 201 `{ file, result }` | Multipart `file`, PDF/JPEG/PNG up to 20 MiB; validates content signature, stores privately, and creates a `pending` result without calling OpenAI. |
| `GET /records` | 200 file array | Files and result versions/confirmed links, including unclassified results. |
| `GET /records/archive` | 200 ZIP | Combined private archive of both authorized users' files. |
| `GET /records/{id}/download` | 200 streamed file | Streams private file bytes through the authenticated same-origin API with `Content-Type` and safe `Content-Disposition` headers. |
| `POST /records/results/{id}/interpret` | 200 proposed result | Interprets the current `pending` result in place. `testName` and `summary` are requested in Russian; known checklist names map to their exact Russian UI labels, while unknown names are translated by the model. Values, codes, units, and dates must retain their source meaning. Repeated, stale, confirmed, or superseded requests return 409; an OpenAI failure leaves the file and result pending for retry. Zod validates structure/date format, not semantic language or factual accuracy; the result remains a user-confirmed proposal. Requires `OPENAI_API_KEY`. |
| `POST /records/results/{id}/confirm` | 200 confirmed result | Explicitly confirms fields and requirement IDs; this is the only operation linking requirements. |

The reversible checklist seed contains only user-confirmed form rows. It excludes female FSH/LH/estradiol/prolactin, rubella antibody tests, mammography, both karyotypes, and male preoperative tests. Rubella-related vaccination/delay is not seeded because no presented result establishes absent antibodies. Coagulation entries are limited to APTT, INR, and fibrinogen because no supplied page was available to verify PT/PTI/thrombin time. Conditional fluorography, oncologist-mammologist, and genetic conclusions are marked indicated-only; ultrasound abnormal-result and therapist contraindication follow-ups are branch metadata. Confirmed results update active-cycle progress; only explicitly linked requirements count, while unknown results remain in record history. Each upload starts with one pending result; explicit interpretation updates that same row once, then confirmation can link it to checklist requirements.
