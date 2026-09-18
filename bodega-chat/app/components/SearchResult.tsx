import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, images } from "@/lib/utils";

export function SearchResult({ title, result }: { title?: string; result: any[] }) {
  return (
    <>
      <div className="text-sm text-slate-500">
        {title ? `${title} — ` : ""}
        {result.length} {result.length === 1 ? "result" : "results"} found
      </div>
      {result.length > 0 &&
        result.map((r: any) => {
          // Lexical results join episode_id -> { title, date, thumbnail_url }
          // via PostgREST's embed syntax; match_utterances (semantic) only
          // returns the bare episode_id uuid, no join.
          const episodeTitle =
            typeof r.episode_id === "object" ? r.episode_id?.title : undefined;
          return (
            <div key={r.id}>
              <div className="flex flex-col gap-2 p-4 bg-slate-200 rounded-xl hover:scale-105 transition duration-300 hover:bg-slate-100">
                <div className="flex justify-between">
                  {episodeTitle && (
                    <h3 className="text-lg font-semibold">{episodeTitle}</h3>
                  )}
                  <span className="text-slate-500 text-sm">
                    {new Date(r.start_ms).toISOString().substr(11, 8)} -{" "}
                    {new Date(r.end_ms).toISOString().substr(11, 8)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{r.text}</p>
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarImage
                      src={images[r.speaker as keyof typeof images]?.src}
                      alt={r.speaker}
                    />
                    <AvatarFallback>{getInitials(r.speaker)}</AvatarFallback>
                  </Avatar>
                  <h2 className="italic text-neutral-700 font-bold tracking-tight text-base">
                    {r.speaker}
                  </h2>{" "}
                </div>
              </div>
            </div>
          );
        })}
    </>
  );
}
