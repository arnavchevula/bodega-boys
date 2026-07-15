# Bodega Boys Transcript App — Plan

## Concept

Web app cataloging all ~253 Bodega Boys podcast episodes with full transcripts, speaker-attributed utterances, searchable content, and rich metadata for the fan base.

**Architecture:** Python pipeline (one-time ETL) → Supabase → Next.js frontend. Once the pipeline runs, AssemblyAI is never needed again unless new content is added.

---

## Step 1: Download Audio

`yt-dlp "PLAYLIST_URL"` on its own is a single blocking call that downloads the whole playlist internally — your script gets no control between episodes. Instead, seed the DB first, then download one episode at a time inside the pipeline loop (Step 2).

### ✅ 1a. Seed the episode list (one-time)

```bash
yt-dlp --flat-playlist -J "PLAYLIST_URL" > playlist.json
```

`--flat-playlist` is fast (no per-video extraction) and returns `entries[]` with `id`/`title`. Parse this and insert one row per episode into `episodes` with `pipeline_status='pending'`. This becomes the source of truth for the whole pipeline — no separate `urls.txt` to keep in sync.

Note: flat-playlist won't reliably give `duration_ms`/`upload_date`/`thumbnail_url` — backfill those per-episode in step 1b rather than doing a slow full `-J` pass over all 253 videos upfront.

### 1b. Per-episode download (inside the state machine loop)

For each `pending` episode:

- First check for existing auto-captions: `yt-dlp --write-auto-subs --skip-download` — if they exist, use them (free, instant). Quality will be rough and no speaker diarization, but worth checking.
- If no captions, download audio only (mp3, 64kbps — enough for speech, minimal storage):

```bash
yt-dlp -f bestaudio -x --audio-format mp3 --audio-quality 64K \
  --write-info-json \
  -o "%(id)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

- Read the resulting `.info.json` to backfill `duration_ms`, `date`, `thumbnail_url` on the episode row.
- Don't batch-download everything upfront. Download one episode → submit to AssemblyAI → delete local mp3 + json → move on. Only one episode on disk at a time.
- ~253 episodes × ~1.5hrs avg

---

## Step 2: Transcription Pipeline (Python, one-time)

**Provider: AssemblyAI Universal-3 Pro**

AssemblyAI is async — you submit a job and poll for completion. The script is a state machine, not a simple loop, so it can be killed and restarted safely at any point without re-transcribing or double-spending.

### ✅ Chosen features (locked in — adding later = retranscribe)

| Feature             | Config key                                                                      | Add-on cost | Why                                                |
| ------------------- | ------------------------------------------------------------------------------- | ----------- | -------------------------------------------------- |
| Speaker Diarization | `speaker_labels=True`                                                           | +$0.02/hr   | Desus vs. Mero attribution                         |
| Sentiment Analysis  | `sentiment_analysis=True`                                                       | +$0.02/hr   | Surface hype moments, heated takes                 |
| Key Phrases         | `auto_highlights=True`                                                          | +$0.01/hr   | Quotable lines, episode highlights                 |
| Entity Detection    | `entity_detection=True`                                                         | +$0.08/hr   | Athletes, politicians, Bronx locations auto-tagged |
| Code switching      | `language_detection=True` + `code_switching=True`, `language_codes=["en","es"]` | —           | Mero switches to Dominican Spanish                 |

**Skipping:** Topic Detection (IAB taxonomy — poor fit for hip-hop; use Claude for custom tagging instead), Auto Chapters + Summarization (deprecated on Universal-3).

**keyterms_prompt:** Start empty. Add terms only after reviewing first few transcripts — names/slang the model consistently gets wrong. Overcrowding it causes hallucinations.

**Total rate: $0.34/hr**

### Cost estimate

| Scenario        | Hours  | Gross cost | After $50 free credit |
| --------------- | ------ | ---------- | --------------------- |
| Low (1hr avg)   | 253hrs | $86        | ~$36                  |
| Mid (1.5hr avg) | 380hrs | $129       | **~$79**              |
| High (2hr avg)  | 506hrs | $172       | ~$122                 |

### Pipeline state machine

Each episode has a `pipeline_status` in Supabase: `pending → downloading → completed | failed`

The script on each run:

1. Process `pending` episodes: mark `downloading` → download audio → transcribe (blocks until AssemblyAI returns) → write results → mark `completed`
2. Never reprocess `completed` episodes

Every DB write is a checkpoint. Crash anywhere, restart, continues from where it left off.

Note: `Transcriber.transcribe()` is blocking — the script waits for each transcript before moving to the next episode, so there are never "submitted" jobs sitting in the DB between runs. The tradeoff is throughput (one job at a time) vs. simplicity. For a one-time 253-episode pipeline running unattended, this is fine.

Crash edge case: if the script dies mid-transcription, AssemblyAI may have already started the job (double-billing risk). Episode stays `downloading` — safe to re-submit on restart, just rare wasted cost.

### ✅ SDK: assemblyai Python SDK

Using `assemblyai` Python SDK (not raw `requests`). SDK handles upload and polling internally. For the async state machine, use `Transcriber.submit()` to get a transcript ID immediately, then poll `submitted` jobs separately.

### Safe prototyping flags

- `--dry-run` — prints what would happen, no API calls, no DB writes
- `--limit N` — process only N episodes (test on 3 before unleashing 253)
- Test against AssemblyAI's sample audio file before touching real episodes

---

## Step 3: Supabase Schema

Store utterances as rows, not JSON blobs — enables queries like `WHERE speaker = 'Desus' AND sentiment = 'NEGATIVE'`.

```
episodes
  id, youtube_id, title, date, duration_ms, thumbnail_url
  pipeline_status, assemblyai_transcript_id

