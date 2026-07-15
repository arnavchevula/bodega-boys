import { supabase } from "@/lib/db";
import { Fragment } from "react/jsx-runtime";

export default async function Admin({}) {
  const db = await supabase();
  const { data, error } = await db
    .from("episodes")
    .select(
      "id, title, assemblyai_transcript_id, pipeline_status, transcripts(episode_id, created_at, full_text)",
    )
    .in("pipeline_status", ["failed", "downloading"])
    .order("pipeline_status");
  return (
    <div>
      <h1>Admin Portal</h1>
      <div className="grid grid-cols-[40px_2fr__2fr_1fr_1fr_2fr]">
        {data?.map((episode, index) => {
          return (
            <Fragment key={episode.id}>
              <div className="font-bold">{index + 1}</div>
              <div>{episode.id}</div>
              <div>{episode.title}</div>
              <div>{episode.pipeline_status}</div>
              <div>{episode.assemblyai_transcript_id}</div>
              <div className="truncate">
                {episode.transcripts?.episode_id}{" "}
                {episode.transcripts?.created_at}{" "}
                {episode.transcripts?.full_text}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
