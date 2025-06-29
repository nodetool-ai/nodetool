import React, { useState } from "react";
import {
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent
} from "../../../stores/ApiTypes";
import ChatMarkdown from "./ChatMarkdown";
import { ThoughtSection } from "./thought/ThoughtSection";
import { MessageContentRenderer } from "./MessageContentRenderer";
import { parseThoughtContent, getMessageClass } from "../utils/messageUtils";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";

interface MessageViewProps {
  message: Message;
  expandedThoughts: { [key: string]: boolean };
  onToggleThought: (key: string) => void;
}

export const MessageView: React.FC<MessageViewProps> = ({
  message,
  expandedThoughts,
  onToggleThought
}) => {
  const messageClass = getMessageClass(message.role);
  const [isHovered, setIsHovered] = useState(false);

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

    return <ChatMarkdown content={content} />;
  };

  const content = message.content as
    | Array<MessageTextContent | MessageImageContent>
    | string;

  const copyButtonStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 1
  };

  let showCopyButton = false;

  if (message.role === "user") {
    copyButtonStyle.bottom = ".5em";
    copyButtonStyle.right = "0.5em";
    showCopyButton = isHovered;
  } else if (message.role === "assistant") {
    copyButtonStyle.bottom = "-15px";
    copyButtonStyle.left = "-5px";
    showCopyButton = true;
  }

  return (
    <li
      className={messageClass}
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showCopyButton && (
        <CopyToClipboardButton
          textToCopy={handleCopy()}
          size="small"
          style={copyButtonStyle}
          title="Copy to clipboard"
        />
      )}
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
    </li>
  );
};
