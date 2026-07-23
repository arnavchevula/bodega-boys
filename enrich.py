from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import time
import langid
import re
import argparse


supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )

KNOWN_HOSTS = {"Desus Nice", "The Kid Mero", "Victor"}
CONFIRMED_GUESTS = {"Vashti", "Jonah Hill", "Charles Oakley",
  "A-Trak"}
KNOWN_NAMES = KNOWN_HOSTS | CONFIRMED_GUESTS
CALLOUT_PATTERN = re.compile(r"bodega boys episode \d+", re.IGNORECASE)
SPANISH_SIGNAL_THRESHOLD = 0.15
SPANISH_MIN_WORDS = 3

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episode-id", type=str, default=None, help="Only process this specific episode id (for testing)")
    args = parser.parse_args()

    print("Enrichment script start")
    query = supabase.table("episodes").select("id, title, pipeline_status, episode_number, speaker_check_status, enrichment_status").eq("pipeline_status", "completed")
    if args.episode_id:
        query = query.eq("id", args.episode_id)
    episodes = query.execute()
    unverified = 0
    needs_swap = 0
    needs_review=0
    needs_resolution=0;
    for episode in episodes.data:
        if episode["speaker_check_status"] == 'pending':
            utterances = supabase.table("utterances").select("*").eq("episode_id", episode["id"]).execute()
            status = classify(utterances.data)
            episode["speaker_check_status"] = status
            # print(f"Status for episode {episode["title"]} is {status}")    
            if (status != 'verified'):
                unverified+=1
                if (status == 'needs_swap'):
                    # swap_speakers(episode["id"])
                    needs_swap+=1
                if (status == 'needs_review'):
                    needs_review+=1
                if (status == 'needs_resolution'):
                    print(f"{episode["id"]}")
                    needs_resolution+=1
            
            # print(f"Status for episode {episode["title"]} is {status} Check transcript at https://localhost:3000/{episode["id"]}")    
            # time.sleep(60)
        # if episode["enrichment_status"] == 'pending' and episode["speaker_check_status"] =='verified':
            # enrich_episode(episode)
            # print(f"Enrichment completed for episode {episode["title"]}.")
            # time.sleep(30)
    print(f"Unverified: {unverified} episodes")
    print(f"\t{needs_swap} episodes need speaker swap")
    print(f"\t{needs_resolution} episodes need speaker resolution")
    print(f"\t{needs_review} episodes are inconclusive")
    print(f"Verified: {len(episodes.data)-unverified} episodes")

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

def enrich_episode(episode):
    print("Enrichment Starting")


if __name__ == "__main__":
    main()