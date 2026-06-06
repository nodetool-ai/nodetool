/**
 * Collapse Component
 *
 * A thin wrapper around MUI Collapse for animation-only use cases where the
 * toggle control lives elsewhere (e.g. a separate button in a custom header).
 *
 * For the common "clickable title header + collapsible body" pattern, prefer
 * `CollapsibleSection`, which bundles the toggle header with the animation.
 */

import React from "react";
import { Collapse as MuiCollapse, CollapseProps as MuiCollapseProps } from "@mui/material";

export type CollapseProps = MuiCollapseProps;

/**
 * Collapse - Expand/collapse animation wrapper
 *
 * @example
 * // Externally controlled toggle, animation only
 * <Collapse in={open} timeout="auto" unmountOnExit>
 *   <DetailContent />
 * </Collapse>
 */
export const Collapse: React.FC<CollapseProps> = (props) => <MuiCollapse {...props} />;
