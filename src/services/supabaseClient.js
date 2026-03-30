// Cliente Supabase só para Storage (upload de fotos da solicitação de agendamento).
import { createClient } from "@supabase/supabase-js";

let client;

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function getSupabaseBrowser() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Configure REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_ANON_KEY no arquivo .env (veja .env.example)."
    );
  }
  if (!client) {
    client = createClient(url, anon);
  }
  return client;
}
