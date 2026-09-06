import { memo } from "react";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";

import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput.types";
import { trpc } from "../../trpc/client";
import DocumentPickerProperty from "./DocumentPickerProperty";

const useSketches = () => trpc.sketch.list.useQuery({}, { staleTime: 30_000 });

/** Property editor for the `sketch` type. */
const SketchProperty = (props: PropertyProps) => (
  <DocumentPickerProperty
    {...props}
    documentType="sketch"
    useDocuments={useSketches}
    untitledLabel="Untitled sketch"
    openEditorLabel="Open in sketch editor"
    icon={<BrushOutlinedIcon fontSize="inherit" />}
    standaloneRoute={(id) => `/sketch/${id}`}
  />
);

export default memo(SketchProperty, isEqual);
