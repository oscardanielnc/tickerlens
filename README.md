# TickerLens 🔍

**AI-assisted equity analysis with every claim linked to its source.**

Type a ticker (e.g. `NVDA`) and get a live, cited analysis: company profile, financial charts, technical levels computed in code, upcoming earnings, recent news — and an AI-written bull/bear case where every statement points to the data or article it came from.

**▶ Live demo: [213.35.121.9:8081](http://213.35.121.9:8081)** — running on the owner's API keys, so it is rate-limited per visitor.

> ⚠️ **Not financial advice.** TickerLens is an educational and research tool. All signals, levels and AI-generated commentary are informational only.

## Why it's different

- **Code computes, AI narrates.** Indicators, support/resistance levels and fundamental flags are calculated deterministically in Python. The LLM only synthesizes and explains facts it is given — it never invents numbers.
- **Everything is cited.** Each fact in the UI links to its source (SEC EDGAR, Finnhub, exchange data).
- **Bilingual.** Static UI and AI-generated content available in English and Spanish.
- **Degrades honestly.** A ticker with 6 weeks of history gets the indicators those 6 weeks support; the long moving averages report `null` instead of a number invented from too few bars.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) · TypeScript · Tailwind CSS |
| Backend | FastAPI · Python 3.12 |
| Database | PostgreSQL + pgvector (provisioned for Phase 3; unused today) |
| AI | DeepSeek (any OpenAI-compatible endpoint) |
| Infra | Docker Compose · GitHub Actions |

## Quick start

```bash
git clone https://github.com/oscardanielnc/tickerlens.git
cd tickerlens
cp .env.example .env   # add your API keys (Finnhub free tier is enough to start)
docker compose up --build
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs (dev only — the production proxy does not route them)

### Local development without Docker

```bash
# Backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # Windows (use bin/activate on Linux/macOS)
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Project structure

```
├── frontend/   # Next.js app (UI, i18n EN/ES)
├── backend/    # FastAPI app
│   └── app/
│       ├── api/routes/   # HTTP endpoints
│       ├── core/         # settings, rate limiting
│       ├── providers/    # market data / news / earnings connectors
│       └── services/     # analysis logic (indicators, levels, AI synthesis)
├── deploy/nginx.conf         # reverse proxy for the public demo
├── docker-compose.yml        # local development
└── docker-compose.prod.yml   # public demo (nginx front, no database)
```

## Deploying the public demo

```bash
cp .env.example .env   # fill in the keys, and set CORS_ORIGINS to your own host
docker compose -f docker-compose.prod.yml up -d --build
```

nginx becomes the single entry point on `:8081`, serving the frontend and forwarding
`/api/` to the backend, so the browser only ever talks to one origin. Postgres is
deliberately absent — nothing uses it until the RAG phase.

### The proxy trust model (please don't loosen this)

The demo spends the owner's provider quota and AI tokens, so the per-IP rate limit is
the only thing standing between a visitor and the bill. That limit is keyed on the
client IP that uvicorn derives from `X-Forwarded-For`, which makes the header a
security boundary rather than a convenience:

- **nginx sets `X-Forwarded-For: $remote_addr`**, overwriting whatever the client sent.
  Using `$proxy_add_x_forwarded_for` instead *appends* to the client's own value, and
  uvicorn reads the first entry — so a visitor could hand themselves a fresh rate-limit
  bucket on every request just by varying a header.
- **`--forwarded-allow-ips` names the compose subnet**, never `*`. With `*` uvicorn
  trusts the header from any peer, which is what makes the spoof above work at all. The
  subnet is pinned in the compose file so it cannot drift when containers are recreated.

Change one of these and the limits stop applying. Both are needed.

## Roadmap

- [x] Phase 0 — Foundation: monorepo, Docker, CI, provider interfaces
- [x] Phase 1 — Ticker analysis page: charts, technical levels, cited AI bull/bear case, earnings, news
- [x] Phase 2 — Recent-search sidebar & side-by-side compare (localStorage, nothing leaves the browser)
- [ ] Phase 3 — RAG chat over your analyses (pgvector)
- [ ] Phase 4 — Eval suite for AI output quality

## License

MIT
