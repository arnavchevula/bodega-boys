from urllib import response

from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import time
import langid
import re
import argparse
import textwrap
import traceback
import anthropic
from pydantic import BaseModel
claude = anthropic.Anthropic()
supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )

class CharacterEntry(BaseModel):
    name: str                       # must match existing_characters name, or a new name
    is_new: bool
    description: str | None = None  # only meaningful when is_new
    start_ms: int
    end_ms: int
    context: str | None = None

class AkaEntry(BaseModel):
    term: str
    host: str                       # "Desus" | "Mero"
    is_new: bool
    explanation: str | None = None
    start_ms: int

class StoryEntry(BaseModel):
    speaker: str
    start_ms: int
    end_ms: int
    summary: str

class MediaReferenceEntry(BaseModel):
    title: str
    media_type: str
    start_ms: int | None = None

class ChapterEntry(BaseModel):
    title: str
    start_ms: int

class QuoteEntry(BaseModel):
    speaker: str
    quote: str
    start_ms: int
    foreshadowing: bool = False
    dark_desus: bool = False
    hollywood_desus: bool = False

class NewsReferenceEntry(BaseModel):
    speaker: str
    start_ms: int
    end_ms: int
    headline: str
    summary: str

class EnrichmentResult(BaseModel):
    content_start_ms: int
    characters: list[CharacterEntry]
    akas: list[AkaEntry]
    stories: list[StoryEntry]
    media_references: list[MediaReferenceEntry]
    topics: list[str]               # matched against existing_topics or new
    chapters: list[ChapterEntry]    # sequential table-of-contents markers
    quotes: list[QuoteEntry]        # standalone notable/quotable lines
    sucio_utterance_starts: list[int]  # start_ms of every utterance in a porn/sex-related exchange
    news_references: list[NewsReferenceEntry]  # real-world news/event references
    mero_smacked_score: int         # 0-10, episode-level "smack city" rating

KNOWN_HOSTS = {"Desus Nice", "The Kid Mero", "Victor Lopez"}
CONFIRMED_GUESTS = {"Vashti", "Jonah Hill", "Charles Oakley",
  "A-Trak", "Feeno"}
KNOWN_NAMES = KNOWN_HOSTS | CONFIRMED_GUESTS
CALLOUT_PATTERN = re.compile(r"bodega boys episode \d+", re.IGNORECASE)

