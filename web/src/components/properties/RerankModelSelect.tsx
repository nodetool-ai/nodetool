import React from "react";
import isEqual from "../../utils/isEqual";
import RerankModelMenuDialog from "../model_menu/RerankModelMenuDialog";
import { useRerankModelsByProvider } from "../../hooks/useRerankModels";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";

interface RerankModelSelection {
  type: "rerank_model";
  id: string;
  name: string;
  provider: string;
}

interface RerankModelSelectProps {
  onChange: (value: RerankModelSelection) => void;
  value: string;
  provider?: string;
}

const RerankModelSelect: React.FC<RerankModelSelectProps> = ({
  onChange,
  value,
  provider
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("rerank_model", onChange);

  const { models } = useRerankModelsByProvider();

  const selected = React.useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find(
      (m) => m.id === value && (!provider || m.provider === provider)
    );
  }, [models, value, provider]);

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={selected?.name || value || "Select Model"}
        secondaryLabel={selected?.provider}
        subLabel="Select Rerank Model"
        onClick={handleClick}
      />
      <RerankModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleSelect}
      />
    </>
  );
};

export default React.memo(RerankModelSelect, isEqual);
