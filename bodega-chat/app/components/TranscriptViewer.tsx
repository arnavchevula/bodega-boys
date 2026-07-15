"use client";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getBorderColor, getInitials, images, getWordCount } from "@/lib/utils";
import { supabase } from "@/lib/db";

export default function TranscriptViewer({
  utterances,
  episode,
  activeHosts,
  full_transcript,
}) {
  const [transcript, setTranscript] = useState(utterances);
  const [activeSpeaker, setActiveSpeaker] = useState(null);

  return (
    <div className="bg-slate-200 p-4 rounded-md">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setTranscript(utterances);
              setActiveSpeaker(null);
            }}
            className={activeSpeaker === null ? "bg-blue-500 text-white" : ""}
          >
            Show All
          </Button>
          {activeHosts.map((speaker) => {
            return (
              <Button
                onClick={() => {
                  setTranscript(
                    utterances.filter((u) => u.speaker === speaker),
                  );
                  setActiveSpeaker(speaker);
                }}
                key={speaker}
                className={
                  activeSpeaker === speaker ? "bg-blue-500 text-white" : ""
                }
              >
                {speaker}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-col items-end">
          <h3 className="text-3xl  font-bold uppercase tracking-wide">
            {getWordCount(full_transcript)}
          </h3>
          <div className="text-neutral-400 font-semibold uppercase tracking-tight text-sm sm:text-base">
            {" "}
            Words
          </div>
        </div>
      </div>
      <ScrollArea className="h-screen w-full rounded-md mt-2 backdrop-blur-md">
        {transcript?.map((utterance, index) => {
          return (
            <div
              key={utterance.id}
              className="text-lg fadeIn"
              style={{ opacity: 0, animationDelay: `${index * 0.1}s` }}
            >
              <div
                className={`flex items-center justify-between border-l-2 ${getBorderColor(utterance.speaker)} pl-2 `}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarImage
                      src={
                        images[utterance.speaker as keyof typeof images]?.src
                      }
                      alt={utterance.speaker}
                    />
                    <AvatarFallback>
                      {getInitials(utterance.speaker)}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="italic text-neutral-700 font-bold tracking-tight text-xl">
                    {utterance?.speaker}
                  </h2>{" "}
                </div>

                <a
                  className="underline"
                  target="_blank"
                  href={`https://youtube.com/watch?v=${episode.youtube_id}&t=${Math.floor(utterance.start_ms / 1000)}`}
                >
                  <div className="text-sm">
                    {Math.floor(utterance.start_ms / 3600000) % 24}:
                    {Math.floor(utterance.start_ms / 60000) % 60}:
                    {Math.floor(utterance.start_ms / 1000) % 60}
                  </div>
                </a>
              </div>

              <p className="text-sm px-4 py-1">{utterance?.text}</p>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
