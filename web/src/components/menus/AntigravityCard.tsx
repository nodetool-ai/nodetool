import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../lib/trpc";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  Chip,
  CodeBlock,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../ui_primitives";

const INSTALLATION_KEY = ["antigravity", "installation"] as const;

export default function AntigravityCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: INSTALLATION_KEY,
    queryFn: () => trpc.antigravity.status.query(),
    staleTime: 10_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.installing ? 1000 : false)
  });
  const refresh = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: INSTALLATION_KEY }),
      queryClient.invalidateQueries({
        predicate: (query) => {
          const head = query.queryKey[0];
          return (
            typeof head === "string" &&
            (head === "providers" ||
              head.endsWith("-models") ||
              head.endsWith("_models"))
          );
        }
      })
    ]);
  };
  const install = useMutation({
    mutationFn: () =>
      trpc.antigravity.install.mutate(undefined, {
        context: { skipBatch: true }
      }),
    onSuccess: refresh,
    retry: false
  });
  const busy = install.isPending || status.data?.installing;
  const installed = status.data?.installed;
  const error = install.error ?? status.error;

  return (
    <FlexColumn
      component="article"
      aria-label="Antigravity"
      gap={SPACING.lg}
      sx={{ padding: SPACING.xl }}
    >
      <FlexRow align="center" gap={SPACING.md}>
        <Text>Antigravity</Text>
        <Chip
          size="small"
          label={t(
            status.isLoading
              ? "antigravity.checking"
              : !status.data || !status.data.available
                ? "antigravity.statusUnavailable"
                : busy
                  ? "antigravity.installing"
                  : installed
                    ? "antigravity.installed"
                    : "antigravity.notInstalled"
          )}
        />
      </FlexRow>
      <Text>{t("antigravity.description")}</Text>
      {error && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Antigravity setup failed",
            errorText: error.message
          }}
          onRetry={() => {
            if (install.error) {
              install.mutate();
            } else {
              void status.refetch();
            }
          }}
        >
          {error.message}
        </ErrorBanner>
      )}
      {status.data?.reason && <Caption>{status.data.reason}</Caption>}
      {installed && status.data?.command ? (
        <>
          <Text>{t("antigravity.signIn")}</Text>
          <CodeBlock language="shell" copyable>
            {status.data.command}
          </CodeBlock>
          <EditorButton
            disabled={status.isFetching || busy}
            onClick={() => {
              void refresh();
            }}
          >
            {t("antigravity.refreshModels")}
          </EditorButton>
        </>
      ) : (
        <>
          <Caption>{t("antigravity.installDescription")}</Caption>
          <EditorButton
            variant="contained"
            disabled={!status.data?.available || busy || status.isLoading}
            onClick={() => install.mutate()}
          >
            {t(
              status.isLoading
                ? "antigravity.checking"
                : busy
                  ? "antigravity.installing"
                  : "antigravity.install"
            )}
          </EditorButton>
        </>
      )}
    </FlexColumn>
  );
}
