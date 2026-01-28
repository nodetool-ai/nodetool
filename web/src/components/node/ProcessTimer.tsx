/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useState } from "react";
import { Box } from "@mui/material";
import isEqual from "lodash/isEqual";

export const ProcessTimer = ({ status }: { status: string }) => {
  const [seconds, setSeconds] = useState("");

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let startTime: number | null = null;

    if (status === "running") {
      startTime = Date.now();
      interval = setInterval(() => {
        const currentTime = Date.now();
        const diffInSeconds = (currentTime - (startTime as number)) / 1000;
        // format the seconds to 1 decimal place
        setSeconds(diffInSeconds.toFixed(1) + "s");
      }, 100);
    } else if (status === "completed" || status === "failed") {
      if (interval) {clearInterval(interval);}
    }

    return () => {
      if (interval) {clearInterval(interval);}
    };
  }, [status]);

  return (
    <div
      className="process-timer"
      css={css({
        pointerEvents: "none",
        fontSize: "9px",
        fontFamily: "var(--fontFamily2)",
        lineHeight: "1em",
        width: "fit-content",
        textAlign: "center",
        color: "var(--palette-grey-500)",
        margin: "auto",
        padding: "2px 4px",
        transition: "opacity 1s 1s"
      })}
    >
      {status === "starting" && (
        <Box sx={{ color: "yellow" }}>{seconds} starting...</Box>
      )}
      {status === "booting" && (
        <Box sx={{ color: "yellow" }}>{seconds} starting...</Box>
      )}
      {status === "running" && (
        <Box sx={{ color: "white" }}>{seconds} running...</Box>
      )}
      {status === "failed" && <Box sx={{ color: "red" }}>failed</Box>}
      {status === "completed" && (
        <Box sx={{ color: "white" }}>completed in {seconds}</Box>
      )}
    </div>
  );
};

export default memo(ProcessTimer, isEqual);
