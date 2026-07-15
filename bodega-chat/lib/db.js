import { createClient } from "@supabase/supabase-js";

export async function supabase() {
  return await createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );
}
