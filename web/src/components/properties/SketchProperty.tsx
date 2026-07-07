import { memo, useCallback } from "react";
import isEqual from "fast-deep-equal";
import { useLocation, useNavigate } from "react-router-dom";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import type { SelectChangeEvent } from "../ui_primitives";

import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { trpc } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { NodeSelect, NodeMenuItem } from "../editor_ui";
import { FlexRow, ToolbarIconButton } from "../ui_primitives";

/**
 * Property editor for the `sketch` type: pick a persisted sketch document
 * and jump straight into the sketch editor to edit it.
 */
const SketchProperty = (props: PropertyProps) => {
  const { property, value, onChange } = props;
  const id = `sketch-${property.name}-${props.propertyIndex}`;
  const { data, error, isLoading } = trpc.sketch.list.useQuery(
    {},
    { staleTime: 30_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedId: string = value?.id || "";
  const selected = data?.find((sketch) => sketch.id === selectedId);

  const handleChange = useCallback(
    (e: SelectChangeEvent<unknown>) => {
      onChange({
        type: "sketch",
        id: String(e.target.value)
      });
    },
    [onChange]
  );

  const handleOpenEditor = useCallback(() => {
    if (!selectedId) {
      return;
    }
    if (location.pathname.startsWith("/workspace")) {
      openTab({
        type: "sketch",
        ref: selectedId,
        mode: "edit",
        title: selected?.name || "Untitled sketch"
      });
    } else {
      navigate(`/sketch/${selectedId}`);
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
          {data?.map((sketch) => (
            <NodeMenuItem key={sketch.id} value={sketch.id}>
              {sketch.name || "Untitled sketch"}
            </NodeMenuItem>
          ))}
        </NodeSelect>
        <ToolbarIconButton
          size="small"
          ariaLabel="Open in sketch editor"
          tooltip="Open in sketch editor"
          disabled={!selectedId}
          onClick={handleOpenEditor}
          icon={<BrushOutlinedIcon fontSize="inherit" />}
        />
      </FlexRow>
    </>
  );
};

export default memo(SketchProperty, isEqual);
