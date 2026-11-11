/**
 * People — the `people.*` tRPC procedures.
 *
 * Find other people on a self-hosted SSO server to share a document with by
 * name. Reads the user directory, which holds a row for each person who has
 * signed in through SSO, so other modes find nobody.
 */

import { z } from "zod";

export const personItem = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable()
});
export type PersonItem = z.infer<typeof personItem>;

export const peopleSearchInput = z.object({
  /** Part of a name or email address. */
  query: z.string().trim().min(2).max(200)
});
export type PeopleSearchInput = z.infer<typeof peopleSearchInput>;

export const peopleSearchOutput = z.object({
  people: z.array(personItem)
});
export type PeopleSearchOutput = z.infer<typeof peopleSearchOutput>;
