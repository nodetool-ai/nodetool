import { supabase } from "./supabaseClient";
import { isSsoMode } from "./runtimeConfig";
import { getSsoToken, getSsoUser } from "./ssoSession";

/** The bearer token and user id of the signed-in session. */
export interface AccessSession {
  token: string;
  userId: string;
}

/**
 * The signed-in session's bearer token, from the SSO session in SSO mode and
 * from Supabase otherwise. Null when nobody is signed in.
 */
export const getAccessSession = async (): Promise<AccessSession | null> => {
  if (isSsoMode()) {
    const token = getSsoToken();
    const user = getSsoUser();
    return token && user ? { token, userId: user.id } : null;
  }
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session
    ? { token: session.access_token, userId: session.user?.id ?? "" }
    : null;
};

export const authHeader = async (): Promise<Record<string, string>> => {
  const session = await getAccessSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
};
