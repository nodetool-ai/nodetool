/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, memo } from "react";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import { StateIconButton, MOTION } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

export interface DefaultModelPinProps {
  /**
   * Modality key the default is stored under, e.g. "language_model".
   * When omitted (pickers without a default modality, like raw HF browsing),
   * the pin renders nothing.
   */
  modelType?: string;
  provider?: string;
  id?: string;
  name?: string;
  size?: "small" | "medium";
}

// Hidden until the row is hovered (see ModelList's `.default-pin` hover rule),
// except when this model is the active default — then it stays visible.
const wrapperStyles = css({
  display: "inline-flex",
  alignItems: "center",
  transition: MOTION.all,
  opacity: 0
});

const DefaultModelPin: React.FC<DefaultModelPinProps> = memo(
  function DefaultModelPin({
    modelType,
    provider = "",
    id = "",
    name = "",
    size = "small"
  }) {
    const current = useModelPreferencesStore((s) =>
      modelType ? s.defaults[modelType] : undefined
    );
    const setDefault = useModelPreferencesStore((s) => s.setDefault);
    const clearDefault = useModelPreferencesStore((s) => s.clearDefault);

    const isDefault =
      !!current && current.provider === provider && current.id === id;

    const handleToggle = useCallback(() => {
      if (!modelType) {
        return;
      }
      if (isDefault) {
        clearDefault(modelType);
      } else {
        setDefault(modelType, { provider, id, name });
      }
    }, [modelType, isDefault, clearDefault, setDefault, provider, id, name]);

    if (!modelType) {
      return null;
    }

    return (
      <span
        className="default-pin"
        css={wrapperStyles}
        style={{ opacity: isDefault ? 1 : undefined }}
      >
        <StateIconButton
          icon={<PushPinOutlinedIcon fontSize="small" />}
          activeIcon={<PushPinIcon fontSize="small" />}
          isActive={isDefault}
          onClick={handleToggle}
          color="primary"
          size={size}
          tooltip={
            isDefault
              ? "Default for new nodes of this type — click to clear"
              : "Set as default for new nodes of this type"
          }
          tooltipPlacement="top"
          ariaLabel={
            isDefault ? "Clear default model" : "Set as default model"
          }
        />
      </span>
    );
  }
);

DefaultModelPin.displayName = "DefaultModelPin";

export default DefaultModelPin;
