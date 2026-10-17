/**
 * Visual mapping for `LayerStatus` → StatusIndicator props. Shared between
 * the inspector header and the layers panel badges, and with timeline clips
 * through `GENERATION_STATUS`, so each status means the same everywhere.
 */

import type { LayerStatus } from "@nodetool-ai/image-editor";
import { GENERATION_STATUS } from "../../ui_primitives";

export const LAYER_STATUS_MAP = GENERATION_STATUS satisfies Record<LayerStatus, unknown>;
