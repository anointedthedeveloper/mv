# mv-api

Movie and TV metadata API (search, details, seasons, episodes) backed by [TMDB](https://www.themoviedb.org/). It returns metadata only, with no stream or download links.

## Setup
```
npm install
cp .env.example .env   # add your TMDB key
export $(grep -v '^#' .env | xargs) && npm start
```

## Endpoints
| Route | Description |
|---|---|
| `GET /search?q=&type=multi\|movie\|tv&page=` | Search |
| `GET /trending?type=all\|movie\|tv` | Trending this week |
| `GET /title/movie/:id` | Movie details, cast |
| `GET /title/tv/:id` | Series details, cast, seasons |
| `GET /title/tv/:id/seasons/:n` | Episode list for a season |
| `GET /title/tv/:id/export?seasons=1,2` | Zip of episode metadata (JSON + CSV per season) |
| `GET /health` | Health check |

Responses are cached in memory (`CACHE_TTL_SECONDS`) and rate-limited per IP (`RATE_LIMIT_PER_MINUTE`).

This product uses the TMDB API but is not endorsed or certified by TMDB.
