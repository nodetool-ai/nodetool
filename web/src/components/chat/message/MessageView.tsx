import React from "react";
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

  return (
    <li className={messageClass}>
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
