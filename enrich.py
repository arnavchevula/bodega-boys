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


def main():
    print("Enrichment script start")

    episodes = supabase.table("episodes").select("id, title, pipeline_status, episode_number, speaker_correction, enrichment_status").eq("pipeline_status", "completed").execute()
    for episode in episodes:
        if episode.speaker_correction == 'pending':
            correct_speaker(episode)
            print(f"Check Correction for episode {episode.id}. Check transcript at https://localhost:3000/{episode.id}")
            time.sleep(60)
        if episode.enrichment_status == 'pending' and episode.speaker_correction=='verified':
            enrich_episode(episode)
            print(f"Enrichment completed for episode {episode.id}.")
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

    langid.set_languages(["en", "es"])
    spanish_mismatch_count=0
    for utterance in utterances:
        lang_res = langid.classify(utterance)
        if (lang_res[0] != 'en' and lang_res[1] < 0.5 and utterance.speaker is not 'The Kid Mero'):
            spanish_mismatch_count+=1
    if (spanish_mismatch_count > 5):
        return 'needs_review'
    
def callout_signal(utterances) -> str: # 'confirm' | 'contradict' | 'silent'
    for utterance in utterances:
        if (('Desus Nice' in utterance.text or '1994' in utterance.text or CALLOUT_PATTERN(utterance.text)) 
            and utterance["speaker"] == 'Desus Nice'):
            return 'confirm'
        if ('Curve Gotti' in utterance.text and utterance["speaker"] == 'The Kid Mero'):
            return 'confirm'
        else: 
            return 'contradict'
            
def spanish_share(utterances) -> dict[str, float]:

def spanish_signal(utterances, threshold=0.15) -> str: # 'confirm' | 'contradict' | 'silent'

def enrich_episode():
    print("Enrichment Starting")