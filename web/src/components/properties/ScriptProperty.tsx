import { memo, useCallback } from "react";
import isEqual from "../../utils/isEqual";
import { useLocation, useNavigate } from "react-router-dom";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import type { SelectChangeEvent } from "../ui_primitives";

import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useScripts } from "../../hooks/script/useScripts";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { NodeSelect, NodeMenuItem } from "../editor_ui";
import { FlexRow, ToolbarIconButton } from "../ui_primitives";

/**
 * Property editor for the `script` type: pick a persisted script and jump
 * straight into the script editor to edit it.
 */
const ScriptProperty = (props: PropertyProps) => {
  const { property, value, onChange } = props;
  const id = `script-${property.name}-${props.propertyIndex}`;
  const { data, error, isLoading } = useScripts();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedId: string = value?.id || "";
  const selected = data?.find((script) => script.id === selectedId);

  const handleChange = useCallback(
    (e: SelectChangeEvent<unknown>) => {
      onChange({
        type: "script",
        id: String(e.target.value)
      });
    },
    [onChange]
  );

  const handleOpenEditor = useCallback(() => {
    if (!selectedId) {
      return;
    }
    // Scripts live only in the workspace — open a tab there, navigating into
    // the workspace first when we're elsewhere.
    openTab({
      type: "script",
      ref: selectedId,
      mode: "edit",
      title: selected?.name || "Untitled script"
    });
    if (!location.pathname.startsWith("/workspace")) {
      navigate("/workspace");
    }
  }, [selectedId, selected?.name, location.pathname, openTab, navigate]);

  return (
    <>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <FlexRow gap={0.5} align="center" fullWidth>
        <NodeSelect
          id={id}
          labelId={id}
          name=""
          value={selectedId}
          onChange={handleChange}
        >
          {isLoading && <NodeMenuItem disabled>Loading…</NodeMenuItem>}
          {error && <NodeMenuItem disabled>Error: {error.message}</NodeMenuItem>}
          {data?.map((script) => (
            <NodeMenuItem key={script.id} value={script.id}>
              {script.name || "Untitled script"}
            </NodeMenuItem>
          ))}
        </NodeSelect>
        <ToolbarIconButton
          size="small"
          ariaLabel="Open in script editor"
          tooltip="Open in script editor"
          disabled={!selectedId}
          onClick={handleOpenEditor}
          icon={<DescriptionOutlinedIcon fontSize="inherit" />}
        />
      </FlexRow>
    </>
  );
};

export default memo(ScriptProperty, isEqual);
