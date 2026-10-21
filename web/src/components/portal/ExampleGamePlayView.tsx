import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { trpc } from "../../trpc/client";
import { GamePlayer } from "../game/GamePlayerPage";
import { EmptyState, LoadingSpinner } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

const Player3D = lazy(() => import("../game/GamePlayer3D"));

/**
 * Full-page player at `/game/example/:slug`. A game card's Play button opens
 * it in a new browser tab, so the game starts without a second click.
 */
export default function ExampleGamePlayView() {
  const { t } = useTranslation();
  const { slug = "" } = useParams<{ slug: string }>();
  const query = trpc.games.example.useQuery(
    { slug },
    { staleTime: Infinity, retry: false }
  );
  const name = query.data?.name;
  useEffect(() => {
    if (!name) return;
    const previousTitle = window.document.title;
    window.document.title = `${name} · NodeTool`;
    return () => {
      window.document.title = previousTitle;
    };
  }, [name]);
  if (query.isPending) {
    return <LoadingSpinner text={t("pass3_18.examples.game.loading")} />;
  }
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title={t("pass3_18.examples.game.errors.loadTitle")}
        actionText={t("pass3_18.examples.actions.retry")}
        onAction={() => void query.refetch()}
        description={
          <ReportBugButton
            context={{
              source: "panel-crash",
              summary: t("pass3_18.examples.game.errors.reportSummary"),
              errorText: query.error.message
            }}
          />
        }
      />
    );
  }
  const { document } = query.data;
  return document.schemaVersion === 3 ? (
    <Suspense
      fallback={
        <LoadingSpinner text={t("pass3_18.examples.game.loading3dPlayer")} />
      }
    >
      <Player3D
        gameId={`example:${slug}`}
        name={query.data.name}
        document={document}
        autoPlay
      />
    </Suspense>
  ) : (
    <GamePlayer
      gameId={`example:${slug}`}
      name={query.data.name}
      document={document}
      setsDocumentTitle={false}
      autoPlay
    />
  );
}
