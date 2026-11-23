import { memo, useCallback } from "react";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useLocation, useNavigate } from "react-router-dom";
import { useAsset } from "../../serverState/useAsset";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput";
import { Text, ToolbarIconButton } from "../ui_primitives";
import isEqual from "../../utils/isEqual";
import { assetIdOf, assetLocator } from "../../utils/mediaRef";
import { isSpreadsheetAsset, isTextAsset } from "../../utils/assetLanguage";
import PropertyDropzone from "./PropertyDropzone";
import ProjectDocumentSelect, { projectDocumentValue } from "./ProjectDocumentSelect";

const DocumentProperty = (props: PropertyProps) => {
  const id = `document-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ document: props.value });
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const location = useLocation();
  const navigate = useNavigate();
  const assetId = assetIdOf(props.value);
  const documentUri: string | undefined = assetId
    ? assetLocator(assetId)
    : props.value?.uri;

  const handleOpenDocument = useCallback(() => {
    if (!documentUri) {
      return;
    }
    const textAsset =
      asset && (isTextAsset(asset) || isSpreadsheetAsset(asset));
    openTab({
      type: textAsset ? "text" : "document",
      ref: textAsset ? asset.id : documentUri,
      mode: "view",
      title: asset?.name || "Document",
      projectId: asset?.project_id ?? activeProjectId ?? LOOSE_PROJECT_ID
    });
    if (!location.pathname.startsWith("/workspace")) {
      navigate("/workspace");
    }
  }, [
    activeProjectId,
    asset,
    documentUri,
    location.pathname,
    navigate,
    openTab
  ]);

  const showDropzone =
    props.nodeType === "nodetool.constant.Document" ||
    props.nodeType === "nodetool.input.DocumentInput";
  // A save node's target is a project document, picked rather than dropped.
  const showSelect = showDropzone || props.property.name === "target";
  const { onChange } = props;
  const handleSelect = useCallback(
    (value: ReturnType<typeof projectDocumentValue> | null) => {
      onChange(value ?? { type: "document", uri: "", asset_id: null, data: null, metadata: null });
    },
    [onChange]
  );

  return (
    <div className="document-property">
      {!showDropzone && (
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
      )}
      {showSelect && (
        <ProjectDocumentSelect
          id={`${id}-select`}
          assetId={assetId ?? ""}
          onChange={handleSelect}
          allowNone={!showDropzone}
        />
      )}
      {showDropzone ? (
        <PropertyDropzone
          asset={asset}
          uri={uri}
          onChange={props.onChange}
          contentType="document"
          props={props}
        />
      ) : showSelect ? null : (
        <Text>{props.value?.id}</Text>
      )}
      {showSelect && documentUri && (
        <ToolbarIconButton
          onClick={handleOpenDocument}
          className="nodrag nopan"
          size="small"
          ariaLabel="Open document in new tab"
          tooltip="Open document in new tab"
          icon={<OpenInNewIcon />}
        />
      )}
    </div>
  );
};

export default memo(DocumentProperty, isEqual);
