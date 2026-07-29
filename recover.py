from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import argparse
import assemblyai as aai
supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--episode-id", type=str, default=None, help="Only process this specific episode id (for testing)")
    args = parser.parse_args()
    episode = supabase.table("episodes").select("id,assemblyai_transcript_id, title").eq("id",args.episode_id).single().execute().data
    transcript_id = episode["assemblyai_transcript_id"]
    transcript = aai.Transcript.get_by_id(transcript_id)
    corrupted_utterances = supabase.table("utterances").select("*").eq("episode_id", episode["id"]).order("start_ms").execute().data
    len_corrupted = len(corrupted_utterances)
    len_transcript = len(transcript.utterances)
    if (len_corrupted != len_transcript):
        print("Lengths don't match, abort")
        return
    for original, corrupted in zip(transcript.utterances, corrupted_utterances):
        if (corrupted["start_ms"] != original.start or corrupted["end_ms"] != original.end):
            print("Timestamps dont align, abort")
            continue
        if (corrupted["speaker"] != original.speaker):
            print(f"Mismatch found:")
            print(f"Original Text: {original.text}")
            print(f"Corrupted Text: {corrupted['text']}")
            supabase.table("utterances").update({"speaker": original.speaker}).eq("id", corrupted["id"]).execute()

if __name__ == "__main__":
    main()