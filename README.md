# MV Metadata API + Dashboard

Two independently deployable apps:

- `backend/`: Node.js, Express, TypeScript. REST API for movie/TV metadata, plus authorized downloads of files you own.
- `frontend/`: React, TypeScript, Vite. A dashboard for testing the API: search, details, raw JSON, download options, and real error display.

## Data sources
| Source | Use |
|---|---|
| **TMDB** (`PROVIDER=tmdb`, default) | Documented API with your own free key. Only exercised against mocked HTTP in this repo's tests, so verify it with your key. |
| **Fixtures** (`PROVIDER=fixtures`) | Small offline sample catalog for development and tests. It is not live data. |

There is **no MovieBox integration**: no official public API or documented integration was found, and this project does not reverse-engineer private endpoints.

## Backend
```
cd backend
cp .env.example .env     # set TMDB_API_KEY, DOWNLOAD_SIGNING_SECRET, CORS_ORIGINS, PUBLIC_BASE_URL
npm install
npm run dev              # or: npm run build && npm start
npm test                 # vitest + supertest
```
Docs: `GET /docs` (Swagger UI) and `GET /openapi.json`.

| Route | Description |
|---|---|
| `GET /api/search?q=&type=all\|movie\|tv&page=` | Search |
| `GET /api/trending?type=&page=` | Trending this week |
| `GET /api/genres?type=movie\|tv` | Genres |
| `GET /api/movies/:id` | Movie details |
| `GET /api/tv/:id` | TV details and season list |
| `GET /api/tv/:id/seasons/:n` | Episodes of a season |
| `GET /api/tv/:id/export?seasons=1,2` | Zip of episode **metadata** (JSON + CSV) |
| `GET /api/downloads/:id` | Authorized downloads for `movie-<id>` / `tv-<id>` |
| `GET /api/downloads/:id/files/:file?exp=&sig=` | Download via signed link (Range supported) |

Errors always look like `{ "error": { "code", "message" } }`. Upstream timeouts, outages and bad keys map to 504/502/500 with distinct codes. The backend also provides input validation (zod), TTL caching, per-IP rate limiting, request timeouts and structured JSON logs. Query strings are not logged because they may hold signed tokens.

### Authorized downloads
Only files you own or are licensed to distribute. Put them in `DOWNLOADS_DIR` with a `manifest.json`:
```json
{ "movie-603": [{ "file": "my-film.mp4", "label": "Feature (1080p)", "license": "CC-BY 4.0" }] }
```
Only files listed in the manifest are served. Links are HMAC-signed and expire after `DOWNLOAD_LINK_TTL_SECONDS`, and file names are confined to `DOWNLOADS_DIR`. Set a long random `DOWNLOAD_SIGNING_SECRET` in production.

## Frontend
```
cd frontend
cp .env.example .env     # VITE_API_BASE_URL (also editable in the UI)
npm install
npm run dev              # or: npm run build, then serve dist/ from any static host
```
Add the frontend's origin to the backend's `CORS_ORIGINS`.

## Deployment
- **Backend:** any Node 18+ host. Run `npm run build && npm start` and set the env vars above. The cache and rate limiter are in-memory and per process, so use a shared store if you run several instances.
- **Frontend:** static files from `frontend/dist` (Netlify, S3/CloudFront, nginx, etc.). `VITE_API_BASE_URL` is baked in at build time.

## Verified
Backend: typecheck, 12 tests (routes, validation, errors, rate limit, zip export, signed downloads incl. tampering, mocked TMDB), plus a smoke test of the built server. Frontend: typecheck and build, plus a headless-browser run covering search, details, downloads and error display against the fixtures backend.
**Not verified:** live TMDB responses (no key in the build environment).
