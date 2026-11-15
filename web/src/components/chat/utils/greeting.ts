/**
 * The empty chat greets the user by the time of day and their first name,
 * as Claude does ("Good evening, Matthias").
 */

export type DayPart = "morning" | "afternoon" | "evening";

/** Morning from 5:00, afternoon from 12:00, evening from 18:00 until 5:00. */
export const dayPartFor = (hour: number): DayPart => {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }
  return "evening";
};

interface NamedUser {
  name?: unknown;
  email?: unknown;
  user_metadata?: Record<string, unknown> | null;
}

const firstWord = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const word = value.trim().split(/\s+/)[0];
  return word ? word : null;
};

/**
 * The first name of a Supabase, SSO or local user, or null when the account
 * carries no name. An email address is never turned into a name.
 */
export const firstNameOf = (user: unknown): string | null => {
  if (!user || typeof user !== "object") {
    return null;
  }
  const named = user as NamedUser;
  const metadata = named.user_metadata ?? {};
  return (
    firstWord(metadata.given_name) ??
    firstWord(metadata.full_name) ??
    firstWord(metadata.name) ??
    firstWord(named.name)
  );
};
