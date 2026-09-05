import { memo } from "react";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useTimelines } from "../../hooks/useTimelineSequence";
import DocumentPickerProperty from "./DocumentPickerProperty";

/** Property editor for the `timeline` type. */
const TimelineProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="timeline"
    useDocuments={useTimelines}
    untitledLabel="Untitled video"
    openEditorLabel="Open in timeline editor"
    icon={<MovieOutlinedIcon fontSize="inherit" />}
    standaloneRoute={(id) => `/timeline/${id}`}
  />
);

export default memo(TimelineProperty, isEqual);
