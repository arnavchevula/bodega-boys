# Enrichment Pipeline — Plan (`enrich.py` + `embed.py`)

## Current state

- `main.py` has run to completion: 265/265 episodes `pipeline_status='completed'`, with `transcripts`, `utterances` (245k rows), `entities` (242k rows), `key_phrases` (3.8k rows) populated.
- `enrich.py` is currently a stub — only a draft system prompt, no API calls, no schema, no writes.
- This doc covers everything needed to take `enrich.py` from stub to a restart-safe batch job over all 265 episodes, plus a standalone `embed.py` for pgvector semantic search.

Three stages, split across two scripts because two of them are tightly coupled and one isn't:

1. **Speaker correction** (§2) — must run first per episode; gates stage 2. Lives in `enrich.py`.
2. **Claude enrichment** (§4) — text reasoning over each episode's utterances → characters, stories, AKAs, media references, topics, intro boundary. Only runs once an episode's speaker labels are verified. Lives in `enrich.py`, same loop as stage 1.
3. **Embeddings** (§5) — text → vector for every utterance, no reasoning involved, no dependency on 1 or 2 (only touches utterance *text*, which neither stage modifies). Its own script, `embed.py`.

### Orchestration

Stages 1 and 2 share `enrich.py`'s per-episode loop (both need that episode's utterances, so fetch once and run both gated stages back-to-back) — but **only stage 2 calls Claude.** Stage 1 is pure detection: mechanical checks (SQL/regex/langid, see §2.1) classify each episode as `verified` or `needs_review`, with zero AI calls and zero writes to `utterances.speaker`. A flagged episode gets fixed by hand — you read the evidence the detector prints, listen to/skim the relevant stretch, and run the correction `UPDATE` yourself in the Supabase console (§2.3). Enrichment (§4) is the one Claude call in this script, and it only runs once an episode's speaker labels are verified — it shouldn't spend a call reasoning over characters/stories/AKAs using a speaker column that might still be wrong, since that reasoning would have to be redone anyway once the labels are fixed.

```python
# enrich.py
for episode in episodes where pipeline_status == 'completed':
    if speaker_check_status == 'pending':
        status = classify(fetch_utterances(episode))    # free — no AI
        episode.speaker_check_status = 'verified' if status == 'verified' else 'needs_review'
        if status != 'verified':
            print evidence for manual review              # you fix it by hand in the console
    if speaker_check_status == 'verified' and enrichment_status == 'pending':
        run_enrichment(episode)                            # the only Claude call in this script
```

Because `classify()` is deterministic and re-run on every pass, fixing a flagged episode by hand and re-running the script is enough — there's no manual status-flipping to do. Once your console `UPDATE` makes the episode pass `classify()` again, `speaker_check_status` flips to `verified` on its own on the next run and enrichment picks it up.

```python
# embed.py — entirely separate script, own supabase client, own CLI
for batch in utterances where embedding IS NULL, batched 200 at a time:
    run_embeddings(batch)
```

`embed.py` has no knowledge of `speaker_check_status`/`enrichment_status` at all — it can be run before, during, or after `enrich.py`, and rerun anytime later as new episodes get added, since it only ever looks for `embedding IS NULL`. Sharing a couple lines of boilerplate (supabase client init, `.env` loading) between the two scripts is a fine tradeoff for keeping them fully independent — mirrors how `main.py`/`enrich.py`/`update.py` are already separate single-purpose scripts in this project rather than one multi-mode CLI.

---

## 1. Schema additions

Dropped `skits`/`skit_appearances` from the original plan — most "skits" are fully described by which character is being performed, so they're derived from `character_appearances` rather than a separate canonical entity (see rationale below). AKAs are self-referential Desus/Mero nicknames, not characters, so they get their own table with no FK to `characters`.

