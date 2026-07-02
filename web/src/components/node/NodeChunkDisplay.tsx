import { memo } from "react";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";
import { nodeKey } from "../../stores/nodeKey";
import ChunkDisplay from "./ChunkDisplay";

/**
 * Leaf subscriber for a node's streaming text chunk. Keeps per-token
 * ResultsStore updates from re-rendering the whole BaseNode — only this
 * component re-renders as tokens arrive.
 */
const NodeChunkDisplay: React.FC<{ workflowId: string; nodeId: string }> = ({
  workflowId,
  nodeId
}) => {
  const jobId = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const chunk = useResultsStore((s) =>
    jobId ? (s.chunks[nodeKey(workflowId, jobId, nodeId)] as string | undefined) : undefined
  );
  if (!chunk) {
    return null;
  }
  return <ChunkDisplay chunk={chunk} />;
};

export default memo(NodeChunkDisplay);
