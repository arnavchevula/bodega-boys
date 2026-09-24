import { supabase } from "@/lib/db";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Clock,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Leaf,
  Rose,
  User,
  MicVocal,
} from "lucide-react";
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
import EpisodeInfo from "@/app/components/EpisodeInfo";

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
  const { data: stories, error: stories_error } = await db
    .from("stories")
    .select("*")
    .eq("episode_id", episodeId);
  console.log(stories);

  const { data: characters, error: character_error } = await db
    .from("character_appearances")
    .select(
      "id, character_id  (id, description, name, first_episode_id) , episode_id, start_ms, end_ms, context",
    )
    .eq("episode_id", episodeId);
  console.log(characters);

  const { data: quotes, error: quotes_error } = await db
    .from("quotes")
    .select("*")
    .eq("episode_id", episodeId);
  console.log(quotes);
  const { data: media_references, error: media_reference_error } = await db
    .from("media_references")
    .select("*")
    .eq("episode_id", episodeId);
  console.log(media_references);
  const { data: news_references, error: news_reference_error } = await db
    .from("news_references")
    .select("*")
    .eq("episode_id", episodeId);
  console.log(news_references);

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
      <div className="flex flex-col gap-2 sm:flex-row mt-2">
        <div className="aspect-video w-fit">
          <iframe
            id="ytplayer"
            type="text/html"
            width="350"
            height="350"
            src={`https://www.youtube.com/embed/${episode?.youtube_id}`}
            className="rounded-md"
          />
        </div>
        <div className="flex flex-col gap-2 justify-between">
          <div>
            <div className="italic text-base">{header}</div>
            <div className="font-bold text-5xl">
              {" "}
              {title ? title.trim() : episode.title}
            </div>
          </div>
          <div className="flex justify-around gap-4 mt-4">
            {activeHosts.map((speaker) => {
              return (
                <div
                  key={speaker}
                  className={`flex flex-col items-center ${!speakers.includes(speaker) ? "opacity-30 grayscale" : ""}`}
                >
                  <Avatar
                    className={`size-32 hover:grayscale transition duration-300`}
                  >
                    <AvatarImage
                      src={images[speaker as keyof typeof images]?.src}
                      alt={speaker}
                    />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-300 group-hover/avatar:opacity-100">
                      <span className="text-sm font-semibold">
                        {speakerTime[speaker]?.words ?? "-"}{" "}
                        <span className="font-normal text-slate-300">
                          words
                        </span>
                      </span>
                      <span className="text-sm font-semibold">
                        {speakerTime[speaker]?.turns ?? "-"}{" "}
                        <span className="font-normal text-slate-300">
                          turns
                        </span>
                      </span>
                    </div>
                    <AvatarFallback>{getInitials(speaker)}</AvatarFallback>
                  </Avatar>
                  <h2 className="font-semibold uppercase tracking-tight text-slate-600">
                    {speaker}
                  </h2>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 rounded-xl border border-blue-500 py-1 px-2">
              <Calendar className="text-slate-500 text-sm" />
              <span>
                {new Date(episode?.date).toLocaleDateString({
                  weekday: "long",
                  month: "long",
                  day: "long",
                  year: "long",
                })}
              </span>
            </span>
            <span className="flex items-center gap-2 rounded-xl border border-orange-500 py-1 px-2">
              <Clock className="text-slate-500 text-sm" />
              <span>
                {Math.floor(episode.duration / 3600)}:
                {Math.floor((episode.duration % 3600) / 60)
                  .toString()
                  .padStart(2, "0")}{" "}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="h-full w-full flex flex-col gap-2">
        <div className="p-4 rounded-md box-border">
          <div>
            <div className="w-full h-8 bg-slate-800 rounded-xl my-2 relative flex items-center box-border">
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
                    className={`h-8 ${getSpeakerColor(speaker)} ${isFirst ? "rounded-l-xl" : ""} ${isLast ? "rounded-r-xl" : ""} absolute top-0 left-0 flex items-center fadeWidth origin-left`}
                  >
                    <p className="text-xs text-white font-bold ml-1 truncate flex items-center gap-2">
                      <User size={16} />
                      {speaker}
                    </p>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="w-full h-8 bg-slate-800 rounded-xl my-2 relative flex items-center box-border">
                <div
                  className="bg-red-500 h-8 rounded-l-xl flex items-center justify-center text-white text-sm relative fadeWidth origin-left"
                  style={{
                    width: `${(episode.sucio_word_count / getWordCount(transcript.full_text)) * 500}%`,
                  }}
                >
                  <p className="text-xs text-white absolute top-1/2 -translate-y-1/2 left-0 ml-1 font-bold flex items-center gap-2">
                    <Rose size={16} />
                    Sucio Meter
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="w-full h-8 bg-slate-800 rounded-xl my-2 relative flex items-center box-border">
                <div
                  className="bg-green-800 h-8 rounded-l-xl flex items-center justify-center text-white text-sm relative fadeWidth origin-left"
                  style={{
                    width: `${episode.mero_smacked_score * 10}%`,
                  }}
                >
                  <p className="text-xs text-white absolute top-1/2 -translate-y-1/2 left-0 ml-1 font-bold flex items-center gap-2">
                    <Leaf size={16} />
                    Smacked Meter
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <EpisodeInfo
          stories={stories}
          quotes={quotes}
          characters={characters}
          media_references={media_references}
          news_references={news_references}
        />
      </div>
      <div className="fadeIn">
        <TranscriptViewer
          utterances={utterances}
          episode={episode}
          activeHosts={activeHosts}
          full_transcript={transcript?.full_text}
        />
      </div>
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
    </div>
  );
}
