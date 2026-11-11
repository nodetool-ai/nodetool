/**
 * Find people to share with by name, from the user directory of a
 * self-hosted SSO server. Other modes have no directory, so the search never
 * runs there.
 */
import { useQuery } from "@tanstack/react-query";
import type { people } from "@nodetool-ai/protocol/api-schemas";
import { isSsoMode } from "../lib/runtimeConfig";
import { trpcClient } from "../trpc/client";

export type Person = people.PersonItem;

/** The server needs at least this many characters. */
export const PEOPLE_SEARCH_MIN_LENGTH = 2;

export const peopleSearchQueryKey = (query: string) =>
  ["people", "search", query] as const;

/** Whether sharing by name is available here at all. */
export const canSearchPeople = (): boolean => isSsoMode();

export const usePeopleSearch = (query: string) => {
  const trimmed = query.trim();
  return useQuery({
    queryKey: peopleSearchQueryKey(trimmed),
    queryFn: () => trpcClient.people.search.query({ query: trimmed }),
    enabled: canSearchPeople() && trimmed.length >= PEOPLE_SEARCH_MIN_LENGTH,
    staleTime: 30 * 1000
  });
};
