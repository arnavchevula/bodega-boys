export interface Episodes {
  id: string;
  created_at: string;
  youtube_id: string;
  title: string;
  date: string;
  duration: number;
  thumbnail_url: string;
  pipeline_status: string;
  assemblyai_transcription_id: string;
  episode_number: string;
  speakers: string[];
  content_start_ms: number;
  enrichment_status: string;
  speaker_check_status: string;
  sucio_word_count: number;
  enrichment_error: string;
  mero_smacked_score: number;
}

export interface Utterances {
  episode_id: string;
  created_at: string;
  speaker: string;
  text: string;
  start_ms: number;
  end_ms: number;
  sentiment: string;
  id: string;
  search: string;
  embedding: number[];
}

export interface Story {
  id: string;
  created_at: string;
  episode_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
  summary: string;
}

export interface MediaReference {
  id: string;
  created_at: string;
  episode_id: string;
  title: string;
  media_type: string;
  start_ms: number;
}

export interface Quote {
  id: string;
  episode_id: string;
  speaker: string;
  quote: string;
  start_ms: number;
  foreshadowing: boolean;
  dark_desus: boolean;
  hollywood_desus: boolean;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  first_episode_id: string;
}

export interface CharacterAppearance {
  id: string;
  episode_id: string;
  start_ms: number;
  end_ms: number;
  context: string;
  character_id: Character | null;
}

export interface NewsReference {
  id: string;
  episode_id: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
  headline: string;
  summary: string;
  url: string | null;
}
