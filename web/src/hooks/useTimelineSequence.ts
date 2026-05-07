import { trpc } from "../trpc/client";

export const useTimeline = (id: string | null | undefined) =>
  trpc.timeline.get.useQuery(
    { id: id ?? "" },
    { enabled: !!id, staleTime: 30_000 }
  );
