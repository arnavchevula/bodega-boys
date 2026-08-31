from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()
import os
import anthropic
from pydantic import BaseModel
claude = anthropic.Anthropic()
supabase: Client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_KEY"],
    )
import json


def main():
    with open('aka.json', 'r', encoding='utf-8') as file:
        data = json.load(file)
    for aka in data:
        supabase.table("akas").insert(aka).execute()

if __name__ == "__main__":
    main()