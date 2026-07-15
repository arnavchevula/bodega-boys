"use client";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Fragment, useMemo, useState } from "react";
import Fuse from "fuse.js";
import { getEpisodeCategory } from "@/lib/utils";

export default function EpisodeList({ episodes }) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [speakerFilter, setSpeakerFilter] = useState([]);
  console.log(categoryFilter);
  const fuse = useMemo(() => {
    return new Fuse(episodes, {
      keys: ["title", "speakers"], // fields to search
      threshold: 0.8, // 0 = exact, 1 = match anything
    });
  }, []);
  const results = query ? fuse.search(query) : [];
  const displayItems =
    results.length > 0 ? results.map(({ item }) => item) : episodes;
  const anchorCategory = useComboboxAnchor();
  const anchorSpeaker = useComboboxAnchor();

  const filteredItems = useMemo(() => {
    const noFilters = categoryFilter.length === 0 && speakerFilter.length === 0;
    if (noFilters) {
      return displayItems;
    } else {
      return displayItems.filter((episode) => {
        const filteredBySpeaker =
          episode.speakers.some((speaker) => speakerFilter.includes(speaker)) ||
          speakerFilter.length === 0;
        const filteredByCategory =
          categoryFilter.includes(getEpisodeCategory(episode.title)) ||
          categoryFilter.length === 0;
        return filteredBySpeaker && filteredByCategory;
      });
    }
  }, [categoryFilter, speakerFilter, displayItems]);

  const categories = [
    "Podcast Episodes",
    "Bodega Toons",
    "Intimate Moments",
    "Miscellaneous",
  ];
  const speakers = [
    ...new Set(episodes?.flatMap((episode) => episode.speakers)),
  ];
  return (
    <div className="w-full">
      <div className="p-2 sm:p-0">
        <InputGroup className="w-full">
          <InputGroupInput
            placeholder="Search..."
            onChange={(e) => setQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            {results.length} results
          </InputGroupAddon>
        </InputGroup>
        <div className="mt-2 flex gap-2 flex-col sm:flex-row flex-1">
          <Combobox
            multiple
            autoHighlight
            items={categories}
            value={categoryFilter}
            onValueChange={setCategoryFilter}
          >
            <ComboboxChips ref={anchorCategory} className="w-full">
              <ComboboxValue>
                {(values) => (
                  <Fragment>
                    {values.map((value: string) => (
                      <ComboboxChip key={value}>{value}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput placeholder="Select category..." />
                  </Fragment>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchorCategory}>
              <ComboboxEmpty>No items found.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <Combobox
            multiple
            autoHighlight
            items={speakers}
            value={speakerFilter}
            onValueChange={setSpeakerFilter}
          >
            <ComboboxChips ref={anchorSpeaker} className="w-full">
              <ComboboxValue>
                {(values) => (
                  <Fragment>
                    {values.map((value: string) => (
                      <ComboboxChip key={value}>{value}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput placeholder="Select speakers..." />
                  </Fragment>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchorSpeaker}>
              <ComboboxEmpty>No items found.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>

      <div className="flex flex-col flex-1 gap-4 p-2 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-4 lg:p-0">
        {filteredItems.map((episode) => {
          return (
            <div
              className="flex flex-col gap-2 rounded-xl shadow-xl justify-between fadeIn hover:scale-105 transition duration-300 "
              key={episode.id}
            >
              <Link href={`/episodes/${episode.id}`}>
                <div>
                  <Image
                    src={episode.thumbnail_url}
                    alt={episode.title}
                    className="w-full h-full object-cover rounded-tl-xl rounded-tr-xl"
                    width={400}
                    height={225}
                  />
                </div>
                <div className="flex flex-col gap-1 p-2">
                  <h2 className="text-base italic">
                    {episode.title.split(":")[0]}
                  </h2>
                  <h2 className="text-2xl">{episode.title.split(":")[1]}</h2>
                  <h3>{new Date(episode.date).toLocaleDateString()}</h3>
                  <h3>{episode.duration}</h3>
                  <div className="flex gap-2 flex-wrap">
                    {episode.speakers.map((speaker) => {
                      return (
                        <div
                          className="bg-slate-800 text-slate-300 px-2 py-1 rounded-xl uppercase text-sm tracking-wide"
                          key={speaker}
                        >
                          {speaker}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
