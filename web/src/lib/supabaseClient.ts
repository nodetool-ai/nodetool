import { createClient } from "@supabase/supabase-js";

/**
 * Create the Supabase client using credentials from environment variables.
 * The variables should be provided in a Vite-compatible `.env` file or
 * through the deployment environment. This keeps sensitive data out of
 * the repository and allows easy configuration for different deployments.
 */

// Vite exposes environment variables via `import.meta.env`
const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase credentials not found in environment. Using test placeholders for development."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "http://localhost",
  supabaseAnonKey ?? "public-anon-key"
);
