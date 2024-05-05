/** @jsxImportSource @emotion/react */
import { memo, useRef, useEffect } from "react";
import { Typography } from "@mui/material";
import useWorkflowRunnner from "../../stores/WorkflowRunner";

export const NodeLogs = memo(function NodeLogs({ id }: { id: string; }) {
  const logsRef = useRef<HTMLDivElement>(null);
  const logs = useWorkflowRunnner((state) => state.logs)[id];
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <>
      {logs?.length > 0 && (
        <div className="node-logs">
          <Typography variant="h6" component="h6" style={{ marginTop: "1em" }}>
            Logs
          </Typography>
          <div
            ref={logsRef}
            style={{
              fontFamily: "monospaced",
              fontSize: "8px",
              width: "200px",
              height: "100px",
              overflow: "auto",
              backgroundColor: "#000"
            }}
          >
            <pre>{logs}</pre>
          </div>
        </div>
      )}
    </>
  );
});
