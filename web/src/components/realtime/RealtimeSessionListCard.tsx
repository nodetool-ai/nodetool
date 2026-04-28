import type { RealtimeSessionRecord } from "@nodetool/protocol";

import { Card, EditorButton, FlexColumn, FlexRow, Text } from "../ui_primitives";
import {
  realtimeCardSx,
  realtimeControlSx,
  realtimeMediaSx
} from "./realtimeStyles";

interface RealtimeSessionListCardProps {
  activeSessionId: string | null;
  sessions: RealtimeSessionRecord[];
  onSelectSession: (sessionId: string) => void;
}

export const RealtimeSessionListCard = ({
  activeSessionId,
  sessions,
  onSelectSession
}: RealtimeSessionListCardProps) => {
  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={realtimeCardSx}
    >
      <FlexColumn gap={2}>
        <Text weight={600}>Workflow Sessions</Text>
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <FlexRow
              key={session.session_id}
              justify="space-between"
              align="center"
              sx={{
                borderColor: "divider",
                borderStyle: "solid",
                borderWidth: 1,
                ...realtimeMediaSx,
                padding: 1.5
              }}
            >
              <FlexColumn gap={0.5}>
                <Text weight={600}>{session.session_id}</Text>
                <Text color="secondary">{session.status}</Text>
              </FlexColumn>
              <EditorButton
                onClick={() => onSelectSession(session.session_id)}
                disabled={session.session_id === activeSessionId}
                sx={realtimeControlSx}
              >
                View
              </EditorButton>
            </FlexRow>
          ))
        ) : (
          <Text color="secondary">
            No realtime sessions have been started for this workflow.
          </Text>
        )}
      </FlexColumn>
    </Card>
  );
};
