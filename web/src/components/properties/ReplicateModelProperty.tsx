import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import { Property } from "../../stores/ApiTypes";
import { useReplicateModel, parseModelVersion, formatModelVersion } from "../../hooks/useReplicateModels";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import ModelSelectButton from "./shared/ModelSelectButton";
import ReplicateModelBrowser from "../replicate/ReplicateModelBrowser";

interface ReplicateModelPropertyProps {
  property: Property;
  onChange: (value: any) => void;
  value: any;
}

/**
 * Property component for selecting Replicate models
 */
const ReplicateModelProperty: React.FC<ReplicateModelPropertyProps> = ({
  property: _property,
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  // Parse the current value to get owner/name/version
  const parsedValue = useMemo(() => {
    if (!value || typeof value !== "string") {
      return null;
    }
    try {
      return parseModelVersion(value);
    } catch {
      return null;
    }
  }, [value]);

  // Fetch model details if we have a value
  const { data: modelDetails } = useReplicateModel(
    parsedValue?.owner || "",
    parsedValue?.name || "",
    !!parsedValue
  );

  // Get display info
  const displayInfo = useMemo(() => {
    if (modelDetails) {
      return {
        label: modelDetails.name,
        secondaryLabel: modelDetails.owner,
        description: modelDetails.description
      };
    }

    if (parsedValue) {
      return {
        label: parsedValue.name,
        secondaryLabel: parsedValue.owner,
        description: undefined
      };
    }

    return {
      label: "Select Replicate Model",
      secondaryLabel: undefined,
      description: undefined
    };
  }, [modelDetails, parsedValue]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleModelSelect = useCallback(
    (owner: string, name: string, version?: string) => {
      const modelValue = formatModelVersion(owner, name, version);
      onChange(modelValue);

      // Add to recent models
      addRecent({
        provider: "replicate",
        id: `${owner}/${name}`,
        name: name
      });

      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        className="replicate-model-button"
        active={!!value}
        label={displayInfo.label}
        secondaryLabel={displayInfo.secondaryLabel}
        subLabel="Select Replicate Model"
        tooltipTitle={
          displayInfo.description ? (
            <div style={{ textAlign: "center", maxWidth: 300 }}>
              <div>{displayInfo.label}</div>
              {displayInfo.secondaryLabel && (
                <div style={{ fontSize: "0.85em", opacity: 0.8 }}>
                  {displayInfo.secondaryLabel}
                </div>
              )}
              <div style={{ fontSize: "0.85em", marginTop: 4 }}>
                {displayInfo.description}
              </div>
            </div>
          ) : undefined
        }
        onClick={handleClick}
      />
      <ReplicateModelBrowser
        open={dialogOpen}
        onClose={handleClose}
        onModelSelect={handleModelSelect}
        initialValue={value}
      />
    </>
  );
};

export default React.memo(ReplicateModelProperty, isEqual);
