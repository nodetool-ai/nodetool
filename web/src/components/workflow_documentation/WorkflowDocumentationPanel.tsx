/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { memo, useCallback } from 'react';
import { useWorkflowDocumentationStore } from '../../stores/WorkflowDocumentationStore';
import WorkflowNotesEditor from './WorkflowNotesEditor';
import PanelHeadline from '../ui/PanelHeadline';

interface WorkflowDocumentationPanelProps {
  workflowId: string;
}

const styles = (theme: Theme) =>
  css({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    '& .panel-header': {
      padding: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    '& .panel-content': {
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    },
    '& .empty-state': {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: theme.spacing(4),
      textAlign: 'center',
      color: theme.vars.palette.text.secondary
    },
    '& .empty-state-icon': {
      fontSize: '64px',
      marginBottom: theme.spacing(2),
      opacity: 0.3
    }
  });

const WorkflowDocumentationPanel: React.FC<WorkflowDocumentationPanelProps> = memo(
  ({ workflowId }) => {
    const theme = useTheme();
    const { getDocumentation, updateNotes } = useWorkflowDocumentationStore();

    const documentation = getDocumentation(workflowId);
    const notes = documentation?.notes || '';

    const handleNotesChange = useCallback(
      (newNotes: string) => {
        updateNotes(workflowId, newNotes);
      },
      [workflowId, updateNotes]
    );

    if (!workflowId) {
      return (
        <Box css={styles(theme)} className="workflow-documentation-panel">
          <div className="panel-header">
            <PanelHeadline title="Workflow Documentation" />
          </div>
          <Box className="empty-state">
            <Typography variant="body2" color="text.secondary">
              No workflow selected
            </Typography>
          </Box>
        </Box>
      );
    }

    return (
      <Box css={styles(theme)} className="workflow-documentation-panel">
        <div className="panel-header">
          <PanelHeadline title="Workflow Documentation" />
        </div>
        <Box className="panel-content">
          <WorkflowNotesEditor notes={notes} onChange={handleNotesChange} />
        </Box>
      </Box>
    );
  }
);

WorkflowDocumentationPanel.displayName = 'WorkflowDocumentationPanel';

export default WorkflowDocumentationPanel;
export { WorkflowDocumentationPanel };
