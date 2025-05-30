/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { pulse } from "./animations";

export const LoadingIndicator: React.FC = () => {
  return (
    <div className="loading-container">
      <div className="loading-dots">
        <div
          className="dot"
          css={css`
            animation: ${pulse} 1.4s infinite ease-in-out;
          `}
        />
      </div>
    </div>
  );
};