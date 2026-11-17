/**
 * Settings → Integrations → Signed-in devices.
 *
 * One row per computer where the user signed in to the NodeTool desktop
 * apps. The node editor, the timeline and the desktop app on one computer
 * share a session, so they share a row. Ending a session deletes its tokens at once;
 * the apps on that computer show the signed-out state within a minute
 * (docs/plans/native-cloud-sync/technical-design.md, "Sign-in protocol").
 *
 * Renders nothing on a server that does not offer desktop sign-in.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LogoutIcon from "@mui/icons-material/Logout";
import type { DeviceSessionSummary } from "@nodetool-ai/protocol/api-schemas/agent-access.js";
import { useNotificationStore } from "../../stores/NotificationStore";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  Card,
  ConfirmDialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  Text
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";

export const DEVICE_SESSIONS_QUERY_KEY = ["agent-access", "device-sessions"] as const;

function formatDate(value: string, locale: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(parsed));
}

const DeviceSessionsSettings = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [toEnd, setToEnd] = useState<DeviceSessionSummary | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: DEVICE_SESSIONS_QUERY_KEY,
    queryFn: () => trpcClient.agentAccess.listDeviceSessions.query(),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  });

  const endSession = useMutation({
    mutationFn: (sessionId: string) =>
      trpcClient.agentAccess.endDeviceSession.mutate({ session_id: sessionId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DEVICE_SESSIONS_QUERY_KEY });
      addNotification({
        type: "info",
        alert: true,
        content: t("deviceSessions.ended")
      });
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("deviceSessions.endError", { error: String(err) })
      });
    },
    onSettled: () => setToEnd(null)
  });

  const appLabel = useCallback(
    (app: string | null): string =>
      app === "timeline"
        ? t("deviceSessions.apps.timeline")
        : app === "node-editor"
          ? t("deviceSessions.apps.nodeEditor")
          : app === "desktop"
            ? t("deviceSessions.apps.desktop")
            : (app ?? ""),
    [t]
  );

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const handleCloseConfirm = useCallback(() => setToEnd(null), []);
  const handleConfirmEnd = useCallback(() => {
    if (toEnd) endSession.mutate(toEnd.id);
  }, [toEnd, endSession]);

  if (data && !data.available) return null;

  const sessions = data?.sessions ?? [];

  return (
    <>
      <Text size="big" id="signed-in-devices" className="settings-heading">
        {t("deviceSessions.title")}
      </Text>
      <div className="settings-section">
        <Text className="description" sx={{ mb: 1 }}>
          {t("deviceSessions.description")}
        </Text>
        {isLoading && <LoadingSpinner size="small" />}
        {isError && (
          <ErrorBanner
            onRetry={handleRetry}
            report={{
              source: "operation-failure",
              summary: "Signed-in devices failed to load"
            }}
          >
            {t("deviceSessions.loadError")}
          </ErrorBanner>
        )}
        {data && sessions.length === 0 && (
          <Caption>{t("deviceSessions.empty")}</Caption>
        )}
        <FlexColumn gap={1}>
          {sessions.map((session) => (
            <Card key={session.id} sx={{ padding: `${SPACING.md}px` }}>
              <FlexRow justify="space-between" align="center" gap={2}>
                <FlexColumn gap={0}>
                  <Text sx={{ fontWeight: 500 }}>
                    {session.device_name ?? t("deviceSessions.unnamed")}
                  </Text>
                  <Caption>
                    {t("deviceSessions.signedInFrom", {
                      app: appLabel(session.app_name),
                      date: formatDate(session.created_at, i18n.language)
                    })}
                  </Caption>
                  <Caption>
                    {session.last_used_at
                      ? t("deviceSessions.lastUsed", {
                          date: formatDate(session.last_used_at, i18n.language)
                        })
                      : t("deviceSessions.neverUsed")}
                  </Caption>
                </FlexColumn>
                <EditorButton
                  variant="outlined"
                  startIcon={<LogoutIcon />}
                  onClick={() => setToEnd(session)}
                  disabled={endSession.isPending}
                >
                  {t("deviceSessions.end")}
                </EditorButton>
              </FlexRow>
            </Card>
          ))}
        </FlexColumn>
      </div>
      <ConfirmDialog
        open={toEnd !== null}
        onClose={handleCloseConfirm}
        onConfirm={handleConfirmEnd}
        title={t("deviceSessions.confirmTitle")}
        content={t("deviceSessions.confirmBody", {
          device: toEnd?.device_name ?? t("deviceSessions.unnamed")
        })}
        confirmText={t("deviceSessions.end")}
        cancelText={t("deviceSessions.cancel")}
        destructive
      />
    </>
  );
};

export default memo(DeviceSessionsSettings);
