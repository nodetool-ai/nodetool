import { memo, useCallback } from "react";
import isEqual from "fast-deep-equal";
import { useLocation, useNavigate } from "react-router-dom";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import type { SelectChangeEvent } from "@mui/material";

import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useTimelines } from "../../hooks/useTimelineSequence";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { NodeSelect, NodeMenuItem } from "../editor_ui";
import { FlexRow, ToolbarIconButton } from "../ui_primitives";

/**
 * Property editor for the `timeline` type: pick a persisted timeline
 * sequence and jump straight into the timeline editor to edit it.
 */
const TimelineProperty = (props: PropertyProps) => {
  const { property, value, onChange } = props;
  const id = `timeline-${property.name}-${props.propertyIndex}`;
  const { data, error, isLoading } = useTimelines();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const location = useLocation();

  const selectedId: string = value?.id || "";
  const selected = data?.find((timeline) => timeline.id === selectedId);

  const handleChange = useCallback(
    (e: SelectChangeEvent<unknown>) => {
      onChange({
        type: "timeline",
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
        type: "timeline",
        ref: selectedId,
        mode: "edit",
        title: selected?.name || "Untitled video"
      });
    } else {
      navigate(`/timeline/${selectedId}`);
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
          {data?.map((timeline) => (
            <NodeMenuItem key={timeline.id} value={timeline.id}>
              {timeline.name || "Untitled video"}
            </NodeMenuItem>
          ))}
        </NodeSelect>
        <ToolbarIconButton
          size="small"
          ariaLabel="Open in timeline editor"
          tooltip="Open in timeline editor"
          disabled={!selectedId}
          onClick={handleOpenEditor}
          icon={<MovieOutlinedIcon fontSize="inherit" />}
        />
      </FlexRow>
    </>
  );
};

export default memo(TimelineProperty, isEqual);
