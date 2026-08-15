import { memo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LinkOffIcon from "@mui/icons-material/LinkOff";

import { restFetch } from "../../lib/rest-fetch";
import { isGoogleWorkspaceEnabled } from "../../lib/runtimeConfig";
import { useNotificationStore } from "../../stores/NotificationStore";
import googleColorIcon from "../../icons/providers/google-color.svg";
import {
  Box,
  Card,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

interface GoogleTokensResponse {
  enabled: boolean;
  tokens: Array<{ username?: string | null }>;
}

const QUERY_KEY = ["oauth-token", "google"];

/**
 * Google Workspace connection status.
 *
 * There is no connect button: access comes from signing in with Google, which
 * grants Drive, Gmail, Docs, Sheets and Calendar in the same consent step. The
 * card renders nothing on servers without a login (Local mode), where the
 * integration does not exist.
 */
const GoogleWorkspaceCard = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const enabled = isGoogleWorkspaceEnabled();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await restFetch("/api/oauth/google/tokens");
      if (!response.ok) {
        throw new Error("Failed to fetch Google connection");
      }
      return (await response.json()) as GoogleTokensResponse;
    },
    enabled
  });

  const account = data?.tokens?.[0]?.username ?? null;
  const isConnected = (data?.tokens?.length ?? 0) > 0;

  const disconnect = useCallback(async () => {
    try {
      const response = await restFetch("/api/oauth/google/disconnect", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      addNotification({
        content:
          "Disconnected Google Workspace. Sign in with Google again to restore access.",
        type: "success",
        alert: true
      });
    } catch {
      addNotification({
        content: "Failed to disconnect Google Workspace",
        type: "error",
        alert: true
      });
    }
  }, [queryClient, addNotification]);

  if (!enabled) {
    return null;
  }

  return (
    <Card sx={{ padding: getSpacingPx(SPACING.md) }}>
      <FlexRow align="center" justify="space-between" gap={SPACING.md}>
        <FlexRow align="center" gap={SPACING.md}>
          <Box
            component="img"
            src={googleColorIcon}
            alt=""
            sx={{ width: 24, height: 24 }}
          />
          <FlexColumn gap={SPACING.xs}>
            <FlexRow align="center" gap={SPACING.sm}>
              <Text>Google Workspace</Text>
              <Chip
                label={isConnected ? "Connected" : "Not connected"}
                color={isConnected ? "success" : "default"}
                size="small"
              />
            </FlexRow>
            <Caption>
              {isConnected
                ? `Drive, Gmail, Docs, Sheets and Calendar${
                    account ? ` as ${account}` : ""
                  }`
                : "Sign in with Google to give agents and nodes access to Drive, Gmail, Docs, Sheets and Calendar."}
            </Caption>
          </FlexColumn>
        </FlexRow>

        {isConnected && (
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            startIcon={<LinkOffIcon sx={{ fontSize: 14 }} />}
            onClick={disconnect}
          >
            Disconnect
          </EditorButton>
        )}
      </FlexRow>
    </Card>
  );
};

export default memo(GoogleWorkspaceCard);
