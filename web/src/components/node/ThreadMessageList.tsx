/** @jsxImportSource @emotion/react */
import React, { memo, useRef } from "react";

import { Message } from "../../stores/ApiTypes";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { css } from "@emotion/react";
import { isEqual } from "lodash";

const styles = (theme: any) =>
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
      margin: "0.3em 0"
    },
    ".messages li.user": {
      color: theme.palette.c_gray5,
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      padding: "0.1em 0.2em 0",
      margin: "2em 0 1em 0"
    },
    ".messages li.assistant": {
      color: theme.palette.c_white
    },
    ".messages li pre": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      backgroundColor: theme.palette.c_black,
      padding: "1em"
    },
    ".messages li pre code": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_white
    },
    ".messages li a": {
      color: theme.palette.c_hl1
    },
    ".messages li a:hover": {
      color: `${theme.c_gray4} !important`
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
