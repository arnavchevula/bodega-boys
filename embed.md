# Search — Plan (`embed.py` + web app wiring)

Two independent search modes over `utterances`, both ending up behind the same `/search` page:

|                 | Lexical (tsvector)                         | Semantic (pgvector)                                                       |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Status          | Column already added (`utterances.search`) | Not started                                                               |
| Finds           | Exact words/stems ("Kawhi Leonard")        | Concepts, no exact-word match needed ("times they talked about losing")   |
| Cost            | Free, built into Postgres                  | One Voyage API call per utterance (one-time), one per query (ongoing)     |
| Query mechanism | `supabase-js` `.textSearch()`              | Postgres RPC function (`<=>` isn't expressible through PostgREST filters) |

Neither depends on the other — build/ship lexical first since its column already exists, add semantic after `embed.py` has backfilled `embedding` for all 245k utterances.

You signed into Voyage Ai using arnav.chevula@gmail.com SSO

---

## 1. Lexical search — already schema-complete

You already ran the `ALTER TABLE` per `bodega-boys-app-plan.md` §"Full-text search":

```sql
ALTER TABLE utterances
  ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
CREATE INDEX utterances_search_idx ON utterances USING GIN (search);
```

(If you named the column something other than `search`, swap it below — nothing else changes.)

### 1.1 Querying it from the web app

`supabase-js` supports full-text search directly through PostgREST — no RPC needed for the basic case:

```ts
const { data, error } = await db
  .from("utterances")
  .select("id, episode_id, speaker, text, start_ms, end_ms")
  .textSearch("search", query, { type: "websearch", config: "english" })
  .limit(20);
```

`type: "websearch"` maps to Postgres's `websearch_to_tsquery` — accepts plain human input (`"knicks losing"`, `"desus OR mero"`, `-mero` to exclude), which is what a search box should be handed instead of `plainto_tsquery`'s stricter AND-only matching.

### 1.2 Ranking (optional v2)

`.textSearch()` filters but doesn't rank by relevance — Postgres's `ts_rank` isn't reachable through a plain PostgREST filter, only through a SQL function. Skip this for v1 (GIN-filtered results in insertion/id order are fine to ship first); add later if result ordering matters once real queries come in:

```sql
CREATE OR REPLACE FUNCTION search_utterances_ranked(query text, match_count int DEFAULT 20)
RETURNS TABLE (id uuid, episode_id uuid, speaker text, text text, start_ms int, end_ms int, rank real)
LANGUAGE sql STABLE AS $$
  SELECT id, episode_id, speaker, text, start_ms, end_ms,
         ts_rank(search, websearch_to_tsquery('english', query)) AS rank
  FROM utterances
  WHERE search @@ websearch_to_tsquery('english', query)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
```

Called the same way as the semantic RPC below: `db.rpc("search_utterances_ranked", { query, match_count: 20 })`.

---

## 2. Semantic search — `embed.py` + pgvector

### 2.1 Model

Voyage AI `voyage-3.5-lite`, truncated to **512 dimensions**. Cheap (a few dollars total for 245k utterances), no tuning needed, and Anthropic's recommended embedding partner if you'd rather not add an OpenAI key on top of `ANTHROPIC_API_KEY`. Add to `.env`:

```
VOYAGE_API_KEY=
```

Add to `pyproject.toml`: `voyageai`.

### 2.2 Schema

Enable the extension once (Supabase dashboard → Database → Extensions → search "vector" → enable, or `CREATE EXTENSION IF NOT EXISTS vector;` in the SQL editor), then:

```sql
ALTER TABLE utterances ADD COLUMN embedding vector(512);

-- HNSW over IVFFlat: no lists-tuning step needed, better query-time recall
-- at 245k rows, worth the slightly slower index build.
CREATE INDEX utterances_embedding_idx ON utterances
  USING hnsw (embedding vector_cosine_ops);
```

**Also needed before running `embed.py` at scale:** `fetch_unembedded`'s `WHERE embedding IS NULL ORDER BY id` query has no index to support the `IS NULL` filter — the `id` primary key index only accelerates the ordering, not the filter, so Postgres still has to heap-fetch and discard every already-embedded row (random I/O, since `id` is a UUID with no correlation to physical row order) before reaching the next unembedded one. That cost grows every page and hit Supabase's statement timeout partway through the real backfill (~15k rows in). Fix with a partial index scoped to exactly the pending rows, which shrinks automatically as rows get embedded:

```sql
CREATE INDEX utterances_embedding_pending_idx ON utterances (id)
WHERE embedding IS NULL;
```

Without this, `embed.py` works fine for small `--limit` runs but degrades and eventually times out over the full table.

### 2.3 `embed.py` — standalone script

Same shape as `main.py`/`enrich.py`: own Supabase client, own `.env` load, `--dry-run`/`--limit` flags. No awareness of `enrichment_status`/`speaker_check_status` — only ever looks at `text` and `embedding`.

The version actually run (`embed.py` in the repo root) diverges from the first sketch below it in several ways forced by what happened during the real backfill (see "What went wrong" below): it loops pages until nothing's left instead of doing one fetch, retries transient errors (on the fetch, the Voyage call, and the DB write) via a shared `with_retry` helper, and writes each batch as a single upsert instead of one `UPDATE` per row.

```python
# embed.py
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import argparse
import time
import voyageai

supabase: Client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
vo = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])

BATCH_SIZE = 128  # Voyage's per-request batch cap for this model tier
MODEL = "voyage-3.5-lite"
DIMENSIONS = 512
MAX_RETRIES = 5

def with_retry(description, fn):
    # Covers DB-side blips (connection resets, statement timeouts — including
    # from the pending-rows fetch itself, since autovacuum can fall behind
    # mid-backfill regardless of write batching) and Voyage-side ones (e.g. a
    # brief local network drop killing the request mid-flight; voyageai's own
    # internal retries don't always absorb this).
    for attempt in range(MAX_RETRIES):
        try:
            return fn()
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2 ** attempt
            print(f"[retry] {description} failed ({e!r}), retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(wait)

def fetch_unembedded(limit=None):
    query = (
        supabase.table("utterances")
        .select("id, text")
        .is_("embedding", "null")
        .order("id")
    )
    if limit:
        query = query.limit(limit)
    return with_retry("fetch unembedded", lambda: query.execute().data)

def embed_batch(texts: list[str]) -> list[list[float]]:
    result = with_retry(
        "voyage embed",
        lambda: vo.embed(texts, model=MODEL, output_dimension=DIMENSIONS, input_type="document"),
    )
    return result.embeddings

def db_upsert_batch(table, records, dry_run):
    # One request per batch instead of one per row (only `id`/`embedding`
    # provided, so DO UPDATE only touches those two columns): cuts write
    # statements/round-trips ~128x. Note this does NOT reduce the number of
    # dead tuples generated (that's a function of rows changed, not
    # statements issued) — the partial index on `embedding IS NULL` can
    # still bloat under sustained load regardless of batching; see #5 below.
    if dry_run:
        print(f"[DRY RUN] would upsert {len(records)} rows into {table}")
        return
    response = with_retry(
        f"upsert into {table}",
        lambda: supabase.table(table).upsert(records, on_conflict="id").execute(),
    )
    if not response.data:
        raise RuntimeError(f"Upsert into {table} returned no rows (blocked by RLS?) — {len(records)} records")

def process_batch(batch, dry_run, batch_num):
    texts = [r["text"] or "" for r in batch]
    if dry_run:
        print(f"[DRY RUN] would embed batch {batch_num} ({len(batch)} rows)")
        return
    vectors = embed_batch(texts)
    records = [{"id": row["id"], "embedding": vector} for row, vector in zip(batch, vectors)]
    db_upsert_batch("utterances", records, dry_run)
    print(f"embedded batch {batch_num} ({len(batch)} rows)")

def main(dry_run: bool, limit: int | None):
    batch_num = 0
    total = 0
    while True:
        # Each fetch is capped server-side (PostgREST's max-rows setting), and
        # completed rows drop out of the WHERE embedding IS NULL filter, so
        # re-fetching from scratch each outer iteration walks the whole table
        # without needing an offset/cursor.
        rows = fetch_unembedded(limit)
        if not rows:
            break
        print(f"{len(rows)} utterances missing embeddings (this page)")
        for i in range(0, len(rows), BATCH_SIZE):
            process_batch(rows[i:i + BATCH_SIZE], dry_run, batch_num)
            batch_num += 1
        total += len(rows)
        if dry_run or limit:
            break
    print(f"done — {total} utterances processed" if not dry_run else "dry run complete")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    main(args.dry_run, args.limit)
```

Note `input_type="document"` — Voyage's models are trained with asymmetric query/document instructions baked in; use `"document"` here (indexing side) and `"query"` at search time (§2.5). Passing the wrong one doesn't error, it just degrades match quality.

`WHERE embedding IS NULL` doubles as the pending-work marker (same trick `enrich.md` uses elsewhere) — safe to rerun anytime, including after new episodes land.

#### What went wrong running this at scale, and how it was fixed

Three separate issues surfaced only once the real 245k-row backfill was running — each one only shows up past a certain scale, so none of them were caught by the `--dry-run --limit 10` / `--limit 500` staged rollout in §2.4. In order:

1. **Voyage rate limit.** No payment method on the Voyage account capped requests to 3 RPM, which would have made the full run take ~10 hours. Fixed by adding a payment method (Voyage's own error message says standard limits apply "after several minutes," not instantly).
2. **Unbounded fetch silently capped at 10k rows.** `fetch_unembedded` with no `--limit` still only ever got back 10,000 rows per call — Supabase/PostgREST enforces its own server-side max-rows setting regardless of what limit (or none) the client asks for. A single `.limit(245000)` call would hit the same wall. Fixed by looping `fetch_unembedded` in `main()` until it returns empty, relying on completed rows dropping out of the `WHERE embedding IS NULL` filter each iteration — no offset/cursor needed.
3. **Statement timeouts, two different causes:**
   - First cause: no index supports the `embedding IS NULL` filter, so Postgres has to heap-fetch and discard every already-embedded row (random I/O, since `id` is a UUID uncorrelated with physical layout) before reaching the next pending one — cost that grows every page. Fixed by the partial index in §2.2 (`utterances_embedding_pending_idx`).
   - Second cause, after the partial index was in place: writing one `UPDATE` per row (245k individual statements) generates a dead tuple per write; at that rate autovacuum couldn't keep up, and the partial index bloated with stale entries for row versions that no longer matched its `WHERE` clause, causing fetches to time out again around ~30k rows in. Fixed two ways — a one-time `VACUUM (VERBOSE, ANALYZE) utterances;` run manually in the SQL editor to clear the existing bloat (can't run inside a function/RPC, has to be a top-level statement), and switching every batch write from N individual `.update()` calls to one `.upsert(records, on_conflict="id")` call per batch (only `id`/`embedding` in the payload, so it only touches those two columns) — cutting write statements ~128x so autovacuum can keep pace going forward.
4. **A bare local network drop killed the whole run.** A brief connectivity blip mid-run raised `voyageai.error.APIConnectionError: ... OSError(49, "Can't assign requested address")` straight out of the Voyage call — the DB writes already had retry/backoff (from fixing #3), but the Voyage embedding call didn't have our own retry around it, only relying on voyageai's internal `tenacity` retries, which didn't absorb this particular failure. Fixed by pulling the retry/backoff loop out into a shared `with_retry(description, fn)` helper and wrapping both `embed_batch` (the Voyage call) and the upsert (the DB call) with it, so either side recovers from a transient drop instead of crashing the process. No data lost either time — `WHERE embedding IS NULL` means a crash just means re-running picks up exactly where it left off.
5. **Statement timeouts recurred even with batched upserts, and this time crashed on the fetch itself.** The batching fix in #3 was based on an incomplete theory — batching cuts the number of *round trips* (~128x fewer), but each row transitioning `NULL` → non-null still leaves exactly one dead tuple / stale partial-index entry regardless of whether it was written individually or as part of a batch, since that's a function of rows changed, not statements issued. If anything, batching finishes each page *faster* in wall-clock terms, giving autovacuum *less* real time between pages to catch up — Postgres's default autovacuum thresholds (~20% of the table, i.e. ~49k dead rows before it's even considered) couldn't keep pace with a sustained 200k+ row bulk load. On top of that, `fetch_unembedded` had no retry wrapper of its own at the time, so when the fetch itself timed out, the whole process died instead of just that one call. Fixed two ways — tuning autovacuum to be far more aggressive specifically during the bulk load (`ALTER TABLE utterances SET (autovacuum_vacuum_scale_factor = 0.0, autovacuum_vacuum_threshold = 2000);`, reversible afterward via `RESET`), and wrapping `fetch_unembedded` in the same `with_retry` helper so a stray timeout self-heals instead of crashing the run.
6. **Upsert timeouts kept recurring anyway, escalating in frequency until one batch exhausted all 5 in-process retries.** Checked `pg_stat_user_tables` and `pg_stat_progress_vacuum` mid-run: `n_dead_tup` was only 89 and no vacuum was actively running — the aggressive autovacuum tuning from #5 was working correctly, so this wasn't the same bloat/contention problem recurring. Most likely just inherent variability under a shared/free-tier compute instance during a sustained multi-hour write load — not something further client-side tuning can fully eliminate. Rather than chase deeper in-process retry logic, leaned on the fact the script is already fully idempotent (`WHERE embedding IS NULL` tracks progress) and wrapped the whole invocation in an outer shell loop that just restarts `embed.py` on any nonzero exit until it finishes clean: `until uv run embed.py; do sleep 5; done`. A crash mid-run now costs a few seconds of restart overhead, nothing more — no further code changes needed.

Debugging note: if you spot-check progress with a query like `ORDER BY id DESC` expecting to see "the latest embedded rows," it'll scan from the wrong end — `embed.py` always processes ascending `id` order, so completed rows accumulate at the *low* end of the id range while the *high* end is still all NULL. A `DESC`-ordered check has to scan past the entire pending region first (looked identical to the real timeout bug, cost real debugging time). Check with `ORDER BY id ASC` instead, or drop the `ORDER BY` and just filter.

### 2.4 Running it

```
uv run embed.py --dry-run --limit 10   # sanity check batching, no writes
uv run embed.py --limit 500            # small real batch, spot-check a few rows in the console
uv run embed.py                        # full 245k run
```

### 2.5 Query-side RPC (needed — PostgREST can't order by `<=>` directly)

```sql
CREATE OR REPLACE FUNCTION match_utterances(query_embedding vector(512), match_count int DEFAULT 20)
RETURNS TABLE (id uuid, episode_id uuid, speaker text, text text, start_ms int, end_ms int, similarity real)
LANGUAGE sql STABLE AS $$
  SELECT id, episode_id, speaker, text, start_ms, end_ms,
         1 - (embedding <=> query_embedding) AS similarity
  FROM utterances
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

Called from the app as `db.rpc("match_utterances", { query_embedding, match_count: 20 })`.

---

## 3. Web app changes (`bodega-chat`)

Everything currently in `bodega-chat` fetches data directly in server components via `lib/db.js`'s `supabase()` — there's no `app/api/*` route yet. Semantic search breaks that pattern because it needs a **server-only secret** (`VOYAGE_API_KEY`) to embed the query string before it can hit `match_utterances`, and `search/page.tsx` is already a client component with an interactive input — so it needs a server endpoint to call into, not a direct RSC fetch.

**Before writing any of this: `bodega-chat/AGENTS.md` flags that this Next.js version has route/convention differences from training-data Next.js — check `node_modules/next/dist/docs/` for the current Route Handler / Server Action shape before implementing, don't assume the familiar `app/api/*/route.ts` signature is unchanged.**

### 3.1 Env vars

Add to `bodega-chat/.env` (server-only — never prefix with `NEXT_PUBLIC_`, since it must not reach the client bundle):

```
VOYAGE_API_KEY=
```

### 3.2 A server-side search endpoint

One handler, both modes, so the client only makes one request per search and the page can render both result sets together:

```
POST /api/search   { query: string }
  → { lexical: UtteranceResult[], semantic: UtteranceResult[] }
```

Server-side logic:

1. Run the lexical query (§1.1) and the semantic query in parallel — embed `query` via Voyage (`input_type="query"`, same `voyage-3.5-lite`/512-dim as `embed.py`) then call `match_utterances` (§2.5) via `db.rpc(...)`.
2. Return both arrays tagged by source, not merged — let the UI decide how to present them (§3.3) rather than forcing a single blended ranking now. A hybrid rank (e.g. Reciprocal Rank Fusion over both lists) is a reasonable v2 if usage shows people want one unified list, not needed to ship v1.

### 3.3 `search/page.tsx`

Currently a static input with no state wiring (`useState()` with no type, no `onChange`, no submit handler). Needs:

- Controlled input (`value`/`onChange`), submit on button click + Enter key.
- Debounced or explicit-submit fetch to `/api/search` (explicit-submit is simpler and fine for v1 — a podcast search box doesn't need live-as-you-type).
- Loading state while the request is in flight (semantic leg is the slow one — an API round-trip to Voyage plus the DB query, budget for it to feel slower than lexical).
- Results list per utterance: `speaker`, `text` (highlight matched terms for the lexical results), a link to `/episodes/[episodeId]?t=<start_ms>`.

### 3.4 Timestamp deep-linking (new — doesn't exist yet)

Checked `episodes/[episodeId]/page.tsx` — there's currently no `searchParams`-driven seek into the embedded player. Search results are only useful if clicking one jumps straight to that moment, so this needs adding regardless of which search mode surfaces the hit:

- Read a `t` (ms) search param on the episode page.
- On mount, seek the embedded player to `t` — exact mechanism depends on what iframe/player is embedded (check the current `height="400"` iframe block around line 340 of that file for what player it is and whether it exposes a postMessage/URL-param seek API).
- Search results link as `/episodes/${episode_id}?t=${start_ms}`.

---

## 4. Suggested build order

1. `search/page.tsx`: wire the input to `.textSearch()` lexical results only (§1.1), no RPC, no ranking yet — ships something real using the column you already have.
2. Add `?t=` deep-linking to the episode page (§3.4) so lexical results are actually useful, not just a list of text snippets.
3. `embed.py` (§2.3): `--dry-run --limit 10` → `--limit 500` spot-check → full run over 245k utterances. Independent of the app work above; can happen in parallel.
4. `match_utterances` RPC (§2.5) once embeddings exist.
5. `/api/search` route combining both (§3.2), update `search/page.tsx` to call it and render both result sets.
6. Optional: `ts_rank` version of lexical (§1.2), hybrid ranking across both lists — only if real usage shows plain filtering/two-lists isn't good enough.
