import { createClient } from "@supabase/supabase-js";

// TODO: Move these to environment variables (.env file and deployment settings)
const supabaseUrl = "https://zmytgmyiwfmdajmxjbag.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpteXRnbXlpd2ZtZGFqbXhqYmFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU4NTkyMTQsImV4cCI6MjA2MTQzNTIxNH0.vlsrFP-nQzfeg2pftlKoVejollw_3AK7YI80jRGsSkA";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and Anon Key must be provided.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
