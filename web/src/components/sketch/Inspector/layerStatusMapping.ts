/**
 * Visual mapping for `LayerStatus` → StatusIndicator props. Shared between
 * the inspector header and the layers panel badges so the meaning of each
 * status stays consistent across the editor.
 */

import type { LayerStatus } from "@nodetool-ai/image-editor";
import type { StatusType } from "../../ui_primitives";

export interface LayerStatusVisual {
  status: StatusType;
  label: string;
  pulse: boolean;
}

export const LAYER_STATUS_MAP: Record<LayerStatus, LayerStatusVisual> = {
  draft: { status: "default", label: "Draft", pulse: false },
  queued: { status: "pending", label: "Queued", pulse: false },
  generating: { status: "pending", label: "Generating", pulse: true },
  generated: { status: "success", label: "Generated", pulse: false },
  stale: { status: "warning", label: "Stale", pulse: false },
  failed: { status: "error", label: "Failed", pulse: false },
  locked: { status: "info", label: "Locked", pulse: false },
  missing: { status: "error", label: "Missing", pulse: false }
};
