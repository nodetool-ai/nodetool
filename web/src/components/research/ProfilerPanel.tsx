/**
 * Performance Profiler Panel
 * 
 * A panel component for the workflow editor that shows performance analysis.
 */

import React from 'react';
import { PanelProps } from '@xyflow/react';
import { WorkflowProfiler } from './WorkflowProfiler';

export interface ProfilerPanelProps extends PanelProps {
  workflowId: string;
}

export const ProfilerPanel: React.FC<ProfilerPanelProps> = ({
  workflowId,
  ...props
}) => {
  return (
    <div {...props}>
      <WorkflowProfiler workflowId={workflowId} />
    </div>
  );
};

export default ProfilerPanel;
