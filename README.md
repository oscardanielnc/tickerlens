# TickerLens 🔍

**AI-assisted equity analysis with every claim linked to its source.**

Type a ticker (e.g. `NVDA`) and get a live, cited analysis: company profile, financial charts, technical levels computed in code, upcoming earnings, recent news — and an AI-written bull/bear case where every statement points to the data or article it came from.

> ⚠️ **Not financial advice.** TickerLens is an educational and research tool. All signals, levels and AI-generated commentary are informational only.

## Why it's different

- **Code computes, AI narrates.** Indicators, support/resistance levels and fundamental flags are calculated deterministically in Python. The LLM only synthesizes and explains facts it is given — it never invents numbers.
- **Everything is cited.** Each fact in the UI links to its source (SEC EDGAR, Finnhub, exchange data).
- **Bilingual.** Static UI and AI-generated content available in English and Spanish.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router) · TypeScript · Tailwind CSS |
| Backend | FastAPI · Python 3.12 |
| Database | PostgreSQL + pgvector |
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
- API docs: http://localhost:8000/docs

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
└── docker-compose.yml
```

## Roadmap

- [x] Phase 0 — Foundation: monorepo, Docker, CI, provider interfaces
- [x] Phase 1 — Ticker analysis page: charts, technical levels, cited AI bull/bear case, earnings, news
- [x] Phase 2 — Save & compare tickers side by side (localStorage, nothing leaves the browser)
- [ ] Phase 3 — RAG chat over your analyses (pgvector)
- [ ] Phase 4 — Eval suite for AI output quality

## License

MIT
