import { supabase } from "./supabaseClient";

export const authHeader = async (): Promise<Record<string, string>> => {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};

  if (session) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
};
