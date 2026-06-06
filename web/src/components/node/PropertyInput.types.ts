import type React from "react";
import type { Property } from "../../stores/ApiTypes";

export type PropertyProps = {
  property: Property;
  value: any;
  nodeType: string;
  nodeId: string;
  hideLabel?: boolean;
  propertyIndex: string;
  isInspector?: boolean;
  onChange: (value: any) => void;
  /**
   * Called when the user finishes changing the value (e.g., on mouseup for sliders).
   * Useful for triggering actions only when the user has committed their change.
   */
  onChangeComplete?: () => void;
  tabIndex?: number;
  isDynamicProperty?: boolean;
  /**
   * Value differs from default — shows visual indicator
   */
  changed?: boolean;
  /** Right-click on the property field (forwarded from text/json editors). */
  onPropertyContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
};