transcripts
  episode_id, full_text
  search tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(full_text, ''))) STORED
  → GIN index on search

utterances
  episode_id, speaker (0|1 → "Desus"/"Mero"), text, start_ms, end_ms, sentiment
  search tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED
  → GIN index on search
  → vector(N) column for pgvector embeddings (Step 4)

entities
  episode_id, text, entity_type, start_ms

key_phrases
  episode_id, phrase, count

annotations
  id, episode_id, utterance_id (nullable — null = episode-level note)
  user_id (references auth.users), reddit_username (denormalized for display)
  kind ('note' | 'correction')
  target (nullable — what a correction targets: 'speaker' | 'text' | 'entity' | 'topic' | 'skit')
  body, score (cached, derived from annotation_votes), created_at

annotation_votes
  annotation_id, user_id, value (1 | -1)
  unique (annotation_id, user_id)
```

### Full-text search: tsvector + GIN

`tsvector` is built into Postgres — no extension needed. It converts text into normalized word stems ("running" → "run") for keyword search. A generated column means Postgres maintains it automatically; no trigger or pipeline step required.

The `tsvector` column can't be added via the Supabase table UI — use the SQL editor:

```sql
-- utterances (preferred — gives timestamp-level results)
ALTER TABLE utterances
  ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
CREATE INDEX utterances_search_idx ON utterances USING GIN (search);

-- transcripts (episode-level search / ranking)
ALTER TABLE transcripts
  ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(full_text, ''))) STORED;
CREATE INDEX transcripts_search_idx ON transcripts USING GIN (search);
```

Search on `utterances` rather than `transcripts` wherever possible — utterance results link directly to a timestamp, which is what the frontend needs. Searching the full transcript only tells you "this episode mentions X somewhere."

Caveat: Postgres tsvector loses position accuracy beyond ~16k lexemes per row. Full episode transcripts (~15-20k words) hit this limit, making phrase search unreliable on `transcripts.full_text`. Utterance-level search sidesteps this since each utterance is short.

### Semantic search: pgvector

`pgvector` is a Postgres extension for storing ML embedding vectors — arrays of floats that encode the _meaning_ of text, produced by an embedding model. Lets you search by concept rather than keyword ("find all times they talked about the Knicks losing" even if those exact words aren't used).

|             | tsvector          | pgvector                                    |
| ----------- | ----------------- | ------------------------------------------- |
| Search type | Keyword           | Semantic / meaning                          |
| Requires ML | No                | Yes (embedding model call per utterance)    |
| Example     | `"Kawhi Leonard"` | "times they talked about losing"            |
| Built-in    | Yes               | Extension (enable in Supabase → Extensions) |

Enable pgvector in Supabase: Database → Extensions → search "vector" → enable. Then add the column via SQL:

```sql
-- dimension depends on embedding model (OpenAI ada-002 = 1536, etc.)
ALTER TABLE utterances ADD COLUMN embedding vector(1536);
CREATE INDEX utterances_embedding_idx ON utterances
  USING ivfflat (embedding vector_cosine_ops);
