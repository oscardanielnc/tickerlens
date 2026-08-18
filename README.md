# TickerLens 🔍

**Retrieval-augmented equity analysis where every claim links to its source.**

Type a ticker (e.g. `NVDA`) and get a cited analysis: company profile, financial charts,
technical levels computed in code, upcoming earnings, recent news — and an AI-written
bull/bear case where every statement points to the data or article it came from. Pick two
tickers and a RAG pipeline retrieves the most relevant evidence about both and streams a
head-to-head verdict grounded in it.

**▶ Live demo: [tickerlens.oscarnavarro.dev](https://tickerlens.oscarnavarro.dev)** — running on my own API keys, so it is rate-limited per visitor.

> ⚠️ **Not financial advice.** TickerLens is an educational and research tool. All signals,
> levels and AI-generated commentary are informational only.

---

## What this project demonstrates

Built as a working portfolio piece for the things production AI/backend work actually asks for.

| Capability | Where to look |
|---|---|
| **RAG end to end** — chunking, embeddings, vector store, retrieval strategy, grounded generation | [`services/rag.py`](backend/app/services/rag.py), [`core/embeddings.py`](backend/app/core/embeddings.py), [`core/db.py`](backend/app/core/db.py) |
| **Vector search** — pgvector, cosine distance, idempotent upserts | [`core/db.py`](backend/app/core/db.py) |
| **Prompt engineering with citation grounding** — the model may only speak from retrieved refs | [`services/verdict.py`](backend/app/services/verdict.py), [`services/synthesis.py`](backend/app/services/synthesis.py) |
| **Token streaming** — SSE from an LLM through a reverse proxy to incremental React rendering | [`routes/analysis.py`](backend/app/api/routes/analysis.py), [`lib/api.ts`](frontend/src/lib/api.ts) |
| **Abuse & cost control** — per-IP rate limiting that survives a spoofed `X-Forwarded-For` | [`core/rate_limit.py`](backend/app/core/rate_limit.py), [`deploy/nginx.conf`](deploy/nginx.conf) |
| **Graceful degradation** — the app serves fully when Postgres or the embedding model is down | [`core/db.py`](backend/app/core/db.py), [`main.py`](backend/app/main.py) |
| **Third-party integration** — four external APIs, each with its own failure and rate-limit story | [`providers/`](backend/app/providers) |
| **Typed contract across the stack** — Pydantic models mirrored in TypeScript interfaces | [`lib/api.ts`](frontend/src/lib/api.ts) |
| **Async Python** — FastAPI, asyncpg pooling, CPU-bound inference kept off the event loop | [`core/embeddings.py`](backend/app/core/embeddings.py) |
| **Infra** — multi-stage Docker builds, Compose, nginx, CI on every push | [`docker-compose.prod.yml`](docker-compose.prod.yml), [`.github/workflows`](.github/workflows) |

---

## The RAG pipeline

The interesting design decisions are here, so this section is specific.

```
analysis request
      │
      ▼
compute facts ──────────────┐         (deterministic Python: indicators,
  F1..Fn + news N1..Nm      │          levels, SEC fundamentals, ratios)
      │                     │
      ▼                     ▼
 API response        embed passages ──► pgvector: documents(ticker, kind, ref,
                     bge-small-en-v1.5           text, source_url, embedding)
                     384 dims, ONNX
                                                        │
compare?t=NVDA,AMD                                      │
      │                                                 ▼
      ▼                                    ┌─ pass 1: top-k refs per ticker
 embed comparison query ───────────────────┤            (which dimensions matter?)
 (the question, not the symbols)            └─ pass 2: those refs for BOTH tickers
                                                        │
                                                        ▼
                                          grounded prompt ──► streamed verdict
                                                              with [NVDA/F11] citations
```

**The corpus is the app's own output, not scraped prose.** `build_facts()` already emits
every computed fact and news item with the exact reference and source URL the UI cites. So
that list *is* what gets indexed — which is what keeps a retrieved chunk quotable: a chunk
that comes back as `[NVDA/F11]` still links to SEC EDGAR or the original article.

**Chunking follows the data, not a character count.** Each computed fact is already one
self-contained statement; splitting further would strip the numbers from their subject. News
gets headline + summary, truncated at 600 characters where market copy turns to boilerplate
and starts diluting the embedding.

**Embeddings run in-process.** `bge-small-en-v1.5` via fastembed (ONNX, no torch — the demo
VM has limited disk), so there is no second API key and anyone cloning the repo gets working
retrieval offline. BGE is asymmetric: queries need the instruction prefix from the model
card, passages do not, which is why `embed_query` and `embed_passages` are separate.

### The retrieval bug worth reading about

The first implementation retrieved top-k independently per ticker. It looked reasonable and
produced a confidently wrong answer.

Comparing NVDA against AMD, retrieval returned AMD's valuation and margin facts but not
NVDA's. The model concluded AMD was the stronger candidate *because NVDA had no comparable
fundamentals* — while NVDA was in fact cheaper (P/E 34 vs 120) with a 71% net margin against
20%. Every number was sitting in the index. Retrieval simply never asked for it.

The lesson generalises past this app: **for a comparison, relevance per item is the wrong
objective — you need the same dimensions covered on both sides.** Retrieval is now two
passes. The first finds which dimensions the query is about, as the union of the top-k refs
across both tickers. The second fetches those refs for both. Because facts are emitted in a
fixed order, a ref denotes the same kind of fact for every ticker (`F11` is the valuation
line), which makes the ref union the right unit of symmetry.

The prompt carries the other half of the fix: a missing excerpt is now explicitly a gap in
retrieved context, never evidence against a company.

### Grounding

Both prompts are constrained rather than trusted: use only the numbered excerpts, cite every
claim, never invent a number, never predict a price. The comparison prompt must commit to one
side — a comparison that refuses to conclude is useless — but it argues the opposing case in
its own section, and states which single data point would flip it. It says "screens
stronger", never "you should buy".

The UI resolves every `[NVDA/F11]` marker back to the retrieved excerpt and its source link,
so a reader can check the model against the evidence instead of taking its word.

---

## Other things worth pointing at

**Code computes, the LLM narrates.** Indicators, support/resistance levels and fundamental
flags are deterministic Python. The model only synthesises facts it is handed — it never
produces a number. That split is why the output can be verified at all.

**Degrades honestly.** A ticker with six weeks of history gets the indicators six weeks
support; the long moving averages report `null` rather than a figure invented from too few
bars. If Postgres or the embedding model is unavailable, analyses and the comparison table
work normally and only the verdict reports itself unavailable.

**Bilingual (EN/ES)** — the static UI and the generated analysis, including the headings the
model is instructed to emit.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) · TypeScript · Tailwind CSS |
| Backend | FastAPI · Python 3.12 · asyncpg |
| Retrieval | PostgreSQL + pgvector · fastembed (ONNX) |
| AI | DeepSeek (any OpenAI-compatible endpoint) |
| Data | Finnhub · Alpaca · SEC EDGAR |
| Infra | Docker Compose · nginx · GitHub Actions |

