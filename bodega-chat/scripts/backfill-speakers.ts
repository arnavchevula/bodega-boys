import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

async function backfillSpeakers() {
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
  );
  console.log(
    `Connected to Supabase: ${process.env.SUPABASE_URL} ${process.env.SUPABASE_SECRET_KEY}`,
  );
  const { data: episodes } = await db.from("episodes").select("id");

  for (const episode of episodes) {
    const { data: utterances } = await db
      .from("utterances")
      .select("speaker")
      .eq("episode_id", episode.id);

    const uniqueSpeakers = [...new Set(utterances?.map((u) => u.speaker))];
    console.log(
      `Updating episode ${episode.id} with speakers:`,
      uniqueSpeakers,
    );
    const { data: updatedEpisode, error: updateError } = await db
      .from("episodes")
      .update({ speakers: uniqueSpeakers })
      .eq("id", episode.id);
    console.log(updatedEpisode, updateError);
  }
  console.log("✅ Backfill complete");
}

backfillSpeakers();
