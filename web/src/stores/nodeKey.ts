/** A run-scoped node key: `${workflowId}:${jobId}:${nodeId}`. Build only via nodeKey(). */
export type NodeKey = string & { readonly __brand: "NodeKey" };
/** A run-scoped edge key: `${workflowId}:${jobId}:${edgeId}`. Build only via edgeKey(). */
export type EdgeKey = string & { readonly __brand: "EdgeKey" };
export const nodeKey = (
  workflowId: string,
  jobId: string,
  nodeId: string
): NodeKey => `${workflowId}:${jobId}:${nodeId}` as NodeKey;
export const edgeKey = (
  workflowId: string,
  jobId: string,
  edgeId: string
): EdgeKey => `${workflowId}:${jobId}:${edgeId}` as EdgeKey;