ENRICHMENT_SYSTEM_PROMPT = textwrap.dedent(f"""\
    You extract structured metadata from a transcript of the Bodega Boys podcast, hosted by Desus Nice and The Kid Mero (sometimes joined by Victor).

    Each transcript line is prefixed with its exact start_ms in brackets, e.g. `[123456] Desus Nice: ...`. Whenever you report a `start_ms` field anywhere in your output, copy the bracketed value from the corresponding line verbatim — never estimate or round it. This is especially important for `sucio_utterance_starts`, since those values are matched exactly against the transcript's own timestamps to compute a word count; a value that isn't copied from a bracket will fail to match anything.

    Hosts and confirmed guests are real people — never report them as `characters`:
    - Hosts: {", ".join(sorted(KNOWN_HOSTS))}
    - Confirmed guests: {", ".join(sorted(CONFIRMED_GUESTS))}

    Recurring bit characters/impressions the hosts perform in-show belong in `characters` when they occur, e.g. Ben Carson, Michael Anthony, Officer Prosciutto, Bad Bobbie, Yesenia, Papi (Hispanic man) and a recurring "racist NYC cop" bit. When a host is doing one of these voices, log the character being performed, not the host's own name. Log every appearance, not just the first time a character shows up in the episode — if the same character is performed in two separate bits, that's two `characters` entries sharing the same name, each with its own `start_ms`/`end_ms`/`context`. Users want to know every episode a character shows up in, so a known character reappearing is exactly as reportable as a brand-new one.

    Structural markers to watch for:
    - Every episode opens with a recurring intro skit, immediately followed by Desus announcing "Bodega Boys episode N." That callout marks where real content begins — report its start_ms as `content_start_ms`. Everything before it is the intro bit, not a content item.
    - AKAs are self-referential nicknames the hosts give each other. Log a mention every time one is actually spoken, anywhere in the episode — not only during a dedicated AKA segment. There's often (not always) a stretch later in the episode where Desus and/or Mero rattle off nicknames back-to-back, recapping older ones and coining new ones — treat that as the densest source, but don't limit yourself to it: a host invoking one of his own aliases in passing elsewhere (an outro sign-off, a mid-episode bit) is a mention too. Report one `akas` entry per mention, not per unique nickname — if the same term is said three times across the episode, that's three entries, each with its own `start_ms`. Each entry needs a `host` ("Desus Nice" or "The Kid Mero" — whichever host the nickname is FOR, not who's speaking) and, when audible and genuinely new information, a short `explanation` of the reference/joke behind it — only the first time a term is coined needs one; repeats of an already-established nickname can leave it blank.
    - Usually when you see "Poppy" it is actually "Papi" but got mistranstlated by the ASR. If the context makes it clear that the host is talking about the recurring "Papi" character, correct it to "Papi" in your output. If it's genuinely a different name or talking about poppy seeds or poppy flowers, leave it as-is. Many times the hosts will break into either Spanish or Patois for a line or utterance. Some of these have been mistranscribed bt AssemblyAi.
    Report every `characters` appearance and every `akas` mention in the episode — the known lists in the user message are for matching against, not a filter on what to report. Users want a complete per-episode record of which characters and AKAs came up, including ones that already existed before this episode, not just newly-coined ones. If a character or AKA matches something in the known list, reuse its exact existing name/term and set `is_new: false`; only set `is_new: true` for ones genuinely absent from those lists. Never omit an entry just because it's already known.

    `chapters` is a table-of-contents for the entire episode, not a catalog of notable moments — break the full runtime, starting at 0, into a sequence of chapters with no gaps, in chronological order. The first chapter covers the intro skit itself, from 0 to `content_start_ms` — give it a real, specific title describing what actually happens in that episode's intro (it's a distinct bit each time, not boilerplate — don't just label it "Intro"). Every chapter after that needs a short (3-8 word), specific title describing what's discussed in that stretch (not a generic label like "Discussion"), and a `start_ms` marking where it begins. Aim for a natural segment size — roughly one chapter every 5-15 minutes of content is typical, but let actual topic shifts in the conversation drive the boundaries rather than a fixed cadence.

    `quotes` are standalone, quotable lines worth surfacing on their own — funny, sharp, or emblematic one-liners a fan would want to pull out and share, not just any notable statement. Be selective: a handful of the best per episode is enough, not an exhaustive list. Each needs the exact `speaker`, the `quote` text verbatim, and its `start_ms`. Make sure to include when Desus does a hot take (usually prefaced by Desus saying "Desus Fuego take" or "hot take" or "gotta hear both sides" or "dark Desus moment" or similar, ie a hotep moment when mero says "teach these white devils")

    The hosts frequently digress into conversations about porn (they call it "pino" in the podcast to avoid censorship), adult film actresses, or other explicit sexual topics — sometimes self-aware, calling themselves "the Sucio Boys" or remarking on how long it's been since the last time they talked about lewd topics. Identify every utterance that is part of one of these conversations and report its start_ms in `sucio_utterance_starts` — include both hosts' turns across the full back-and-forth, not just the utterance that kicks it off, since the goal is an accurate word count over the whole exchange. Use judgment: a single stray innuendo or one-off joke that doesn't develop into an actual exchange about the topic doesn't count — the utterance needs to genuinely be part of a sustained sex/porn-related conversation.

    Desus and Mero's real-life partnership had a high-profile, publicized ending years after these episodes aired. Some lines — jokes, asides, offhand predictions — read as eerily prescient in hindsight, e.g. joking about "a highly publicized breakup" once they're rich. Flag any quote like this with `foreshadowing: true`.

    Two more quote flags, same pattern as `foreshadowing`: flag `dark_desus: true` when a quote is a "dark Desus moment" — a bleak, cynical, or hotep-adjacent aside that cuts against his usual chiller on-screen persona (often but not always prefaced by "hot take," "gotta hear both sides," or similar). Flag `hollywood_desus: true` when Desus leans on his own fame/industry access — name-dropping a celebrity he knows personally, industry gossip only an insider would have, or needling Mero about still being local while he's in LA/on TV. Similarly when Desus talks about how he's going to "sell out" and leave everyone behind to become a Hollywood elite. These are independent of each other and of `foreshadowing` — a quote can carry any combination, or none.

    `mero_smacked_score`: a single 0-10 rating, for the whole episode, of how "high"/ blazed / stoned  Mero is during the podcast. Usually Mero smokes cannabis prior to the recording and they will frequently reference it by Desus saying "how smacked are you Mero" or "Smack City" Or "How High are you right now Mero?" Or some variation of this. Mero will also mention how much he smoked or how high he is. 0 is no signal either way, 10 means the episode is dominated by how high he is or desus mentioning it. Weigh it by the volume and intensity of that material across the full episode, not one line.
    `media_references`: films, music, TV shows, theatre or business ideas the hosts riff on or react to — distinct from `news_references` (real-world news/current events) and `stories` (personal anecdotes). Report the `title`, `media_type` ("film", "music", "album", "song", "artist", "show", "musical", "play" or "business idea"), and the `start_ms` of the discussion. Don't guess at outside details or a URL — capture only what's in the transcript itself. Make sure all the hip hop references are captured, frequently the hosts will discuss hip hop and other forms of music ranging from indie rock to metal to pop.
    `news_references`: real-world news stories or current events the hosts riff on or react to — distinct from `media_references` (movies/music/shows/business ideas) and `stories` (personal anecdotes). Report the `speaker`, `start_ms`/`end_ms` of the discussion, a short `headline` describing the news item, and a one-sentence `summary` of what they actually said about it. Don't guess at outside details or a URL — capture only what's in the transcript itself.
    """)
