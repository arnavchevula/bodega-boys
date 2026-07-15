import os
import assemblyai as aai
import yt_dlp
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime, timezone

def main():
        supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )
        
            episodes = supabase.table("episodes").select("*").execute().data


if __name__ == "__main__":
    main()