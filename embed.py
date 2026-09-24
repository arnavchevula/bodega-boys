from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import argparse
import time
import voyageai

supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)
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
    # still bloat under sustained load regardless of batching; see the
    # autovacuum tuning note in embed.md.
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
    parser.add_argument("--dry-run", action="store_true", help="Fetch and batch rows but skip Voyage calls and DB writes")
    parser.add_argument("--limit", type=int, default=None, help="Only process this many unembedded rows (for testing)")
    args = parser.parse_args()
    main(args.dry_run, args.limit)
