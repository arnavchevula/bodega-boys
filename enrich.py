from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import time
import langid
import re


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
    print("Enrichment script start")
    episodes = supabase.table("episodes").select("id, title, pipeline_status, episode_number, speaker_check_status, enrichment_status").eq("pipeline_status", "completed").execute()
    for episode in episodes.data:
        if episode["speaker_check_status"] == 'pending':
            utterances = supabase.table("utterances").select("*").eq("episode_id", episode["id"]).execute()
            status = classify(utterances.data)
            episode["speaker_check_status"] = 'verified' if status == 'verified' else 'needs_review'
            if (status != 'verified'):
                print(f"Status for episode {episode["title"]} is {status} ")    
            print(f"Check Correction for episode {episode["title"]}. Check transcript at https://localhost:3000/{episode["id"]}")
            time.sleep(60)
        if episode["enrichment_status"] == 'pending' and episode["speaker_check_status"] =='verified':
            enrich_episode(episode)
            print(f"Enrichment completed for episode {episode["title"]}.")
            time.sleep(30)
        
            
if __name__ == "__main__":
    main()

def correct_speaker():
    print("Correction Starting")

def classify(utterances) -> str:
    print("Determining correction...")
    labels = {u["speaker"] for u in utterances}
    if any(label not in KNOWN_NAMES for label in labels):
        return 'needs_resolution'
    signals=[callout_signal(utterances),spanish_signal(utterances)]
    if "contradict" in signals: 
        return 'needs_review'
    if "confirm" in signals:
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
            
def spanish_share(utterances) -> dict[str, float]:
    totals,spanish={},{}
    for u in utterances:
        text = (u["text"] or "").strip()
        if len(text.split()) < SPANISH_MIN_WORDS:
            continue
        speaker = u["speaker"]
        totals[speaker] = totals.get(speaker, 0) + 1
        lang, _ = langid.classify(text)
        if lang == 'es':
            spanish[speaker] = spanish.get(speaker,0) + 1
    return {s: spanish.get(s,0) / total for s, total in totals.items()}
    
def spanish_signal(utterances:list[dict], threshold: float = SPANISH_SIGNAL_THRESHOLD) -> str: # 'confirm' | 'contradict' | 'silent'
    shares = spanish_share(utterances)
    desus, mero = shares.get("Desus Nice"), shares.get("The Kid Mero")
    if desus is None or mero is None:
      return "silent"
    diff = mero - desus
    if diff > threshold:
        return "confirm"
    if diff < -threshold:
        return "contradict"
    return "silent"

def enrich_episode(episode):
    print("Enrichment Starting")