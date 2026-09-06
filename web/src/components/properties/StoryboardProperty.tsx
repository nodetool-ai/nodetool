import { memo } from "react";
import ViewCarouselOutlinedIcon from "@mui/icons-material/ViewCarouselOutlined";
import type { StoryboardRef } from "@nodetool-ai/protocol";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useStoryboards } from "../../hooks/storyboard/useStoryboards";
import DocumentPickerProperty from "./DocumentPickerProperty";

/**
 * A picked board is the template a graph reads, never a row it writes: the ref
 * carries no `writable` flag, so the render nodes refuse to touch it unless the
 * graph opts in explicitly.
 */
const PICKED_REF_FIELDS: Pick<StoryboardRef, "data"> = { data: null };

/** Property editor for the `storyboard` type. Boards live in the workspace. */
const StoryboardProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="storyboard"
    useDocuments={useStoryboards}
    untitledLabel="Untitled storyboard"
    openEditorLabel="Open in storyboard editor"
    icon={<ViewCarouselOutlinedIcon fontSize="inherit" />}
    extraRefFields={PICKED_REF_FIELDS}
  />
);

export default memo(StoryboardProperty, isEqual);
