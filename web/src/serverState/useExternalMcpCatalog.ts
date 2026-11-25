/**
 * The external MCP servers a workflow node may call and what each offers.
 * Connecting to a server can take a moment, so the answer is kept for a minute.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpcClient, type RouterOutputs } from "../trpc/client";

export type ExternalMcpCatalog = RouterOutputs["externalMcp"]["catalog"];

export const EXTERNAL_MCP_CATALOG_KEY = "externalMcpCatalog";

export const useExternalMcpCatalog = (): UseQueryResult<
  ExternalMcpCatalog,
  Error
> =>
  useQuery<ExternalMcpCatalog, Error>({
    queryKey: [EXTERNAL_MCP_CATALOG_KEY],
    queryFn: () => trpcClient.externalMcp.catalog.query(),
    staleTime: 60_000,
    retry: false
  });
