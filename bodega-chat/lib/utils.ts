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
    src: "https://gfcspnocbsvapvvatkzf.supabase.co/storage/v1/object/sign/images/mero.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85ZmZhNmQ1OC1hMmVhLTRkMDItYTdjYi0yNzQ1M2E3OWM1MDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvbWVyby53ZWJwIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MjQxNDcwNiwiZXhwIjoxODEzOTUwNzA2fQ.tqduvRHgHWNSYM8ltZqRojxWW5BDi87ztyZ9Vcq70RI",
  },
  "Desus Nice": {
    src: "https://gfcspnocbsvapvvatkzf.supabase.co/storage/v1/object/sign/images/desus.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85ZmZhNmQ1OC1hMmVhLTRkMDItYTdjYi0yNzQ1M2E3OWM1MDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvZGVzdXMud2VicCIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODI0MTQ2ODUsImV4cCI6MTgxMzk1MDY4NX0.xxJCPVaG6EndEHXcevioi6Uvz6qtZQyqFuXyKSkBFik",
  },
  "Victor Lopez": {
    src: "https://gfcspnocbsvapvvatkzf.supabase.co/storage/v1/object/sign/images/victor.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85ZmZhNmQ1OC1hMmVhLTRkMDItYTdjYi0yNzQ1M2E3OWM1MDciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJpbWFnZXMvdmljdG9yLndlYnAiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgyNDE0NzE0LCJleHAiOjE4MTM5NTA3MTR9.Lyhmzp12ZIxA4Rm7Ic3QQo2GqwypCr77IKVW-W6T5n0",
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

export function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0].toUpperCase())
    .join("");
}
