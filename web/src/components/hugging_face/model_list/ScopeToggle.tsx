import React, { useCallback } from "react";
import { ToggleGroup, ToggleOption, Tooltip } from "../../ui_primitives";
import type { ModelScope } from "../../../stores/ModelManagerStore";

interface ScopeToggleProps {
  scope: ModelScope;
  onChange: (scope: ModelScope) => void;
  /** Display name of the attached worker, or null when none is attached. */
  workerName: string | null;
  /** Whether the attached worker's image supports model management. */
  supported: boolean;
}

const OLD_IMAGE_TOOLTIP =
  "This worker's image is too old for model management. Upgrade the worker image.";

/**
 * Local <-> Worker scope toggle for the ModelManager. Rendered only when a
 * worker is attached; the Worker option is disabled (with an explanatory
 * tooltip) when the worker image predates model-management support.
 */
const ScopeToggleInternal: React.FC<ScopeToggleProps> = ({
  scope,
  onChange,
  workerName,
  supported
}) => {
  const handleChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: ModelScope | null) => {
      if (value) {
        onChange(value);
      }
    },
    [onChange]
  );

  if (!workerName) {
    return null;
  }

  return (
    <ToggleGroup
      value={scope}
      exclusive
      size="small"
      compact
      onChange={handleChange}
      aria-label="model scope"
    >
      <ToggleOption value="local" aria-label="local models">
        Local
      </ToggleOption>
      <Tooltip title={OLD_IMAGE_TOOLTIP} disabled={supported}>
        <span>
          <ToggleOption
            value="worker"
            aria-label={workerName}
            disabled={!supported}
          >
            {workerName}
          </ToggleOption>
        </span>
      </Tooltip>
    </ToggleGroup>
  );
};

export const ScopeToggle = React.memo(ScopeToggleInternal);
ScopeToggle.displayName = "ScopeToggle";
