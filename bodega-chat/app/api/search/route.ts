import { NextRequest, NextResponse } from "next/server";
import { VoyageAIClient } from "voyageai";
import { supabase } from "@/lib/db";

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export async function POST(request: NextRequest) {
  const db = await supabase();
  const body = await request.json();
  const query: string = (body.query || "").trim();

  if (!query) {
    return NextResponse.json({ lexical: [], semantic: [] });
  }

  const [lexical, semantic] = await Promise.all([
    db
      .from("utterances")
      .select(
        "id, episode_id ( title, date, thumbnail_url ), speaker, text, start_ms, end_ms",
      )
      .textSearch("search", query, { type: "websearch", config: "english" })
      .limit(20),
    embedAndMatch(db, query),
  ]);

  if (lexical.error) console.error("/api/search lexical", lexical.error);
  if (semantic.error) console.error("/api/search semantic", semantic.error);

  return NextResponse.json({
    lexical: lexical.data ?? [],
    semantic: semantic.data ?? [],
  });
}

async function embedAndMatch(db: Awaited<ReturnType<typeof supabase>>, query: string) {
  // Caught here (not left to propagate through Promise.all) so a Voyage
  // failure only degrades semantic results — lexical, resolved independently
  // in the same Promise.all, should still come back to the user.
  try {
    // Matches embed.py's indexing-side call (voyage-3.5-lite, 512 dims)
    // except for inputType: Voyage's models bake in asymmetric query/document
    // instructions, so the query side must say "query", not "document" —
    // passing the wrong one doesn't error, it just degrades match quality.
    const embedResponse = await voyage.embed({
      input: query,
      model: "voyage-3.5-lite",
      outputDimension: 512,
      inputType: "query",
    });
    const queryEmbedding = embedResponse.data?.[0]?.embedding;
    if (!queryEmbedding) {
      return { data: null, error: new Error("Voyage returned no embedding") };
    }
    return await db.rpc("match_utterances", {
      query_embedding: queryEmbedding,
      match_count: 20,
    });
  } catch (error) {
    return { data: null, error };
  }
}
