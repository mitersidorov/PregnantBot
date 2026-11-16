# PregnantBot Web App

Angular Telegram Web App for the two-user fertility protocol tracker. It provides routed cycle, checklist, and shared-record workflows; empty and failure states are shown when the API has no data or is unavailable.

## Local development

Requires a supported Node.js release for Angular 21 (Node 22 LTS recommended). Install dependencies and configure the dev-server proxy:

```sh
npm ci
cp .env.development.example .env.development.local
# Fill API_KEY in the ignored local file with the same server-side key as apps/backend/.env.
npm start
```

The Angular dev server serves the browser app and proxies same-origin `/api/*` requests to `BACKEND_URL` (default `http://localhost:3000`), stripping the `/api` prefix. The Node-only proxy reads `API_KEY` from `.env.development.local` and injects `X-API-KEY`; this value is never compiled into or sent by browser code. The frontend sends Telegram's original signed `initData` in `X-Telegram-Init-Data` when hosted in Telegram. For the Docker test stack at `localhost:4200`, it sends the hardcoded local test ID `123169226`; the backend accepts this header only in `NODE_ENV=test`. This does not create or imitate signed Telegram data and is not accepted in production. Do not commit `.env.development.local` or place server credentials in `src/` or Angular environment files.

The browser calls only the same-origin `/api/*` proxy. The development proxy injects `X-API-KEY` from Node process environment and strips `/api`; production hosting must do the equivalent server-side (inject server-held `X-API-KEY`, remove the prefix, and route `/api/*` to NestJS). Never add the API key to Angular config or assets. Telegram signed `initData` is forwarded as `X-Telegram-Init-Data` only; raw Telegram IDs are never sent as identity.

Implemented backend paths: `GET/POST /cycles`, `GET /cycles/:id`, `PATCH /cycles/:id/checklist/:requirementId`, `GET /records`, `POST /records/uploads` (multipart field `file`), `POST /records/results/:id/interpret`, `POST /records/results/:id/confirm`, `GET /records/:id/download`, and `GET /records/archive`. Download/archive remain same-origin API links so authenticated proxy headers are included by hosting. Current backend returns uploaded file with result nested on upload and lists files with nested results. Confirmation sends no requirement links by default; add selected requirement IDs only after user selection.

## Screens

- Overview: private shared-space landing page and setup preview.
- Cycles: create and view cycles; update each cycle's checklist.
- Records: upload PDF/JPEG/PNG, request interpretation, review and confirm proposals, view unknown and superseded results, and download individual files or the archive.

## Playwright workflow checks

End-to-end tests are optional and isolated from frontend production dependencies. To run them in a local environment, install `@playwright/test` as a development-only tool and the Chromium browser, then run `npm run test:e2e`:

```sh
npm install --save-dev @playwright/test
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` uses synthetic browser/API fixtures to cover cycle creation, upload, proposal review, history and archive-link behavior. Install Chromium once with `npx playwright install chromium`. It does not verify Telegram signature validation, live storage, OpenAI, or backend authorization. For end-to-end verification use an isolated backend/e2e environment and synthetic documents only.