## Quick start

```bash
git clone https://github.com/oscardanielnc/tickerlens.git
cd tickerlens
cp .env.example .env   # add your API keys (Finnhub's free tier is enough to start)
docker compose up --build
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs (dev only — the production proxy does not route them)

The embedding model (~130MB) downloads on first boot; until it finishes, retrieval reports
unavailable and everything else works.

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

## Deploying the public demo

```bash
cp .env.example .env   # keys, CORS_ORIGINS for your host, and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

nginx becomes the single entry point on `:8081`, serving the frontend and forwarding `/api/`
to the backend, so the browser only ever talks to one origin. Postgres is not published —
only the backend reaches it, over the compose network.

Generate `POSTGRES_PASSWORD` as **hex**, not base64: the value is interpolated into
`DATABASE_URL`, and the `/` and `+` base64 produces get parsed as DSN separators.

### The proxy trust model (please don't loosen this)

The demo spends my provider quota and AI tokens, so the per-IP rate limit is the only thing
bounding the bill. That limit is keyed on the client IP uvicorn derives from
`X-Forwarded-For`, which makes the header a security boundary rather than a convenience:

- **nginx sets `X-Forwarded-For: $remote_addr`**, overwriting whatever the client sent. Using
  `$proxy_add_x_forwarded_for` instead *appends* to the client's own value, and uvicorn reads
  the first entry — so a visitor could hand themselves a fresh rate-limit bucket on every
  request just by varying a header.
- **`--forwarded-allow-ips` names the compose subnet**, never `*`. With `*` uvicorn trusts the
  header from any peer, which is what makes the spoof above work at all. The subnet is pinned
  in the compose file so it cannot drift when containers are recreated.

Change one of these and the limits stop applying. Both are needed.

## Project structure

```
├── frontend/                  # Next.js app (UI, i18n EN/ES)
│   └── src/
│       ├── components/ai/         # streamed-markdown renderer with citation markers
│       ├── components/analysis/   # per-ticker panels
│       └── components/compare/    # head-to-head table + RAG verdict panel
├── backend/
│   └── app/
│       ├── api/routes/        # HTTP + SSE endpoints
│       ├── core/              # settings, cache, rate limiting, pgvector, embeddings
│       ├── providers/         # market data / news / fundamentals connectors
│       └── services/          # indicators, levels, RAG, prompts
├── deploy/nginx.conf          # reverse proxy for the public demo
├── docker-compose.yml         # local development
└── docker-compose.prod.yml    # public demo (nginx + pgvector)
```

## Roadmap

- [x] Phase 0 — Foundation: monorepo, Docker, CI, provider interfaces
- [x] Phase 1 — Ticker analysis page: charts, technical levels, cited AI bull/bear case, earnings, news
- [x] Phase 2 — Recent-search sidebar & head-to-head compare (localStorage, nothing leaves the browser)
- [x] Phase 3 — RAG: pgvector index over computed analyses, symmetric retrieval, grounded comparison verdict
- [ ] Phase 4 — Conversational RAG chat over your analysis history
- [ ] Phase 5 — Eval suite for retrieval quality and AI output

## License

MIT
