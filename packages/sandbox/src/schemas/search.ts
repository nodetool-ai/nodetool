import { z } from "zod";

/**
 * Search tool — web search abstracted behind a provider. The actual
 * HTTP call to Brave/Tavily/Serper is made inside the container, using
 * env-configured API keys injected by the host at container-create time.
 */

export const SearchDateRange = z.enum([
  "any",
  "past_day",
  "past_week",
  "past_month",
  "past_year"
]);
export type SearchDateRange = z.infer<typeof SearchDateRange>;

export const InfoSearchWebInput = z.object({
  query: z.string().min(1),
  date_range: SearchDateRange.optional(),
  count: z.number().int().positive().max(20).optional()
});
export type InfoSearchWebInput = z.infer<typeof InfoSearchWebInput>;

export const SearchResult = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  published_at: z.string().nullable()
});
export type SearchResult = z.infer<typeof SearchResult>;

export const InfoSearchWebOutput = z.object({
  provider: z.string(),
  query: z.string(),
  results: z.array(SearchResult)
});
export type InfoSearchWebOutput = z.infer<typeof InfoSearchWebOutput>;
