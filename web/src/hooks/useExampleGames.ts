import { trpc } from "../trpc/client";

/** The shipped example games the Examples page lists. */
export const useExampleGames = () =>
  trpc.games.examples.useQuery(undefined, { staleTime: 5 * 60_000 });

/** Copy a shipped example game and its media into a project. */
export const useInstallExampleGame = () => {
  const utils = trpc.useUtils();
  return trpc.games.installExample.useMutation({
    onSuccess: (created) => {
      void utils.games.list.invalidate({ projectId: created.game.projectId });
    }
  });
};
