"use client";

import dynamic from "next/dynamic";
import type { PreviewNode, PreviewEdge } from "@/lib/workflows/types";

const WorkflowPreviewFlow = dynamic(() => import("./WorkflowPreviewFlow"), { ssr: false });

interface WorkflowFlowClientProps {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  scaleX?: number;
  scaleY?: number;
  interactive?: boolean;
}

export default function WorkflowFlowClient(props: WorkflowFlowClientProps) {
  return <WorkflowPreviewFlow {...props} />;
}