SPANISH_SIGNAL_THRESHOLD = 0.15
SPANISH_MIN_WORDS = 3

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episode-id", type=str, default=None, help="Only process this specific episode id (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Call Claude and print the resulting payload, but skip all database writes")
    args = parser.parse_args()

    print("Enrichment script start")
    query = supabase.table("episodes").select("id, title, pipeline_status, episode_number, speaker_check_status, enrichment_status").eq("pipeline_status", "completed")
    if args.episode_id:
        query = query.eq("id", args.episode_id)
    episodes = query.execute()
    unverified = 0
    needs_swap = 0
    needs_review=0
    needs_resolution=0
    for episode in episodes.data:
        utterances = supabase.table("utterances").select("*").eq("episode_id", episode["id"]).execute()
        existing_characters = supabase.table("characters").select("*").order("id").execute().data
        existing_akas = supabase.table("akas").select("*").order("id").execute().data
        existing_topics = supabase.table("topics").select("*").order("id").execute().data
        #if episode["speaker_check_status"] != 'verified':
            # status = classify(utterances.data)
            # episode["speaker_check_status"] = status
            #if args.dry_run:
                #print(f"[DRY RUN] would set speaker_check_status={status} for episode {episode['id']}")
            #else:
                #supabase.table("episodes").update({"speaker_check_status": status}).eq("id", episode["id"]).execute()
            # print(f"Status for episode {episode["title"]} is {status}")    
            #if (status != 'verified'):
                #unverified+=1
               # if (status == 'needs_swap'):
                    # swap_speakers(episode["id"])
                    #needs_swap+=1
                #if (#status == 'needs_review'):
                    #needs_review+=1
                   # print(f"{episode["id"]} needs review")
               # if (status == 'needs_resolution'):
                  #  print(f"{episode["id"]} needs resolution")
                   # needs_resolution+=1
            
            # print(f"Status for episode {episode["title"]} is {status} Check transcript at https://localhost:3000/{episode["id"]}")    
            # time.sleep(60)
        if episode["enrichment_status"] == 'pending' and episode["speaker_check_status"] == 'verified':
            db_update("episodes", {"enrichment_status": "processing"}, {"id": episode["id"]}, args.dry_run)
            try:
                enrich_episode(episode, utterances.data, existing_characters, existing_akas, existing_topics, dry_run=args.dry_run)
            except Exception as e:
                error_detail = traceback.format_exc()
                print(f"Enrichment FAILED for episode {episode['title']} ({episode['id']}):\n{error_detail}")
                # Leave the DB clean immediately rather than waiting for the next
                # retry's clear_episode_children() call at the top of enrich_episode.
                clear_episode_children(episode["id"], args.dry_run)
                db_update("episodes", {"enrichment_status": "failed", "enrichment_error": str(e)}, {"id": episode["id"]}, args.dry_run)
                continue
            print(f"Enrichment completed for episode {episode["title"]}.")
            # time.sleep(30)
    #print(f"Unverified: {unverified} episodes")
    #print(f"\t{needs_swap} episodes need speaker swap")
    #print(f"\t{needs_resolution} episodes need speaker resolution")
    #print(f"\t{needs_review} episodes are inconclusive")
    #print(f"Verified: {len(episodes.data)-unverified} episodes")

def correct_speaker():
    print("Correction Starting")

def swap_speakers(episode_id):
    supabase.table("utterances").update({"speaker": "__SWAP_TEMP__"}) \
        .eq("episode_id", episode_id).eq("speaker", "Desus Nice").execute()
    supabase.table("utterances").update({"speaker": "Desus Nice"}) \
        .eq("episode_id", episode_id).eq("speaker", "The Kid Mero").execute()
    supabase.table("utterances").update({"speaker": "The Kid Mero"}) \
        .eq("episode_id", episode_id).eq("speaker", "__SWAP_TEMP__").execute()
    supabase.table("episodes").update({"speaker_check_status": "verified"}) \
        .eq("id", episode_id).execute()

def classify(utterances) -> str:
    labels = {u["speaker"] for u in utterances}
    if any(label not in KNOWN_NAMES for label in labels):
        return 'needs_resolution'
    callout = callout_signal(utterances)
    wordcount = wordcount_signal(utterances)
    # print(f"signals: callout={callout} wordcount={wordcount}")
    if callout == 'contradict' and wordcount == 'contradict':
        return 'needs_swap'
    if callout == 'confirm' and wordcount == 'confirm':
        return 'verified'
    return 'needs_review'
    
def callout_signal(utterances) -> str: # 'confirm' | 'contradict' | 'silent'
    for utterance in utterances:
        if ('Desus Nice' in utterance["text"] or '1994' in utterance["text"] or CALLOUT_PATTERN.search(utterance["text"])): 
            if (utterance["speaker"] == 'Desus Nice'):
                return 'confirm'
            elif (utterance["speaker"] == 'The Kid Mero'):
                return 'contradict'
        if ('Curve Gotti' in utterance["text"]):
            if (utterance["speaker"] == 'The Kid Mero'):
                return 'confirm'
            elif (utterance["speaker"] == 'Desus Nice'):
                return 'contradict'
    return 'silent'
            
# Retired: AssemblyAI mistranscribes Dominican Spanish into pseudo-Italian/English
# word salad (verified against a real Mero utterance in test.py), so no language
# detector run over utterances.text can recover the true language. Not fixable
# by tuning langid - the corruption is baked into the transcript text itself.
# def spanish_share(utterances) -> dict[str, float]:
#     totals,spanish={},{}
#     for u in utterances:
#         text = (u["text"] or "").strip()
#         if len(text.split()) < SPANISH_MIN_WORDS:
#             continue
#         speaker = u["speaker"]
#         totals[speaker] = totals.get(speaker, 0) + 1
#         lang, _ = langid.classify(text)
#         if lang == 'es':
#             spanish[speaker] = spanish.get(speaker,0) + 1
#     return {s: spanish.get(s,0) / total for s, total in totals.items()}
#
# def spanish_signal(utterances:list[dict], threshold: float = SPANISH_SIGNAL_THRESHOLD) -> str: # 'confirm' | 'contradict' | 'silent'
#     shares = spanish_share(utterances)
#     desus, mero = shares.get("Desus Nice"), shares.get("The Kid Mero")
#     if desus is None or mero is None:
#       return "silent"
#     diff = mero - desus
#     if diff > threshold:
#         return "confirm"
#     if diff < -threshold:
#         return "contradict"
#     return "silent"

def wordcount_signal(utterances: list[dict]) -> str: # 'confirm' | 'contradict' | 'silent'
    counts = {}
    for u in utterances:
        speaker = u["speaker"]
        if speaker not in ("Desus Nice", "The Kid Mero"):
            continue
        counts[speaker] = counts.get(speaker, 0) + len((u["text"] or "").split())
    desus, mero = counts.get("Desus Nice"), counts.get("The Kid Mero")
    if not desus or not mero or desus == mero:
        return "silent"
    return "confirm" if desus > mero else "contradict"

def db_insert(table, payload, dry_run):
    if dry_run:
        print(f"[DRY RUN] would insert into {table}: {payload}")
        return "DRY_RUN_ID"
    response = supabase.table(table).insert(payload).execute()
    if not response.data:
        raise RuntimeError(f"Insert into {table} returned no rows (blocked by RLS, or a silent failure) — payload: {payload}")
    print(f"insert data: {response}")
    return response.data[0].get("id") or response.data[0].get("topic_id")

def db_update(table, payload, match, dry_run):
    if dry_run:
        print(f"[DRY RUN] would update {table} where {match}: {payload}")
        return
    query = supabase.table(table).update(payload)
    for key, value in match.items():
        query = query.eq(key, value)
    response = query.execute()
    if not response.data:
        raise RuntimeError(f"Update on {table} matched no rows (blocked by RLS, or a wrong match key) — match: {match}, payload: {payload}")

def db_delete(table, match, dry_run):
    if dry_run:
        print(f"[DRY RUN] would delete from {table} where {match}")
        return
    query = supabase.table(table).delete()
    for key, value in match.items():
        query = query.eq(key, value)
    query.execute()

CHILD_TABLES = [
    "character_appearances", "aka_mentions", "stories",
    "media_references", "chapters", "quotes", "episode_topics",
    "news_references",
]

def clear_episode_children(episode_id, dry_run):
    # Makes re-running a previously-failed episode idempotent: wipe whatever
    # partial child rows the last attempt managed to insert before it died,
    # so a retry can't duplicate them. Canonical characters/akas/topics rows
    # are untouched — they're re-matched via existing_map, never re-inserted.
    for table in CHILD_TABLES:
        db_delete(table, {"episode_id": episode_id}, dry_run)

def enrich_episode(episode, utterances, existing_characters, existing_akas, existing_topics, dry_run=False):
    print("Enrichment Starting")
    clear_episode_children(episode["id"], dry_run)
    character_map = {c["name"].lower(): c["id"] for c in existing_characters}
    aka_map = {a["term"].lower(): a["id"] for a in existing_akas}
    topic_map = {t["name"].lower(): t["id"] for t in existing_topics}
    print(f"character_map: {character_map}\naka_map: {aka_map}\ntopic_map: {topic_map}")
    transcript = "\n".join(f'[{u["start_ms"]}] {u["speaker"]}: {u["text"]}' for u in utterances)
    print(f"Transcript for episode {episode['id']}:\n{transcript[:500]}...")  # print first 500 chars
    with claude.messages.stream(
        model="claude-opus-5",
        max_tokens=64000,
        system=ENRICHMENT_SYSTEM_PROMPT,
        messages=[{
                "role": "user",
                "content": (
                    f"Known characters: {existing_characters}\n"
                    f"Known akas: {existing_akas}\n"
                    f"Known topics: {existing_topics}\n\n"
                    f"Transcript:\n{transcript}"
                ),
            }],
            output_format=EnrichmentResult,
        ) as stream:
        response = stream.get_final_message()
    result = response.parsed_output

    if dry_run:
        print(f"[DRY RUN] Claude response for episode {episode['id']}:")
        print(result.model_dump_json(indent=2))

    for character in result.characters:
        key = character.name.lower()
        if key in character_map:
            db_insert("character_appearances", {
                "character_id": character_map[key],
                "episode_id": episode["id"],
                "start_ms": character.start_ms,
                "end_ms": character.end_ms,
                "context": character.context,
            }, dry_run)
        elif character.is_new:
            character_id = db_insert("characters", {
                "name": character.name,
                "description": character.description,
                "first_episode_id": episode["id"],
            }, dry_run)
            db_insert("character_appearances", {
                "character_id": character_id,
                "episode_id": episode["id"],
                "start_ms": character.start_ms,
                "end_ms": character.end_ms,
                "context": character.context,
            }, dry_run)
            character_map[key] = character_id
    print(f"passed character insert")

    for aka in result.akas:
        key = aka.term.lower()
        if key in aka_map:
            db_insert("aka_mentions", {
                "aka_id": aka_map[key],
                "episode_id": episode["id"],
                "start_ms": aka.start_ms,
            }, dry_run)
        elif aka.is_new:
            aka_id = db_insert("akas", {
                "term": aka.term,
                "host": aka.host,
                "explanation": aka.explanation,
                "first_episode_id": episode["id"],
            }, dry_run)
            db_insert("aka_mentions", {
                "aka_id": aka_id,
                "episode_id": episode["id"],
                "start_ms": aka.start_ms,
            }, dry_run)
            aka_map[key] = aka_id
    print(f"passed aka insert")
    linked_topic_ids = set()
    for topic in result.topics:
        key = topic.lower()
        if key in topic_map:
            topic_id = topic_map[key]
        else:
            topic_id = db_insert("topics", {"name": topic}, dry_run)
            topic_map[key] = topic_id
        if topic_id in linked_topic_ids:
            continue
        db_insert("episode_topics", {
            "episode_id": episode["id"],
            "topic_id": topic_id,
        }, dry_run)
        linked_topic_ids.add(topic_id)
    print(f"passed topic insert")       
    for story in result.stories:
        db_insert("stories", {
            "episode_id": episode["id"],
            "speaker": story.speaker,
            "start_ms": story.start_ms,
            "end_ms": story.end_ms,
            "summary": story.summary,
        }, dry_run)
    print(f"passed story insert")
    for media_reference in result.media_references:
        db_insert("media_references", {
            "episode_id": episode["id"],
            "title": media_reference.title,
            "media_type": media_reference.media_type,
            "start_ms": media_reference.start_ms,
        }, dry_run)
    print(f"passed media reference insert")
    for chapter in result.chapters:
        db_insert("chapters", {
            "episode_id": episode["id"],
            "title": chapter.title,
            "start_ms": chapter.start_ms,
        }, dry_run)
    print(f"passed chapter insert")
    for quote in result.quotes:
        db_insert("quotes", {
            "episode_id": episode["id"],
            "speaker": quote.speaker,
            "quote": quote.quote,
            "start_ms": quote.start_ms,
            "foreshadowing": quote.foreshadowing,
            "dark_desus": quote.dark_desus,
            "hollywood_desus": quote.hollywood_desus,
        }, dry_run)
    print(f"passed quote insert")
    for news_reference in result.news_references:
        db_insert("news_references", {
            "episode_id": episode["id"],
            "speaker": news_reference.speaker,
            "start_ms": news_reference.start_ms,
            "end_ms": news_reference.end_ms,
            "headline": news_reference.headline,
            "summary": news_reference.summary,
        }, dry_run)
    print(f"passed news reference insert")
    sucio_starts = set(result.sucio_utterance_starts)
    print((f"sucio starts: {sucio_starts}"))
    sucio_word_count = sum(
        len((u["text"] or "").split())
        for u in utterances if u["start_ms"] in sucio_starts
    )

    db_update("episodes", {
        "content_start_ms": result.content_start_ms,
        "sucio_word_count": sucio_word_count,
        "mero_smacked_score": result.mero_smacked_score,
        "enrichment_status": "completed",
        "enrichment_error": None,
    }, {"id": episode["id"]}, dry_run)
    print(f"status update & sucio insert")

if __name__ == "__main__":
    main()