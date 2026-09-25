import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getEpisodeSortKey = (title: string) => {
  const normalizedTitle = title.trim();
  const episodeNumberMatch = normalizedTitle.match(
    /(?:^|\b)(?:Ep|Episode)\s*(\d+)(?=\b|:)/i,
  );
  const episodeNumber = episodeNumberMatch
    ? Number(episodeNumberMatch[1])
    : Number.MAX_SAFE_INTEGER;

  if (/^Bodega Boys\b/i.test(normalizedTitle)) {
    return { bucket: 0, episodeNumber, title: normalizedTitle };
  }

  if (/^Bodega Toons\b/i.test(normalizedTitle)) {
    return { bucket: 1, episodeNumber, title: normalizedTitle };
  }

  if (/^Intimate Moments\b/i.test(normalizedTitle)) {
    return { bucket: 2, episodeNumber, title: normalizedTitle };
  }

  return { bucket: 3, episodeNumber, title: normalizedTitle };
};

export const getEpisodeCategory = (title: string) => {
  if (/^Bodega Boys\b/i.test(title.trim())) {
    return "Podcast Episodes";
  } else if (/^Bodega Toons\b/i.test(title.trim())) {
    return "Bodega Toons";
  } else if (/^Intimate Moments\b/i.test(title.trim())) {
    return "Intimate Moments";
  } else {
    return "Miscellaneous";
  }
};

export const images: Record<string, { src: string }> = {
  "The Kid Mero": {
    src: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/mero.webp`,
  },
  "Desus Nice": {
    src: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/desus.webp`,
  },
  "Victor Lopez": {
    src: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/victor.webp`,
  },
};

export function getWordCount(str?: string | null) {
  if (!str) return 0;
  return str.trim() === "" ? 0 : str.trim().split(/\s+/).length;
}

export function getSpeakerColor(speaker: string) {
  switch (speaker) {
    case "Desus Nice":
      return "bg-cyan-400";
    case "The Kid Mero":
      return "bg-cyan-600";
    case "Victor Lopez":
      return "bg-cyan-800";
    default:
      return "bg-gray-400";
  }
}

export function getBorderColor(speaker: string) {
  switch (speaker) {
    case "Desus Nice":
      return "border-cyan-400";
    case "The Kid Mero":
      return "border-cyan-600";
    case "Victor Lopez":
      return "border-cyan-800";
    default:
      return "border-gray-400";
  }
}

export function getPillColor(speaker: string) {
  switch (speaker) {
    case "Desus Nice":
      return "bg-cyan-400 text-white";
    case "The Kid Mero":
      return "bg-orange-600 text-white";
    case "Victor Lopez":
      return "bg-cyan-800 text-white";
    default:
      return "bg-gray-400 text-white";
  }
}

export function getMediaReferenceColor(mediaReference: string) {
  switch (mediaReference) {
    case "album":
      return "bg-green-400 text-white";
    case "film":
      return "bg-blue-400 text-white";
    case "tv":
      return "bg-purple-400 text-white";
    case "theater":
      return "bg-yellow-400 text-white";
    case "website":
      return "bg-pink-400 text-white";
    case "song":
      return "bg-red-400 text-white";
    case "book":
      return "bg-indigo-400 text-white";
    default:
      return "bg-gray-400 text-white";
  }
}

export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0].toUpperCase())
    .join("");
}