```

Embedding utterances is a post-pipeline Step 4 task — run after all transcripts are complete. Embed utterances, not full transcripts, for precise timestamp-level semantic search results.

---

## Step 4: AI Enrichment (Post-transcription)

Run completed transcripts through Claude for things AssemblyAI doesn't handle:

- **Custom topic tagging** — sports, Bronx culture, pop culture, politics, etc. (better than IAB taxonomy)
- **Skit detection** — recurring bits by name/type, timestamp range
- **Outro rant extraction** — consistent format, detect by pattern + prompt
- **Character detection** — recurring impressions/characters Desus & Mero do
- **Utterance embeddings** — call an embedding model on each utterance to populate `utterances.embedding` for pgvector semantic search
- **Chapter / segmentation** Segment each transcript into chapters / segments with topics or headlines

This is cheap (text-in, no audio) and can be re-run anytime without touching AssemblyAI.

### Subreddit context (r/bodegaboys)

Grab an archive of the Bodega Boys subreddit (via Reddit API or Pushshift dump) and match discussion threads to episodes by title/number. Useful for:

- **Episode-level context** — fans explain inside jokes, identify guests, name skits in discussion threads
- **Catchphrase/slang glossary** — recurring terms the community already cataloged
- **Corrections** — fans catch misidentified speakers or references

Use as supplemental context for Claude: when processing a transcript, pass the matching subreddit thread alongside it to improve skit detection, character identification, and speaker cleanup. Do the initial Claude pass without subreddit data first — see where it struggles, then bring in subreddit context to fill those gaps.

---

## Step 5: App

**Stack:** Next.js + Supabase client SDK + Tailwind. No API routes needed for most features — direct Supabase queries from the frontend.

**Pages/features:**

- `/episodes` — browseable list with filters (year, tags, speaker, topic)
- `/episodes/[id]` — full transcript with speaker-attributed utterances, timestamps, highlighted skits
  - Speaker stats: one shared segmented/stacked progress bar showing all speakers' time share across the full width, then a 4-column grid (label col + one col per speaker) with avatar headers and rows for word count and turn count. Absent speakers (e.g. Victor on a 2-person episode) render greyed out/grayscale. No per-speaker individual bars — word count % and time % track too closely to justify two bars.
  - YouTube embed (via `youtube_id`) so users can watch while reading the transcript
  - Mini avatar next to each utterance row in the transcript
  - Per-speaker accent color (`border-l-4`) on utterance rows for scannability
  - Sticky speaker filter to show only one speaker's lines at a time
  - Prev/next episode navigation
  - Fix timestamp display bug (seconds column currently shows `start_ms / 1000 % 60` which is wrong — should be `Math.floor(start_ms / 1000) % 60`)
  - **Requires enrichment:** key phrases, entity tags, skit markers, topic tags, notable quotes callouts
- `/characters` — recurring characters/impressions with all appearances linked
- `/skits` — catalog of recurring bits across episodes
- `/rants` — outro rant archive, sortable/searchable
- `/search` — full-text + semantic search across all transcripts
- Community annotations — fans add notes/corrections to specific utterances (see below)

### Auth: Reddit OAuth

Enable Reddit as a Supabase Auth provider (register a Reddit "web app" with redirect URI = Supabase's OAuth callback). This ties contributions to real r/bodegaboys identities — store/display the Reddit username (from `user.user_metadata`) on each annotation.

- RLS: anyone (including anon) can `SELECT` annotations; `INSERT` requires `auth.uid()`; `UPDATE`/`DELETE` restricted to the annotation's owner
- No accounts needed for read-only browsing — login is only required to contribute

### Community annotations (Genius-style overlay)

Two kinds, both stored in the `annotations` table and never mutating the canonical transcript/entity/skit data:

- **Note** — extra context (NYC slang, references, who/what they're talking about, inside jokes, "this is the bit where...")
- **Correction** — flags that AssemblyAI/Claude got something wrong (misheard line, wrong speaker, mistagged entity/topic/skit). `target` records what's being corrected; `body` holds the suggested fix.

UI on `/episodes/[id]`: utterances with annotations show a small badge/count; clicking expands a thread sorted by `score` (Reddit-style up/down voting via `annotation_votes`). Corrections render visually distinct from notes (e.g. a small tag + suggested replacement) but the underlying transcript stays untouched — high-vote corrections are just a strong signal for _you_ to revisit the source data later if you ever do a manual cleanup pass.

Lightweight anti-spam for later: rate-limit annotations per user/hour, auto-collapse notes below a negative score threshold.

---

## Future Content

If adding more content later (older Hot 97 episodes, Viceland show, Showtime show), the same pipeline applies. Video content (Viceland/Showtime) requires extracting audio first before sending to AssemblyAI — same pipeline otherwise. Rerun only for new episodes; existing transcripts are never touched.

---

## Notes

- Speaker diarization won't be perfect on early/chaotic episodes — budget time for a manual cleanup pass
- The `assemblyai_transcript_id` stored in Supabase means you can always re-fetch raw AssemblyAI output if needed
- pgvector semantic search is a killer feature — embed utterances, not just full transcripts, for precise timestamp-level results
- Consider a simple admin UI to correct speaker labels and skit annotations before publishing

- transform this

```json
{
  "Desus Nice": {
    "words": 123,
    "time": 456,
    "turns": 789
  },
  "The Kid Mero": {
    "words": 123,
    "time": 456,
    "turns": 789
  },
  "Victor Lopez": {
    "words": 123,
    "time": 456,
    "turns": 789
  }
}
```

into

```json
{
  "Desus Nice": { "offset": "0%" },
  "The Kid Mero": { "offset": "50%" },
  "Victor Lopez": { "offset": "95%" }
}
```
