# PregnantBot

Monorepo for the private two-user Telegram Web App: NestJS API in `apps/backend` and Angular client in `apps/webapp`.

## Production containers

`docker-compose.yml` runs the static Web App and API. Only port `80` is published. Nginx serves Angular and proxies same-origin `/api/*` calls to the internal NestJS service, strips the `/api` prefix, and adds the server-held API key. Telegram `initData` is forwarded unchanged for signature validation. The production MySQL database and private S3 bucket are external services.

Configure deployment environment variables from `apps/backend/.env.example` and set the required database, Telegram, S3, API, and CORS values. Start with:

```sh
docker compose config
docker compose up --build -d
```

## Dokploy deployment

`docker-compose.dokploy.yml` is the production stack for Dokploy. It runs one monolith image containing the Angular app, Nginx same-origin proxy, and NestJS API. Nginx injects the server-side API key, forwards Telegram initData, and routes `/api/*` to the local API. The service joins Dokploy's external `dokploy-network`; MySQL and private S3-compatible storage remain external. Configure the Dokploy domain to route to service `pregnantbot` on port `80`. The container runs database migrations before starting the API.

The GitHub Actions workflow runs backend tests, typecheck, lint and build, then checks and builds Angular and runs the browser workflow, responsive, and canonical checklist suites. It builds and publishes one `pregnantbot` image with `prod` and commit-SHA tags, then calls the Dokploy webhook. Configure these GitHub Actions repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN` (Docker Hub access token with permission to push the `pregnantbot` repository)
- `DOKPLOY_WEBHOOK_URL` (the deploy webhook for the Dokploy Compose application)

In Dokploy, configure `DOCKERHUB_USERNAME` for the image namespace and all runtime values below. GitHub Actions secrets are used only to publish the image and trigger deployment; they do not populate Dokploy runtime environment variables.

Runtime variables passed explicitly by the Dokploy stack. `SWAGGER_SERVER_URL` defaults to `/api` when the web app and API use the same domain; set a full `https://.../api` URL only when the API has a separate domain. Do not add a trailing slash.

- App: `NODE_ENV`, `APP_NAME`, `PORT`, `CORS_ORIGINS`, `SWAGGER_SERVER_URL`
- Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- API and Telegram: `API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_API_BASE_URL`, `TELEGRAM_WIFE_USER_ID`, `TELEGRAM_HUSBAND_USER_ID`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`
- Storage: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`
- HTTP client: `HTTP_TIMEOUT_MS`, `HTTP_RETRIES`, `HTTP_RETRY_DELAY_MS`
- Interpretation: `OPENAI_API_KEY`, `OPENAI_MODEL`

Keep secrets in Dokploy's environment store; never put the API key in Angular build-time variables. The stack requires `OPENAI_API_KEY` so explicit result interpretation is available in production.

## Local integration / E2E stack

On the overview screen, the robot and primary action form one vertically centered group. The mobile layout centers it in the space above the fixed bottom navigation, accounting for the device safe area. Checklist lists use document-count badges and no divider lines.

The test stack uses MySQL 8.4, Garage for isolated local storage, and a local Telegram API stub. It reads `apps/backend/.env` (ignored by Git) so the backend can use a live `OPENAI_API_KEY`; Compose overrides database, S3, Telegram stub, and API-key settings. The stub counts outbound sendMessage calls without storing message content. Use synthetic medical files only. Never upload real patient documents to the test stack. For local screen testing, the web server injects test user ID `123169226` only when Telegram signed initData is absent; the test backend accepts it only with `NODE_ENV=test`, and the web/backend ports bind to loopback. This test identity is not accepted by production.

Start the services and run the Playwright browser suite:

```sh
docker compose -f docker-compose.test.yml --profile e2e config
docker compose -f docker-compose.test.yml --profile e2e up --build -d mysql garage backend webapp
docker compose -f docker-compose.test.yml --profile e2e run --build --rm playwright
```

To run the same local API workflow from the host after the services are healthy, use:

```sh
cd apps/webapp && npm run test:e2e
cd ../..
E2E_API_URL=http://127.0.0.1:3010 node docker/live-openai-e2e.mjs
E2E_API_URL=http://127.0.0.1:3010 node docker/live-openai-e2e.mjs --proxy-check
cat docker/live-openai-e2e.mjs | docker exec -i pregnantbot-backend-1 node --input-type=module - --verify-download
```

The backend image applies migrations and checklist seed before it starts. The `playwright` runner uses the Angular development server and Chromium from the official Playwright image, then makes live OpenAI-backed API calls using a synthetic PDF. It checks proposal/confirmation, wife-only cycle creation, shared history, downloads and archives. The test volumes retain local database and Garage data. Stop containers without removing those volumes:

```sh
docker compose -f docker-compose.test.yml --profile e2e down
```

For interactive UI development, start the web app separately with `cd apps/webapp && npm ci && npm start`; configure `apps/webapp/.env.development.local` as described in its README. No data from the test stack should be treated as production data.
