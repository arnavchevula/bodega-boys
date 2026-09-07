"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Book, ChevronsUpDown, Quote, Users, Music, Share } from "lucide-react";
import {
  getBorderColor,
  getInitials,
  images,
  getWordCount,
  getPillColor,
  getMediaReferenceColor,
} from "@/lib/utils";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export default function EpisodeInfo({
  stories,
  quotes,
  characters,
  media_references,
}: {
  stories: object;
  quotes: object;
  characters: object;
  media_references: object;
}) {
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [quotesOpen, setQuotesOpen] = useState(false);
  const [charactersOpen, setCharactersOpen] = useState(false);
  const [mediaReferencesOpen, setMediaReferencesOpen] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center">
      <Collapsible
        open={storiesOpen}
        onOpenChange={setStoriesOpen}
        className="w-full bg-slate-200 p-4 rounded-md mb-2 shadow-lg"
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <Book />
            <h4 className="text-lg font-bold">Stories</h4>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <ChevronsUpDown />
              <span className="sr-only">Toggle details</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent
          className="overflow-hidden 
  data-[state=open]:animate-collapsible-down 
  data-[state=closed]:animate-collapsible-up"
        >
          {stories?.map((story) => (
            <div
              key={story.id}
              className={`mb-2 hover:bg-slate-100 transition duration-300 rounded-md p-2`}
            >
              <div
                className={`flex justify-between items-center border-l-2 ${getBorderColor(story.speaker)} pl-2`}
              >
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarImage
                      src={images[story.speaker as keyof typeof images]?.src}
                      alt={story.speaker}
                    />
                    <AvatarFallback>
                      {getInitials(story.speaker)}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="italic text-neutral-700 font-bold tracking-tight text-base">
                    {story?.speaker}
                  </h2>{" "}
                </div>

                <span className="text-slate-500 text-sm underline">
                  {new Date(story.start_ms).toISOString().substr(11, 8)} -{" "}
                  {new Date(story.end_ms).toISOString().substr(11, 8)}
                </span>
              </div>

              <p className="text-slate-600 text-sm mt-2">{story.summary}</p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={quotesOpen}
        onOpenChange={setQuotesOpen}
        className="w-full bg-slate-200 p-4 rounded-md mb-2"
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <Quote />
            <h4 className="text-lg font-bold">Quotes</h4>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <ChevronsUpDown />
              <span className="sr-only">Toggle details</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="px-2 mt-2">
          {quotes?.map((quote) => (
            <div key={quote.id} className="mb-2">
              <div className="flex justify-between items-baseline">
                <p className="text-slate-600 text-base italic max-w-[70%] tracking-tight hover:underline transition duration-300">
                  "{quote.quote}"
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm underline">
                    {new Date(quote.start_ms).toISOString().substr(11, 8)}
                  </span>
                  <Share
                    size="24"
                    className="hover:bg-slate-50 rounded-xl p-1 transition duration-300 cursor-pointer"
                  />
                </div>
              </div>
              <div
                className={`flex items-center gap-2 border border-slate-300 w-fit px-4 py-2 rounded-md uppercase tracking-wide ${getPillColor(quote.speaker)}`}
              >
                <Avatar className="size-8">
                  <AvatarImage
                    src={images[quote.speaker as keyof typeof images]?.src}
                    alt={quote.speaker}
                  />
                  <AvatarFallback>{getInitials(quote.speaker)}</AvatarFallback>
                </Avatar>
                <div
                  className={`text-sm font-semibold} hover:text-black transition duration-300 `}
                >
                  {quote.speaker}{" "}
                </div>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={charactersOpen}
        onOpenChange={setCharactersOpen}
        className="w-full bg-slate-200 p-4 rounded-md mb-2"
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <Users />
            <h4 className="text-lg font-bold">Characters Appearances</h4>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <ChevronsUpDown />
              <span className="sr-only">Toggle details</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="px-2">
          {characters?.map((appearance) => (
            <div key={appearance.id} className="mb-2">
              <h4 className="text-md font-semibold">
                {appearance.character_id.name}
              </h4>
              <p>{appearance.character_id.description}</p>
              <p className="text-slate-500 text-sm">
                {appearance.context} (from{" "}
                {new Date(appearance.start_ms).toISOString().substr(11, 8)} to{" "}
                {new Date(appearance.end_ms).toISOString().substr(11, 8)})
              </p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={mediaReferencesOpen}
        onOpenChange={setMediaReferencesOpen}
        className="w-full bg-slate-200 p-4 rounded-md mb-2"
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2">
            <Music />
            <h4 className="text-lg font-bold">Media References</h4>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <ChevronsUpDown />
              <span className="sr-only">Toggle details</span>
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="px-2">
          {media_references?.map((reference) => (
            <div key={reference.id} className="mb-2">
              <div className="flex justify-between items-center border-l-2 pl-2">
                <div className="flex items-center gap-2">
                  <div className="text-slate-700 text-base italic">
                    "{reference.title}"
                  </div>
                  <div
                    className={`text-sm font-semibold border border-2 border-slate-300 px-2 py-1 rounded-xl uppercase tracking-wide ${getMediaReferenceColor(reference.media_type)}`}
                  >
                    {reference.media_type}{" "}
                  </div>
                </div>
                <span className="text-slate-500 text-sm">
                  {new Date(reference.start_ms).toISOString().substr(11, 8)}
                </span>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