```sql
-- Characters: one canonical name each, matched/deduped across episodes by the enrichment prompt
CREATE TABLE characters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  first_episode_id BIGINT REFERENCES episodes(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE character_appearances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id BIGINT NOT NULL REFERENCES characters(id),
  episode_id BIGINT NOT NULL REFERENCES episodes(id),
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  context TEXT  -- short summary/quote of what happens in this appearance
);
CREATE INDEX character_appearances_character_idx ON character_appearances(character_id);
CREATE INDEX character_appearances_episode_idx ON character_appearances(episode_id);

-- AKAs: self-referential nicknames for Desus or Mero (e.g. "Plantain Supernova")
CREATE TABLE akas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL CHECK (host IN ('Desus', 'Mero')),
  explanation TEXT,       -- e.g. "reference to Oasis's Champagne Supernova"
  first_episode_id BIGINT REFERENCES episodes(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: per-episode restatements of an AKA (outro AKA segment recaps old ones + adds new)
-- Skip this table if the glossary alone (term + explanation + first_episode_id) is enough.
CREATE TABLE aka_mentions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aka_id BIGINT NOT NULL REFERENCES akas(id),
  episode_id BIGINT NOT NULL REFERENCES episodes(id),
  start_ms INT NOT NULL
);

-- Personal anecdotes / stories — one-off, no canonical parent needed
CREATE TABLE stories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  episode_id BIGINT NOT NULL REFERENCES episodes(id),
  speaker TEXT,          -- 'Desus Nice' | 'The Kid Mero' | 'Victor'
  start_ms INT NOT NULL,
  end_ms INT NOT NULL,
  summary TEXT NOT NULL
);

-- Movies/songs/shows/media referenced (playlist + media-ideas features)
CREATE TABLE media_references (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  episode_id BIGINT NOT NULL REFERENCES episodes(id),
  title TEXT NOT NULL,
  media_type TEXT,       -- 'song' | 'movie' | 'show' | 'business_idea' | ...
  start_ms INT
);

-- Topics: many-to-many tags on an episode
CREATE TABLE topics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE episode_topics (
  episode_id BIGINT NOT NULL REFERENCES episodes(id),
  topic_id BIGINT NOT NULL REFERENCES topics(id),
  PRIMARY KEY (episode_id, topic_id)
);

-- Intro boundary: every episode has one, it's episode metadata, not a catalog item
ALTER TABLE episodes ADD COLUMN content_start_ms INT;

-- State machine for the enrichment pass itself
ALTER TABLE episodes ADD COLUMN enrichment_status TEXT DEFAULT 'pending';
-- values: pending → processing → completed | failed

-- State machine for the speaker-correction pass (see §2) — gates enrichment_status
ALTER TABLE episodes ADD COLUMN speaker_check_status TEXT DEFAULT 'pending';
-- values: pending → needs_review | verified
-- 'verified' means labels are confirmed correct or have been corrected; enrichment should
-- only run on episodes where speaker_check_status = 'verified'

-- Embeddings (separate pass, see §5)
ALTER TABLE utterances ADD COLUMN embedding vector(1536);  -- dimension depends on model choice
CREATE INDEX utterances_embedding_idx ON utterances
  USING ivfflat (embedding vector_cosine_ops);
```

### Why no `skits` table

