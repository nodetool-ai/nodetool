import React from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent
} from "../../../stores/ApiTypes";
import ChatMarkdown from "./ChatMarkdown";
import { useEditorInsertion } from "../../../contexts/EditorInsertionContext";
import { ThoughtSection } from "./thought/ThoughtSection";
import { MessageContentRenderer } from "./MessageContentRenderer";
import { parseThoughtContent, getMessageClass } from "../utils/messageUtils";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
import ErrorIcon from "@mui/icons-material/Error";

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
  onInsertCode?: (text: string, language?: string) => void;
}

export const MessageView: React.FC<MessageViewProps> = ({
  message,
  expandedThoughts,
  onToggleThought,
  onInsertCode
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

  const renderContent = (content: string, index: number) => {
    const parsedThought = parseThoughtContent(content);

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
    return <ChatMarkdown content={content} onInsertCode={handler} />;
  };

  const content = message.content as
    | Array<MessageTextContent | MessageImageContent>
    | string;

  // Copy button is positioned via CSS in ChatThreadView.styles

  return (
    <li
      className={messageClass}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: "8px"
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          wordBreak: "break-word",
          overflowWrap: "anywhere"
        }}
      >
        <CopyToClipboardButton
          className="copy-button"
          textToCopy={handleCopy()}
          size="small"
          title="Copy to clipboard"
        />
        {typeof message.content === "string" &&
          renderContent(
            message.content,
            typeof message.id === "string" ? parseInt(message.id) || 0 : 0
          )}
        {Array.isArray(content) &&
          content.map((c: MessageContent, i: number) => (
            <MessageContentRenderer
              key={i}
              content={c}
              renderTextContent={renderContent}
              index={i}
            />
          ))}
      </div>
      {message.error_type && (
        <ErrorIcon
          sx={{
            color: "error.main",
            fontSize: 20,
            mt: 0.5,
            flexShrink: 0
          }}
        />
      )}
    </li>
  );
};
