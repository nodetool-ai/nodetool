import { lazy, Suspense } from "react";
import { trpc } from "../../trpc/client";
import { GamePlayer } from "../game/GamePlayerPage";
import { EmptyState, LoadingSpinner } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

const Player3D = lazy(() => import("../game/GamePlayer3D"));

interface ExampleGamePlayViewProps {
  slug: string;
}

export default function ExampleGamePlayView({
  slug
}: ExampleGamePlayViewProps) {
  const query = trpc.games.example.useQuery(
    { slug },
    { staleTime: Infinity, retry: false }
  );
  if (query.isPending) {
    return <LoadingSpinner text="Loading game" />;
  }
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title="Could not load game"
        actionText="Retry"
        onAction={() => void query.refetch()}
        description={
          <ReportBugButton
            context={{
              source: "panel-crash",
              summary: "Example game failed",
              errorText: query.error.message
            }}
          />
        }
      />
    );
  }
  const { name, document } = query.data;
  return document.schemaVersion === 3 ? (
    <Suspense fallback={<LoadingSpinner text="Loading 3D player" />}>
      <Player3D gameId={`example:${slug}`} name={name} document={document} />
    </Suspense>
  ) : (
    <GamePlayer gameId={`example:${slug}`} name={name} document={document} />
  );
}
