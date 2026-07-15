import os
import assemblyai as aai
import yt_dlp
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timezone

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

TRANSCRIPTION_CONFIG = aai.TranscriptionConfig(
    speech_models=["universal-3-pro", "universal-2"],    
    language_detection=True,
    language_detection_options=aai.LanguageDetectionOptions(code_switching=True),
    speaker_labels=True,
    sentiment_analysis=True,
    entity_detection=True,
    auto_highlights=False,
    # keyterms_prompt=[]  # add after reviewing first few transcripts
    speech_understanding=aai.SpeechUnderstandingRequest(
        request=aai.SpeechUnderstandingFeatureRequests(
            speaker_identification=aai.SpeakerIdentificationRequest(
            speaker_type="name",
            speakers =
            [{
                "name": "Desus Nice",
                "description": "Co-host of Desus & Mero. Born Daniel Baker, from the Bronx, NY. Known for sharp political commentary, pop culture references, and a more measured delivery.",
                "show": "Desus & Mero",
                "network": "Showtime",
                "role": "Co-host"
            },
            {
                "name": "The Kid Mero",
                "description": "Co-host of Desus & Mero. Born Joel Martinez, from the Bronx, NY. Known for high-energy delivery, Dominican-American cultural references, and frequent use of slang and humor.",
                "show": "Desus & Mero",
                "network": "Showtime",
                "role": "Co-host"
            },
            {
                "name": "Victor",
                "description": "Manager and occasional on-air contributor for Desus & Mero. Appears intermittently rather than as a primary host.",
                "show": "Desus & Mero",
                "role": "Manager"
            }])   
        )
    )
)

YDL_OPTS = {
    "format": "bestaudio/best",
    "postprocessors": [{
        "key": "FFmpegExtractAudio",
        "preferredcodec": "mp3",
        "preferredquality": "192",
    }],
    "outtmpl": "%(title)s.%(ext)s",
    "cookiesfrombrowser": ("chrome",),
    "remote_components": {"ejs:github"},
    "js_runtimes": {
        "node": {
            'deno': {'path': None},
            'node': {'path':"/Users/arnavchevula/.nvm/versions/node/v24.0.0/bin/node"}
        }
    }
}


def dominant_sentiment(utterance: aai.Utterance, sentiment_results: list) -> str | None:
    overlapping = [
        s.sentiment for s in sentiment_results
        if s.start >= utterance.start and s.end <= utterance.end
    ]
    if not overlapping:
        return None
    return max(set(overlapping), key=overlapping.count)


def transcribe_episode(episode: dict) -> tuple[aai.Transcript, dict]:
    yt_url = f"https://youtube.com/watch?v={episode['youtube_id']}"
    print(f"Downloading: {episode['title']}")

    with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
        info = ydl.extract_info(yt_url, download=True)
        audio_path = ydl.prepare_filename(info).rsplit(".", 1)[0] + ".mp3"

    print(f"Transcribing: {episode['title']}")
    transcript = aai.Transcriber().transcribe(audio_path, TRANSCRIPTION_CONFIG)
    print(f"Transcript: {transcript.status} {transcript.id}")
    os.remove(audio_path)
    return transcript, info


def main():
    supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )

    pending = supabase.table("episodes").select("*").eq("pipeline_status", "pending").execute().data
    print(f"Found {len(pending)} pending episodes")

    for episode in pending:
        try:
            supabase.table("episodes").update({
                "pipeline_status": "downloading",
            }).eq("id", episode["id"]).execute()

            transcript, info = transcribe_episode(episode)

            supabase.table("episodes").update({
                "assemblyai_transcript_id": transcript.id,
                "duration": info.get("duration"),
                "date": datetime.fromtimestamp(info.get("timestamp"), tz=timezone.utc).isoformat(),
                "thumbnail_url": info.get("thumbnail"),
            }).eq("id", episode["id"]).execute()

            if transcript.status == aai.TranscriptStatus.error:
                print(f"Transcription failed for {episode['title']}: {transcript.error}")
                supabase.table("episodes").update({
                    "pipeline_status": "failed",
                }).eq("id", episode["id"]).execute()
                continue

            episode_id = episode["id"]
            sentiment_results = transcript.sentiment_analysis or []

            supabase.table("transcripts").insert({
                "episode_id": episode_id,
                "full_text": transcript.text,
            }).execute()

            if transcript.utterances:
                supabase.table("utterances").insert([
                    {
                        "episode_id": episode_id,
                        "speaker": u.speaker,
                        "text": u.text,
                        "start_ms": u.start,
                        "end_ms": u.end,
                        "sentiment": dominant_sentiment(u, sentiment_results),
                    }
                    for u in transcript.utterances
                ]).execute()

            if transcript.entities:
                supabase.table("entities").insert([
                    {
                        "episode_id": episode_id,
                        "text": e.text,
                        "entity_type": e.entity_type,
                        "start_ms": e.start,
                    }
                    for e in transcript.entities
                ]).execute()

            try:
                if transcript.auto_highlights and transcript.auto_highlights.results:
                    supabase.table("key_phrases").insert([
                        {
                            "episode_id": episode_id,
                            "phrase": kp.text,
                            "count": kp.count,
                        }
                        for kp in transcript.auto_highlights.results
                    ]).execute()
            except Exception as e:
                print(f"Key phrases failed for {episode['title']}, skipping: {e}")

            supabase.table("episodes").update({
                "pipeline_status": "completed",
            }).eq("id", episode["id"]).execute()

            print(f"Done: {episode['title']}")

        except Exception as e:
            print(f"Error processing {episode['title']}: {e}")
            supabase.table("episodes").update({
                "pipeline_status": "failed",
            }).eq("id", episode["id"]).execute()


if __name__ == "__main__":
    main()
