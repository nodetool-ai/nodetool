/** @jsxImportSource @emotion/react */
import React, { memo, useRef } from "react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { Message } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { isEqual } from "lodash";

const styles = (theme: Theme) =>
  css({
    "&": {
      maxHeight: "500px",
      width: "100%",
      overflow: "auto"
    },
    ".messages": {
      listStyleType: "none",
      padding: "14px"
    },
    ".messages li.chat-message": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      listStyleType: "none"
    },
    ".messages li.chat-message p": {
      margin: "0.3em 0",
      lineHeight: "1.5em",
      fontWeight: "400"
    },
    ".messages li.user": {
      color: theme.vars.palette.grey[200],
      borderBottom: `1px solid ${theme.vars.palette.grey[600]}`,
      padding: "0.1em 0.2em 0",
      margin: "2em 0 1em 0"
    },
    ".messages li.assistant": {
      color: theme.vars.palette.grey[0]
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.vars.palette.grey[1000],
      padding: "1em"
    },
    ".messages li pre code": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[0]
    },
    ".messages li a": {
      color: "var(--palette-primary-main)"
    },
    ".messages li a:hover": {
      color: theme.vars.palette.grey[400]
    }
  });

type ChatViewProps = {
  messages: Array<Message>;
};

const MessageView = (msg: Message) => {
  let messageClass = "chat-message";

  if (msg.role === "user") {
    messageClass += " user";
  } else if (msg.role === "assistant") {
    messageClass += " assistant";
  } else if (msg.role === "tool") {
    messageClass += " tool";
  }
  return (
    <li className={messageClass} key={msg.id}>
      {typeof msg.content === "string" && (
        <MarkdownRenderer key={msg.id} content={msg.content} />
      )}
      {typeof msg.content === "object" &&
        msg.content?.map((c) => {
          if (c.type === "text") {
            return <MarkdownRenderer key={msg.id} content={c.text || ""} />;
          } else if (c.type === "image_url") {
            return <img key={c.image?.uri} src={c.image?.uri} alt="" />;
          } else {
            return <></>;
          }
        })}
    </li>
  );
};

const ThreadMessageList: React.FC<ChatViewProps> = ({ messages }) => {
  const messagesListRef = useRef<HTMLUListElement | null>(null);

  return (
    <div css={styles}>
      <ul className="messages" ref={messagesListRef}>
        {messages.map(MessageView)}
      </ul>
    </div>
  );
};

export default memo(ThreadMessageList, isEqual);
