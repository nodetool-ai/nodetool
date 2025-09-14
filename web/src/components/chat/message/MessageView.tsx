import React, { useMemo, useState } from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent,
  ToolCall
} from "../../../stores/ApiTypes";
import ChatMarkdown from "./ChatMarkdown";
import { useEditorInsertion } from "../../../contexts/EditorInsertionContext";
import { ThoughtSection } from "./thought/ThoughtSection";
import { MessageContentRenderer } from "./MessageContentRenderer";
import {
  parseThoughtContent,
  getMessageClass,
  stripContextContent
} from "../utils/messageUtils";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Typography
} from "@mui/material";
import CircularProgress from "@mui/material/CircularProgress";
import useGlobalChatStore from "../../../stores/GlobalChatStore";

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
  toolResultsByCallId?: Record<string, { name?: string | null; content: any }>;
}

export const MessageView: React.FC<
  MessageViewProps & { componentStyles?: any }
> = ({
  message,
  expandedThoughts,
  onToggleThought,
  onInsertCode,
  toolResultsByCallId,
  componentStyles
}) => {
  const insertIntoEditor = useEditorInsertion();
  // Add error class if message has error flag
  const baseClass = getMessageClass(message.role);
  const messageClass = message.error_type
    ? `${baseClass} error-message`
    : baseClass;

  const handleCopy = () => {
    let textToCopy = "";
    if (typeof message.content === "string") {
      textToCopy = message.content;
    } else if (Array.isArray(message.content)) {
      textToCopy = message.content
        .filter((c) => c.type === "text")
        .map((c) => (c as MessageTextContent).text)
        .join("\n");
    }
    return textToCopy;
  };

  const renderTextContent = (content: string, index: number) => {
    const parsedContent = stripContextContent(content);
    const parsedThought = parseThoughtContent(parsedContent);

    if (parsedThought) {
      const key = `thought-${message.id}-${index}`;
      const isExpanded = expandedThoughts[key];

      return (
        <ThoughtSection
          thoughtContent={parsedThought.thoughtContent}
          hasClosingTag={parsedThought.hasClosingTag}
          isExpanded={isExpanded}
          onToggle={() => onToggleThought(key)}
          textBefore={parsedThought.textBeforeThought}
          textAfter={parsedThought.textAfterThought}
        />
      );
    }

    const handler =
      onInsertCode ||
      (insertIntoEditor ? (t: string) => insertIntoEditor(t) : undefined);
    return <ChatMarkdown content={parsedContent} onInsertCode={handler} />;
  };

  const content = message.content as
    | Array<MessageTextContent | MessageImageContent>
    | string;

  // Pretty JSON helper
  const PrettyJson: React.FC<{ value: any }> = ({ value }) => {
    const text = useMemo(() => {
      try {
        if (typeof value === "string") {
          const parsed = JSON.parse(value);
          return JSON.stringify(parsed, null, 2);
        }
        return JSON.stringify(value, null, 2);
      } catch {
        return typeof value === "string" ? value : String(value);
      }
    }, [value]);
    return <pre className="pretty-json">{text}</pre>;
  };

  const ToolCallCard: React.FC<{
    tc: ToolCall;
    result?: { name?: string | null; content: any };
  }> = ({ tc, result }) => {
    const [open, setOpen] = useState(false);
    const runningToolCallId = useGlobalChatStore(
      (s) => s.currentRunningToolCallId
    );
    const runningToolMessage = useGlobalChatStore((s) => s.currentToolMessage);
    const hasArgs =
      (tc as any)?.args && Object.keys((tc as any).args).length > 0;
    const hasDetails = !!(hasArgs || tc.message || result);
    const isRunning = runningToolCallId && tc.id && runningToolCallId === tc.id;
    return (
      <Box
        className="tool-call-card"
        sx={isRunning ? { borderColor: "#42a5f5" } : undefined}
      >
        <Box className="tool-call-header">
          <Chip
            label={tc.name || "Tool"}
            color="default"
            size="small"
            variant="outlined"
            className="tool-chip"
          />
          {(isRunning || tc.message) && (
            <Typography variant="body2" className="tool-message">
              {isRunning ? runningToolMessage || tc.message : tc.message}
            </Typography>
          )}
          {isRunning && <CircularProgress size={16} sx={{ ml: 1 }} />}
          <Box sx={{ flex: 1 }} />
          {hasDetails && (
            <Tooltip title={open ? "Hide details" : "Show details"}>
              <IconButton size="small" onClick={() => setOpen((v) => !v)}>
                <ExpandMoreIcon
                  className={`expand-icon${open ? " expanded" : ""}`}
                />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Collapse in={open} timeout="auto" unmountOnExit>
          {hasArgs && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" className="tool-section-title">
                Arguments
              </Typography>
              <PrettyJson value={(tc as any).args} />
            </Box>
          )}
          {result && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" className="tool-section-title">
                Result
              </Typography>
              <PrettyJson value={result.content} />
            </Box>
          )}
        </Collapse>
      </Box>
    );
  };

  return (
    <li className={messageClass}>
      <div className="message-content">
        {!Array.isArray(message.tool_calls) && (
          <CopyToClipboardButton
            className="copy-button"
            textToCopy={handleCopy()}
            size="small"
            title="Copy to clipboard"
          />
        )}
        {message.role === "assistant" &&
          Array.isArray(message.tool_calls) &&
          (message.tool_calls as ToolCall[]).map((tc, i) => (
            <ToolCallCard
              key={tc.id || i}
              tc={tc}
              result={
                tc.id && toolResultsByCallId
                  ? toolResultsByCallId[String(tc.id)]
                  : undefined
              }
            />
          ))}
        {(message.role === "assistant" || message.role === "user") && (
          <>
            {typeof message.content === "string" &&
              renderTextContent(
                message.content,
                typeof message.id === "string" ? parseInt(message.id) || 0 : 0
              )}
            {Array.isArray(content) &&
              content.map((c: MessageContent, i: number) => (
                <MessageContentRenderer
                  key={i}
                  content={c}
                  renderTextContent={renderTextContent}
                  index={i}
                />
              ))}
          </>
        )}
      </div>
      {message.error_type && <ErrorIcon className="error-icon" />}
    </li>
  );
};
