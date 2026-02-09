/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  TextField,
  Typography,
  Tabs,
  Tab,
  Chip
} from '@mui/material';
import { useState, useCallback, memo, useMemo } from 'react';
import ChatMarkdown from '../chat/message/ChatMarkdown';

interface WorkflowNotesEditorProps {
  notes: string;
  onChange: (notes: string) => void;
  readOnly?: boolean;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`workflow-notes-tabpanel-${index}`}
      aria-labelledby={`workflow-notes-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ height: '100%', overflow: 'auto' }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `workflow-notes-tab-${index}`,
    'aria-controls': `workflow-notes-tabpanel-${index}`
  };
}

const styles = (theme: Theme) =>
  css({
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    '& .editor-header': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing(1, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    '& .tabs-container': {
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    '& .editor-content, & .preview-content': {
      flex: 1,
      overflow: 'auto',
      padding: theme.spacing(2)
    },
    '& .preview-content': {
      '& .markdown-body': {
        fontSize: '14px',
        '& h1': {
          fontSize: '2em',
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          paddingBottom: theme.spacing(1),
          marginBottom: theme.spacing(2)
        },
        '& h2': {
          fontSize: '1.5em',
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          paddingBottom: theme.spacing(0.75),
          marginBottom: theme.spacing(1.5)
        },
        '& h3': {
          fontSize: '1.25em',
          marginBottom: theme.spacing(1)
        },
        '& p': {
          marginBottom: theme.spacing(1.5),
          lineHeight: 1.6
        },
        '& ul, & ol': {
          marginLeft: theme.spacing(2.5),
          marginBottom: theme.spacing(1.5)
        },
        '& code': {
          backgroundColor: theme.vars.palette.grey[800],
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '0.9em'
        },
        '& pre': {
          backgroundColor: theme.vars.palette.grey[900],
          padding: theme.spacing(1.5),
          borderRadius: '6px',
          overflow: 'auto',
          marginBottom: theme.spacing(1.5)
        },
        '& blockquote': {
          borderLeft: `4px solid ${theme.vars.palette.primary.main}`,
          paddingLeft: theme.spacing(2),
          marginLeft: 0,
          color: theme.vars.palette.text.secondary,
          fontStyle: 'italic'
        },
        '& a': {
          color: 'var(--palette-primary-main)',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        },
        '& table': {
          borderCollapse: 'collapse',
          width: '100%',
          marginBottom: theme.spacing(1.5),
          '& th, & td': {
            border: `1px solid ${theme.vars.palette.divider}`,
            padding: theme.spacing(1)
          },
          '& th': {
            backgroundColor: theme.vars.palette.grey[800]
          }
        }
      }
    }
  });

const markdownHelpText = `# Workflow Documentation

Add notes about your workflow using Markdown:

## Formatting
- **Bold** with \`**text**\`
- *Italic* with \`*text*\`
- \`code\` with backticks
- ~~strikethrough~~ with \`~~text~~\`

## Links
[Link text](https://example.com)

## Code blocks
\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`

## Lists
- Item 1
- Item 2
  - Nested item

1. First
2. Second
3. Third

## Quotes
> Important note

## Tables
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

---

Start typing your documentation below...`;

const WorkflowNotesEditor: React.FC<WorkflowNotesEditorProps> = memo(({ notes, onChange, readOnly = false }) => {
  const theme = useTheme();
  const [tabValue, setTabValue] = useState(0);
  const [wordCount, charCount] = useMemo(() => {
    const words = notes.trim().split(/\s+/).filter((w) => w.length > 0);
    return [words.length, notes.length];
  }, [notes]);

  const handleTabChange = useCallback((_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  }, []);

  const handleNotesChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );

  return (
    <Box css={styles(theme)} className="workflow-notes-editor">
      <div className="editor-header">
        <Typography variant="subtitle2" color="text.secondary">
          Workflow Notes
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={`${charCount} chars`} size="small" variant="outlined" />
          <Chip label={`${wordCount} words`} size="small" variant="outlined" />
        </Box>
      </div>

      <div className="tabs-container">
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="Workflow notes tabs"
          variant="fullWidth"
        >
          <Tab label="Edit" {...a11yProps(0)} />
          <Tab label="Preview" {...a11yProps(1)} />
          <Tab label="Help" {...a11yProps(2)} />
        </Tabs>
      </div>

      <TabPanel value={tabValue} index={0}>
        <Box className="editor-content">
          {readOnly ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {notes || 'No documentation added yet.'}
              </Typography>
            </Box>
          ) : (
            <TextField
              fullWidth
              multiline
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add workflow documentation here... (Markdown supported)"
              sx={{
                height: '100%',
                '& .MuiInputBase-root': {
                  height: '100%',
                  alignItems: 'flex-start'
                },
                '& .MuiInputBase-input': {
                  height: '100% !important',
                  overflow: 'auto !important',
                  fontFamily: theme.fontFamily1,
                  fontSize: '14px',
                  lineHeight: 1.6
                }
              }}
              slotProps={{
                htmlInput: {
                  spellCheck: false
                } as any
              }}
            />
          )}
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box className="preview-content">
          {notes ? (
            <ChatMarkdown content={notes} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Preview will appear here once you add content...
            </Typography>
          )}
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Box className="preview-content">
          <ChatMarkdown content={markdownHelpText} />
        </Box>
      </TabPanel>
    </Box>
  );
});

WorkflowNotesEditor.displayName = 'WorkflowNotesEditor';

export default WorkflowNotesEditor;
