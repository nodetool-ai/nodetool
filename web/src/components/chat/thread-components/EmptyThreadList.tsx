import React from "react";

export const EmptyThreadList: React.FC = () => {
  return (
    <li
      style={{
        padding: "2em",
        textAlign: "center",
        color: "#666",
        fontSize: "0.9em"
      }}
    >
      No conversations yet. Click &ldquo;New Chat&rdquo; to start.
    </li>
  );
};