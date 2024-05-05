/** @jsxImportSource @emotion/react */
import { memo, useEffect, useState } from "react";
import { Box } from "@mui/material";

export const ProcessTimer = memo(function ProcessTimer({
  isLoading,
  status
}: {
  isLoading: boolean;
  status: string;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let startTime: number | null = null;

    if (isLoading) {
      startTime = Date.now();
      interval = setInterval(() => {
        const currentTime = Date.now();
        const diffInSeconds = Math.floor(
          (currentTime - (startTime as number)) / 1000
        );
        setSeconds(diffInSeconds);
      }, 1000);
    } else if (!isLoading && interval) {
      clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  return (
    <div className={`process-timer ${isLoading ? "loading" : ""}`}>
      {status === "starting" && <Box sx={{ color: "yellow" }}>starting...</Box>}
      {status === "processing" && (
        <Box sx={{ color: "white" }}>processing...</Box>
      )}
      {status === "failed" && <Box sx={{ color: "red" }}>failed</Box>}
      {status === "completed" && <Box sx={{ color: "green" }}>●</Box>}
      <Box
        // sx={{ color: "white" }}
        style={{ color: "white", marginTop: ".5em", paddingLeft: "1em" }}
      >
        {seconds}s
      </Box>
    </div>
  );
});
