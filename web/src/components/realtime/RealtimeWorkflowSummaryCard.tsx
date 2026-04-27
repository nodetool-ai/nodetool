import type { Workflow } from "../../stores/ApiTypes";
import { Card, FlexColumn, Text } from "../ui_primitives";

interface RealtimeWorkflowSummaryCardProps {
  workflow: Workflow;
}

export const RealtimeWorkflowSummaryCard = ({
  workflow
}: RealtimeWorkflowSummaryCardProps) => {
  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={(theme) => ({ borderRadius: theme.rounded.xs })}
    >
      <FlexColumn gap={1}>
        <Text weight={600}>{workflow.name}</Text>
        {workflow.description ? (
          <Text color="secondary">{workflow.description}</Text>
        ) : null}
        <Text color="secondary">
          Workflow id: <code>{workflow.id}</code>
        </Text>
      </FlexColumn>
    </Card>
  );
};
