import { memo } from "react";

import ApplicationGovernancePanel from "../applications/ApplicationGovernancePanel";
import { useApplication } from "../../hooks/useApplications";
import {
  Caption,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  ScrollArea,
  Text,
  SPACING
} from "../ui_primitives";

export interface ApplicationSurfaceProps {
  refId: string;
}

/**
 * Workspace surface for a mini app. Shows the app's identity and its publish +
 * governance controls; the WYSIWYG editing of the app document still lives in
 * the app builder.
 */
const ApplicationSurface = ({ refId }: ApplicationSurfaceProps) => {
  const { data: application, isLoading, isError, error } = useApplication(refId);

  if (isLoading) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  if (isError || !application) {
    return (
      <EmptyState
        variant="error"
        title="Could not load app"
        description={error?.message ?? "The app may have been deleted."}
      />
    );
  }

  return (
    <ScrollArea fullHeight>
      <FlexColumn gap={SPACING.lg} padding={SPACING.xl} fullWidth>
        <FlexColumn gap={SPACING.xs}>
          <Text size="big" weight={600}>
            {application.name || "Untitled app"}
          </Text>
          {application.description && (
            <Caption>{application.description}</Caption>
          )}
        </FlexColumn>
        <ApplicationGovernancePanel applicationId={application.id} />
      </FlexColumn>
    </ScrollArea>
  );
};

export default memo(ApplicationSurface);
