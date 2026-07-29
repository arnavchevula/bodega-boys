import { supabase } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Clock, Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import {
  getInitials,
  getSpeakerColor,
  getWordCount,
  images,
  getEpisodeSortKey,
} from "@/lib/utils";
import EntitityGraph from "@/app/components/EntityGraph";
import TranscriptViewer from "@/app/components/TranscriptViewer";
import Link from "next/link";

export default async function Episode({
  params,
}: {
  params: Promise<{ episodeId: string }>;
}) {
  const { episodeId } = await params;
  const db = await supabase();
  const { data: episode, error } = await db
    .from("episodes")
    .select("*")
    .eq("id", episodeId)
    .single();
  let { data: episodes, error: episode_error } = await db
    .from("episodes")
    .select(`*`);

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

  const findEpisodeIndex = sortedEpisodes.findIndex(
    (episode) => episode.id === episodeId,
  );
  const prevEpisode = sortedEpisodes[findEpisodeIndex - 1];
  const nextEpisode = sortedEpisodes[findEpisodeIndex + 1];
  const { data: utterances, error: utterance_error } = await db
    .from("utterances")
    .select("*")
    .eq("episode_id", episodeId)
    .order("start_ms");
  const { data: transcript, error: transcript_error } = await db
    .from("transcripts")
    .select("*")
    .eq("episode_id", episodeId)
    .single();

  const { data: entities, error: entity_error } = await db
    .from("entities")
    .select("*")
    .eq("episode_id", episodeId);

  const entityMap = (entities ?? []).reduce(
    (acc, entity) => {
      acc[entity.text] = (acc[entity.text] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sortedEntities = new Map(
    Object.entries(entityMap).sort(([, a], [, b]) => b - a),
  );

  const speakers = [
    ...new Set(utterances?.map((utterance) => utterance.speaker)),
  ];
  const allHosts = ["Desus Nice", "The Kid Mero", "Victor Lopez"];
  const activeHosts = allHosts.filter((speaker) => speakers.includes(speaker));
  type SpeakerStats = { time: number; words: number; turns: number };
  const [header, title] = episode.title.split(":");

  const speakerTime =
    utterances?.reduce(
      (accumulator: Record<string, SpeakerStats>, currentValue) => {
        const { start_ms, end_ms, speaker, text } = currentValue;
        const prev = accumulator[speaker] ?? { time: 0, words: 0, turns: 0 };
        const time = prev.time + (end_ms - start_ms);
        const words = prev.words + getWordCount(text);
        const turns = prev.turns + 1;
        accumulator[speaker] = { time, words, turns };
        return accumulator;
      },
      {} as Record<string, SpeakerStats>,
    ) ?? {};
  const totalSpoken: number = Object.values(speakerTime ?? {}).reduce(
    (acc, b) => acc + b.time,
    0,
  );

  let runningTotal = 0;
  const progressBarOffsets = activeHosts.reduce(
    (acc: Record<string, number>, speaker) => {
      const speakerMs = speakerTime[speaker]?.time ?? 0;
      const percent = totalSpoken ? (speakerMs / totalSpoken) * 100 : 0;
      acc[speaker] = runningTotal;
      runningTotal += percent;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div>
      <div>
        <div className="flex items-center gap-2 justify-between">
          {prevEpisode && (
            <Link
              href={`/episodes/${prevEpisode.id}`}
              className="flex items-center gap-2 hover:underline"
            >
              <ChevronLeft />
              <p className="text-sm italic font-medium text-slate-700">
                {prevEpisode.title}
              </p>
            </Link>
          )}

          {nextEpisode && (
            <Link
              href={`/episodes/${nextEpisode.id}`}
              className="flex items-center gap-2 hover:underline"
            >
              <p className="text-sm italic font-medium text-slate-700">
                {nextEpisode.title}
              </p>
              <ChevronRight />
            </Link>
          )}
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-2 flex-1 font-sans min-h-screen mt-2 gap-4 m-4 sm:m-0 pb-2">
        <div className="h-full w-full flex flex-col gap-2">
          <div className="bg-slate-200 p-4 rounded-md">
            <h1 className="text-2xl italic text-amber-800 font-bold tracking-wide sm:text-xl">
              {header}
            </h1>
            <h1 className="text-4xl text-amber-700 font-bold tracking-wide sm:text-3xl">
              {title ? title.trim() : episode.title}
            </h1>
            <h2 className="flex items-center gap-2">
              <Calendar />
              {new Date(episode?.date).toLocaleDateString({
                weekday: "long",
                month: "long",
                day: "long",
                year: "long",
              })}
            </h2>
            <h3 className="flex items-center gap-2">
              <Clock />
              {Math.floor(episode.duration / 3600)}:
              {Math.floor((episode.duration % 3600) / 60)
                .toString()
                .padStart(2, "0")}{" "}
            </h3>
          </div>

          <div className="bg-slate-200 p-4 rounded-md box-border">
            <div>
              <div className="w-full h-4 bg-slate-800 rounded-xl my-2 relative flex items-center box-border">
                {activeHosts.map((speaker, index) => {
                  const isFirst = index === 0;
                  const isLast = index === activeHosts.length - 1;
                  return (
                    <div
                      style={{
                        width: `${(speakerTime[speaker]?.time / totalSpoken) * 100}%`,
                        left: `${progressBarOffsets[speaker] ?? 0}%`,
                        backgroundColor: getSpeakerColor(speaker),
                      }}
                      key={speaker}
                      className={`h-4 ${getSpeakerColor(speaker)} ${isFirst ? "rounded-l-xl" : ""} ${isLast ? "rounded-r-xl" : ""} absolute top-0 left-0 flex items-center fadeWidth origin-left`}
                    >
                      <p className="text-xs text-white font-bold ml-1 truncate">
                        {speaker}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {/** First Row (empty div, speaker avatars)**/}
              <div></div>
              {allHosts.map((speaker) => {
                return (
                  <div
                    key={speaker}
                    className={`flex flex-col items-center ${!speakers.includes(speaker) ? "opacity-30 grayscale" : ""}`}
                  >
                    <Avatar className={`size-32 `}>
                      <AvatarImage
                        src={images[speaker as keyof typeof images]?.src}
                        alt={speaker}
                      />
                      <AvatarFallback>{getInitials(speaker)}</AvatarFallback>
                    </Avatar>
                    <h2 className="font-semibold uppercase tracking-tight text-slate-600">
                      {speaker}
                    </h2>
                  </div>
                );
              })}
              {/** second Row (words label div, word counts)**/}
              <div>Words: </div>
              {allHosts.map((speaker) => {
                return (
                  <div
                    key={speaker}
                    className={`flex flex-col items-center ${!speakers.includes(speaker) ? "opacity-30" : ""}`}
                  >
                    {speakerTime[speaker]?.words ?? "-"}
                  </div>
                );
              })}

              <div>Turns: </div>
              {allHosts.map((speaker) => {
                return (
                  <div
                    key={speaker}
                    className={`flex flex-col items-center ${!speakers.includes(speaker) ? "opacity-30" : ""}`}
                  >
                    {speakerTime[speaker]?.turns ?? "-"}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <EntitityGraph
              entities={Array.from(sortedEntities, ([key, value]) => ({
                key,
                value,
              }))}
            />
          </div>
          <div className="bg-slate-200 p-4 rounded-md h-full flex items-center justify-center">
            <iframe
              id="ytplayer"
              type="text/html"
              width="100%"
              height="400"
              src={`https://www.youtube.com/embed/${episode?.youtube_id}`}
              className="rounded-md "
            />
          </div>
        </div>

        <div className="h-full w-full fadeIn">
          <TranscriptViewer
            utterances={utterances}
            episode={episode}
            activeHosts={activeHosts}
            full_transcript={transcript?.full_text}
          />
        </div>
      </div>
    </div>
  );
}
