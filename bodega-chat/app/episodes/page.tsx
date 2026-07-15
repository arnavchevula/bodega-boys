import { supabase } from "@/lib/db";
import { getEpisodeSortKey } from "@/lib/utils";
import EpisodeList from "@/app/components/EpisodeList";

export default async function Episodes() {
  const db = await supabase();
  const { data: episodes, error } = await db.from("episodes").select(`*`);
  const sortedEpisodes = [...(episodes ?? [])].sort((a, b) => {
    const left = getEpisodeSortKey(a.title);
    const right = getEpisodeSortKey(b.title);

    if (left.bucket !== right.bucket) {
      return left.bucket - right.bucket;
    }

    if (left.episodeNumber !== right.episodeNumber) {
      return left.episodeNumber - right.episodeNumber;
    }

    return left.title.localeCompare(right.title);
  });

  return (
    <div className="flex flex-col flex-1 items-center mx-auto">
      <div className="flex justify-between gap-2 w-full p-4 sm:p-0">
        <div className="flex flex-col">
          <h1 className="text-5xl font-bold mt-2">Episodes</h1>
          <h4 className="text-base text-slate-500 mt-2">
            The definitive source for the audio (and video) art. Includes all
            released podcast episodes on streaming services! Enjoy
            ballbags.{" "}
          </h4>
        </div>

        <div className="flex flex-col items-end">
          <div className="text-2xl font-bold">{sortedEpisodes.length}</div>
          <div className="uppercase tracking-wide">Episodes</div>
        </div>
      </div>

      <EpisodeList episodes={sortedEpisodes} />
    </div>
  );
}