A skit is defined by which character is being performed, so `character_appearances` already *is* the skit instance (character_id + start_ms + end_ms). A separate `skits` table would need its own name/dedup logic, except skit names have no fixed vocabulary the way characters do (you can seed `characters` with the ~18 known names; you can't seed "skit names" the same way) — Claude would invent a slightly different name per episode and fragment the catalog.

- `/skits` page = query over `character_appearances`, grouped by character, or grouped by overlapping time windows within an episode to catch multi-character scenes (e.g. Officer Prosciutto + Michael Anthony arguing = two overlapping appearance rows, no extra table needed to know that's "a scene").
- One-off gags with no recognized character → not worth a canonical identity at all; if worth capturing, they fold into `stories` as a one-time summary row.
- The intro skit specifically recurs in *every* episode with the same structural role — not a content item to browse, so it's `episodes.content_start_ms`, not a row anywhere.

---

## 2. Speaker correction (must run before enrichment)

`main.py`'s `speaker_identification` (speaker_type="name") doesn't always get it right. **Why, structurally:** per AssemblyAI's docs, `speaker_type: "name"` identification uses *conversation content* to infer who's speaking — "no voice enrollment needed." It is not matching against real voiceprints of Desus/Mero/Victor (`main.py` never supplied reference audio, only text `name`/`description` metadata). So when a host does a bit as "Ben Carson" or "Michael Anthony," the content genuinely sounds like that persona, and the content-inference model reasonably (for its purposes) labels the segment with that name instead of the host performing it — this is a property of how the feature works, not something processing episodes slower/serially would avoid. Diarization itself (the separate clustering step feeding into identification) is also more error-prone for fast, interruptive, cross-talking banter like this show's format, per AssemblyAI's own best-practices notes — likely the source of split-cluster duplicates like `"A-Trak" `/ `"A-Trak - 1"`. One real, untried lever: `speaker_identification` supports an `effort: "medium"` setting (`main.py` never sets it, so it defaults to `"low"`); AssemblyAI recommends medium specifically for "elevated conversations where individuals interrupt each other." It can be re-run against an already-completed transcript via a separate Speech Understanding API call, without re-transcribing, if worth testing later. Regardless, this correction stage exists because the upstream labels are what they are — this is the layer to fix it at, not the transcription step.

**This whole stage is detection only, no AI.** A cheap per-episode classifier (SQL/regex/langid, all free) sorts episodes into `verified` or `needs_review`. Anything not `verified` gets printed with its evidence and fixed by hand in the Supabase console (§2.3) — there is no automated resolution/mapping call and no auto-applied `UPDATE`. This was a deliberate simplification after checking real data: a manual pass on the flagged minority is cheap enough, and it keeps a human in the loop on writes that silently compound into every downstream feature (character attribution, `akas.host`, the frontend speaker filter/stats bar) if wrong. Revisit this if the flagged fraction turns out too large to fix by hand (see note at the end of §2.3) — the fallback would be having Claude *draft* a mapping suggestion per flagged episode for you to approve, not to auto-apply it.

| Failure mode | What it looks like | Detection |
| --- | --- | --- |
| Unresolved raw labels | `speaker` is a raw diarization placeholder like `"A"` / `"B"` / `"C"` instead of a real name | SQL, 100% recall, free |
| Whole-episode swap | Desus and Mero's names are consistently flipped for the entire episode | Tri-state signals (§2.1): episode-number callout + Spanish code-switching ratio |
| Character/impression given its own label | A bit character or impression (e.g. `"Ben Carson"`, `"Michael Anthony"`, `"Bad Bobbie"`) shows up as a distinct speaker label instead of being attributed to whichever host is performing it | Same not-in-`KNOWN_NAMES` check as unresolved labels — see note below |
| Split diarization clusters | The same real person (host or guest) gets two different raw labels because the diarizer opened a new cluster mid-episode (e.g. `"A-Trak"` and `"A-Trak - 1"`) | Same not-in-`KNOWN_NAMES` check; the fix is merging both labels to one name |

**Why `KNOWN_NAMES` is a short, explicit allowlist rather than "anything that looks like a real name."** Real observed speaker labels from this data: `Desus Nice`, `The Kid Mero`, `Victor`, `A`, `B`, `C`, `D`, `Tyler Beckford`, `Ben Carson`, `Alex Rodriguez`, `Vashti`, `Rob Gronkowski`, `Lavar Ball`, `Michael Sal Anthony`, `Michael K`, `Bad Bobbie`, `Michael Anthony`, `Valerio`, `Jonah Hill`, `Jonathan Nathaniel Mashburn`, `Mr. Man`, `Herman Cain`, `Eric Rizzo`, `Michael Anthony Prosciutto`, `A-Trak - 1`, `Charles Oakley`. Of these, only **`Vashti`, `Michael K`, `Jonah Hill`, `Charles Oakley`, `A-Trak`** are confirmed real guests — everything else is either a raw placeholder or a character/impression a host is performing. Critically, there's no way to tell those apart by the *shape* of the string: `"Michael Anthony"` and `"Rob Gronkowski"` are equally plausible-looking names, so a regex/heuristic can't separate "real guest" from "bit character." The list above is verified ground truth (confirmed by ear), not a guess — that's what makes hardcoding it safe here, unlike guessing from string shape:

```python
KNOWN_HOSTS = {"Desus Nice", "The Kid Mero", "Victor"}
CONFIRMED_GUESTS = {"Vashti", "Michael K", "Jonah Hill", "Charles Oakley", "A-Trak"}
KNOWN_NAMES = KNOWN_HOSTS | CONFIRMED_GUESTS
```

Note this also means `"A-Trak - 1"` correctly still gets flagged even though `"A-Trak"` is confirmed — the exact string isn't in the set, so the split-cluster variant surfaces for a manual merge instead of silently passing through. An as-yet-unseen real guest gets flagged too; that's a one-line addition to `CONFIRMED_GUESTS` once you confirm it, not a wrong auto-correction.

This also flips an assumption from an earlier draft of this doc: character/impression labels showing up here mostly get their **own distinct label** (`Ben Carson`, `Michael Anthony`, …) rather than being silently force-fit onto a host's label. That's actually the easier failure to catch — it trips the plain not-in-`KNOWN_NAMES` check directly, no content reasoning required to even notice something's off. A bit silently absorbed into a correctly-named host's utterances (no separate label at all) would be invisible to this stage; if that turns out to happen in practice, it'd have to be caught later, during §4's enrichment read, same as the doc originally assumed for that case.

### 2.1 Detection signals

Unresolved/unknown labels — catches every raw placeholder, guest, and character label in one query, no API calls:

```sql
SELECT DISTINCT episode_id, speaker FROM utterances
WHERE speaker NOT IN ('Desus Nice', 'The Kid Mero', 'Victor', 'Vashti', 'Michael K', 'Jonah Hill', 'Charles Oakley', 'A-Trak');
```

For episodes where every label is already known, whether they're *correctly* assigned still needs more than one signal — a whole-episode swap can hide behind two otherwise-valid names. Each signal below is **tri-state** — `"confirm"` / `"contradict"` / `"silent"` — not a plain boolean. That distinction matters: a boolean "did this check find a problem" can't tell the difference between "this signal actively agrees the labels are correct" and "this signal never fired an opinion either way," which collapses `verified` and inconclusive-silence into the same non-event and makes `verified` effectively unreachable.

1. **The episode-number callout (near-deterministic anchor).** Per the pipeline prompt, Desus is the one who says "Bodega Boys episode N" right after the intro drop. Regex `bodega boys episode \d+` (case-insensitive) across the episode:
   ```python
   CALLOUT_PATTERN = re.compile(r"bodega boys episode \d+", re.IGNORECASE)

   def callout_signal(utterances: list[dict]) -> str:
       for u in utterances:
           if CALLOUT_PATTERN.search(u["text"] or ""):
               return "confirm" if u["speaker"] == "Desus Nice" else "contradict"
       return "silent"   # no callout line found in this episode at all
   ```
2. **Spanish code-switching ratio (strong statistical signal).** Mero is the one who code-switches to Dominican Spanish; if most of an episode's Spanish content sits on `Desus Nice`'s label instead, that's suspicious. Note: AssemblyAI's `code_switching`/`language_detection` config only returns a **transcript-level** summary (`language_detection_results.code_switching_languages`, top 2 languages for the whole episode) — there's no per-utterance language field coming back from the API, and `main.py` doesn't persist one either. So this has to be computed directly from utterance text using a lightweight offline language-detection library (`langid` — pure Python, no network calls), not read off an existing column:
   ```python
   import langid

   SPANISH_MIN_WORDS = 3       # skip 1-2 word utterances, too short for langid to be reliable
   SPANISH_SIGNAL_THRESHOLD = 0.15

   def spanish_share(utterances: list[dict]) -> dict[str, float]:
       totals, spanish = {}, {}
       for u in utterances:
           text = (u["text"] or "").strip()
           if len(text.split()) < SPANISH_MIN_WORDS:
               continue
           speaker = u["speaker"]
           totals[speaker] = totals.get(speaker, 0) + 1
           lang, _ = langid.classify(text)
           if lang == "es":
               spanish[speaker] = spanish.get(speaker, 0) + 1
       return {s: spanish.get(s, 0) / total for s, total in totals.items()}

   def spanish_signal(utterances: list[dict], threshold: float = SPANISH_SIGNAL_THRESHOLD) -> str:
       shares = spanish_share(utterances)
       desus, mero = shares.get("Desus Nice"), shares.get("The Kid Mero")
       if desus is None or mero is None:
           return "silent"                # not enough data on one of the two labels
       diff = mero - desus
       if diff > threshold:
           return "confirm"                # Mero code-switches more, as expected
       if diff < -threshold:
           return "contradict"             # Desus code-switches more — labels likely swapped
       return "silent"                     # gap too small to mean anything
   ```
3. **Heritage keyword scan / direct-address adjacency (optional, supporting signals).** Regex for Jamaica/Jamaican/patois vs. Dominican/DR references, or checking that utterance N+1 is the person addressed by name in utterance N — both cheap, both weak alone. Not required for a first pass; add only if the two signals above turn out to have too many `silent` results in practice.

`classify()` combines the signals:

```python
def classify(utterances: list[dict]) -> str:      # 'needs_resolution' | 'needs_review' | 'verified'
    labels = {u["speaker"] for u in utterances}
    if any(label not in KNOWN_NAMES for label in labels):
        return "needs_resolution"                  # placeholder, guest, or character label present
    signals = [callout_signal(utterances), spanish_signal(utterances)]
    if "contradict" in signals:
        return "needs_review"                       # a signal actively disagrees with current labels
    if "confirm" in signals:
        return "verified"                            # a signal actively agrees, none disagree
    return "needs_review"                            # every signal silent — inconclusive, not confirmed
```

`needs_resolution` and `needs_review` both mean the same practical thing here — go look at this episode — the distinct names are just so the printed report can say *why* it was flagged (unknown label vs. contradicted signal) to point you at the right thing to check.

### 2.2 What happens to a flagged episode

Nothing automatic. The script prints the episode id/title, which check flagged it, and the specific evidence (which speaker said the callout, the per-speaker Spanish share, which raw labels aren't in `KNOWN_NAMES`) so you know where to look without re-deriving it. You listen to or skim the relevant stretch and decide the correct mapping yourself — this is exactly the kind of judgment call that turned out to need real background knowledge of the show (e.g. recognizing `"Michael Anthony"` is a bit, not a guest), not something worth automating for a one-time backfill over 265 episodes.

### 2.3 Manual correction (Supabase console)

One `UPDATE` per episode using a `CASE` expression, run by hand once you know the correct mapping — same statement whether you're resolving a raw placeholder, merging a split diarization cluster, or fixing a whole-episode swap:

```sql
UPDATE utterances SET speaker = CASE speaker
  WHEN 'A' THEN 'Desus Nice'
  WHEN 'Michael Anthony' THEN 'Desus Nice'
  WHEN 'A-Trak - 1' THEN 'A-Trak'
  ELSE speaker END
WHERE episode_id = $1;
```

No confidence gating, no auto-apply — every correction goes through your own read of the transcript before it's run. If the flagged fraction turns out to be large in practice (an early check found roughly 4 of 11 episodes needing a look, which would be a lot of episodes at 265 if that rate holds), the fallback is having Claude *draft* a mapping suggestion with evidence for you to review and approve per episode, rather than reading full transcripts yourself for every flagged episode — but that's not built now; cross that bridge only if manual review actually becomes the bottleneck.

### 2.4 Gating and re-verification

`speaker_check_status` goes `pending → needs_review | verified`. Enrichment (§4) only processes episodes where `speaker_check_status = 'verified'`. Because `classify()` is pure and deterministic, there's no manual status-flipping step after a console fix — just re-run `enrich.py`. Any previously-flagged episode that now passes `classify()` (your fix resolved the contradiction, or brought all labels into `KNOWN_NAMES`) flips to `verified` automatically and becomes eligible for enrichment on that same run.

---

## 3. State machine

Same restart-safe pattern as `main.py`:

```
episodes.enrichment_status: pending → processing → completed | failed
```

- Only process `pipeline_status='completed' AND enrichment_status='pending'` episodes.
- Mark `processing` before the Claude call, `completed`/`failed` after — every DB write is a checkpoint, crash-safe restart.
- Mirror `main.py`'s safety flags: `--dry-run` (no API calls, no writes), `--limit N` (test on 3 before unleashing 265).

---

## 4. Per-episode enrichment flow

### 3.1 Input construction

Do **not** feed `transcript.full_text`. Feed the episode's `utterances` (`speaker, start_ms, end_ms, text`, ordered) so Claude can ground every timestamp it emits in a real utterance boundary instead of hallucinating one. A ~1.5hr episode is roughly 800–1500 utterances — fits comfortably in context; flag/log any episode whose utterance count is unusually high in case it needs chunking later.

Before building the prompt, fetch the **current** canonical tables so Claude matches against what already exists rather than inventing duplicates:

```python
existing_characters = supabase.table("characters").select("id, name, description").execute().data
existing_akas = supabase.table("akas").select("id, term, host").execute().data
existing_topics = supabase.table("topics").select("id, name").execute().data
```

### 3.2 Prompt structure

- System prompt: the podcast/character background context already drafted in `enrich.py` (hosts, recurring characters with descriptions, intro/AKA structural markers).
- Inject `existing_characters` / `existing_akas` / `existing_topics` as a "known entities" block: *"If this episode references one of these, use its exact name/term. Only propose a new one if it's genuinely not in this list."*
- Inject the episode's utterances as the content to analyze.

### 3.3 Force structured output via tool use

Define one tool with a JSON schema covering every category, and set `tool_choice` to force it — don't parse free-text JSON out of a text response, since this runs unattended over 265 episodes.

```jsonc
{
  "name": "record_episode_enrichment",
  "input_schema": {
    "type": "object",
    "properties": {
      "content_start_ms": { "type": "integer" },
      "characters": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },        // must match existing_characters name, or a new name
            "is_new": { "type": "boolean" },
            "description": { "type": "string" }, // only meaningful when is_new
            "start_ms": { "type": "integer" },
            "end_ms": { "type": "integer" },
            "context": { "type": "string" }
          },
          "required": ["name", "is_new", "start_ms", "end_ms"]
        }
      },
      "akas": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "term": { "type": "string" },
            "host": { "type": "string", "enum": ["Desus", "Mero"] },
            "is_new": { "type": "boolean" },
            "explanation": { "type": "string" },
            "start_ms": { "type": "integer" }
          },
          "required": ["term", "host", "is_new", "start_ms"]
        }
      },
      "stories": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "speaker": { "type": "string" },
            "start_ms": { "type": "integer" },
            "end_ms": { "type": "integer" },
            "summary": { "type": "string" }
          },
          "required": ["speaker", "start_ms", "end_ms", "summary"]
        }
      },
      "media_references": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "media_type": { "type": "string" },
            "start_ms": { "type": "integer" }
          },
          "required": ["title", "media_type"]
        }
      },
      "topics": {
        "type": "array",
        "items": { "type": "string" }  // matched against existing_topics or new
      }
    },
    "required": ["content_start_ms", "characters", "akas", "stories", "media_references", "topics"]
  }
}
```

### 3.4 Upsert logic (the dedup step)

For each category with a canonical parent (`characters`, `akas`, `topics`):

1. Case-insensitive match the returned name/term against the `existing_*` list fetched in 3.1.
2. Match found → use its id.
3. No match (or `is_new: true`) → insert new canonical row, use the new id.
4. Insert the appearance/child row (`character_appearances`, `aka_mentions` if you keep it, `episode_topics`) referencing that id.

`stories` and `media_references` have no canonical parent — just insert directly, no matching step.

Finish with `episodes.update({content_start_ms, enrichment_status: 'completed'})`.

---

## 5. Embeddings pass — `embed.py`, a separate script

Its own file, own `if __name__ == "__main__"`, own `--dry-run`/`--limit` flags — not a mode of `enrich.py`. Operates directly on `utterances`, no Claude call involved, no awareness of `speaker_check_status`/`enrichment_status`.

1. **Pick a model up front** — determines the `vector(N)` width, so decide before running the `ALTER TABLE`. OpenAI `text-embedding-3-small` (1536-dim, cheap, simple) is a fine default; Voyage AI is Anthropic's recommended embedding partner if you'd rather match the enrichment provider. Either works — don't overthink this choice.
2. **Query for unembedded utterances**: `WHERE embedding IS NULL` — this doubles as the pending-work marker, no separate status column needed.
3. **Batch the calls** — most embedding APIs accept an array of texts per request (e.g. 100–500 utterances per call). At 245k utterances, per-utterance calls would mean 245k requests; batching brings that down to ~1-2k.
4. **Write back** by utterance id (`update` per row, or a bulk upsert if the client supports it).
5. **Query-time usage** (`/search` page, later): embed the user's query string with the same model, then:
   ```sql
   SELECT * FROM utterances
   ORDER BY embedding <=> $1
   LIMIT 20;
   ```
   against the `ivfflat` index already defined in §1.

Cost/scale sanity check: 245k utterances × ~15 words avg is a few million tokens — a few dollars at most for either provider. Batching is about request-count sanity, not cost.

---

## 6. Suggested build order

**`enrich.py`:**

1. Speaker correction first (§2), no Claude involved: `classify()` (unresolved/unknown-label check + tri-state `callout_signal`/`spanish_signal`), printed evidence report for flagged episodes, `speaker_check_status` gating.
2. Manually fix whatever `classify()` flags via the Supabase console (§2.3), re-run the script, confirm flagged episodes flip to `verified` on their own once fixed.
3. State machine scaffolding + fetch-existing-entities helper, `--dry-run`/`--limit` flags (mirror `main.py`).
4. Single-episode Claude call with the forced-tool-use schema above — get one episode's raw tool output printed, don't write anything yet.
5. Upsert logic with the name-matching dedup for `characters`/`akas`/`topics`.
6. Run with `--limit 3`, manually check the resulting rows make sense (character/AKA matching is the part most likely to misbehave), then run full.

**`embed.py`** (whenever, independently of the above being finished):

6. Pick the embedding model/dimension, run the `ALTER TABLE` for `utterances.embedding`.
7. Batch-fetch `WHERE embedding IS NULL`, embed, write back. Test with `--limit` on a small batch before running over all 245k utterances.
