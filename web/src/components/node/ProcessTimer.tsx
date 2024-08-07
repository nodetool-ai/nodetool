import React, { memo, useEffect, useState } from "react";
import { Box } from "@mui/material";

export const ProcessTimer = memo(function ProcessTimer({
  status
}: {
  status: string;
}) {
  const [seconds, setSeconds] = useState("");

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let startTime: number | null = null;

    if (status === "running") {
      startTime = Date.now();
      interval = setInterval(() => {
        const currentTime = Date.now();
        const diffInSeconds = ((currentTime - (startTime as number))) / 1000;
        // format the seconds to 1 decimal place
        setSeconds(diffInSeconds.toFixed(1) + "s");
      }, 100);
    } else if (status === "completed" || status === "failed") {
      if (interval)
        clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  return (
    <div className={"process-timer"}>
      {status === "starting" && <Box sx={{ color: "yellow" }}>{seconds} starting...</Box>}
      {status === "booting" && <Box sx={{ color: "yellow" }}>{seconds} starting...</Box>}
      {status === "running" && <Box sx={{ color: "white" }}>{seconds} running...</Box>}
      {status === "failed" && <Box sx={{ color: "red" }}>failed</Box>}
      {status === "completed" && <Box sx={{ color: "green" }}>{seconds} ●</Box>}
    </div>
  );
});