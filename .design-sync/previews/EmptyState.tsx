import * as React from "react";
import { EmptyState } from "nodetool";

export const Empty = () => (
  <div style={{ width: 380 }}>
    <EmptyState
      variant="empty"
      title="No workflows yet"
      description="Create your first workflow to start building AI pipelines."
      actionText="New workflow"
      onAction={() => {}}
    />
  </div>
);

export const NoResults = () => (
  <div style={{ width: 380 }}>
    <EmptyState
      variant="no-results"
      title="No models match “flux”"
      description="Try a different search term or browse all available models."
    />
  </div>
);

export const Error = () => (
  <div style={{ width: 380 }}>
    <EmptyState
      variant="error"
      title="Couldn't reach the worker"
      description="The Python worker isn't responding. Restart it and try again."
      actionText="Retry"
      onAction={() => {}}
    />
  </div>
);

export const Offline = () => (
  <div style={{ width: 380 }}>
    <EmptyState variant="offline" size="small" />
  </div>
);
