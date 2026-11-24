import { memo, useCallback, useState } from "react";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useLocation, useNavigate } from "react-router-dom";
import { queryClient } from "../../queryClient";
import { trpcClient } from "../../trpc/client";
import { useAsset } from "../../serverState/useAsset";
import type { Asset } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput";
import { Text, ToolbarIconButton } from "../ui_primitives";
import isEqual from "../../utils/isEqual";
import { assetIdOf, assetLocator } from "../../utils/mediaRef";
import {
  isEditableMarkdownDocument,
  isSpreadsheetAsset,
  isTextAsset
} from "../../utils/assetLanguage";
import PropertyDropzone from "./PropertyDropzone";
import ProjectDocumentSelect, { projectDocumentValue } from "./ProjectDocumentSelect";

const DocumentProperty = (props: PropertyProps) => {
  const id = `document-${props.property.name}-${props.propertyIndex}`;
  const { asset, uri } = useAsset({ document: props.value });
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [converting, setConverting] = useState(false);
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
    const openInTextEditor = asset
      ? isTextAsset(asset) || isSpreadsheetAsset(asset)
      : Boolean(assetId);
    openTab({
      type: openInTextEditor ? "text" : "document",
      ref: openInTextEditor ? (asset?.id ?? assetId!) : documentUri,
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
    assetId,
    documentUri,
    location.pathname,
    navigate,
    openTab
  ]);

  const isDocumentInput = props.nodeType === "nodetool.input.DocumentInput";
  const showDropzone =
    props.nodeType === "nodetool.constant.Document" || isDocumentInput;
  // A save node's target is a project document, picked rather than dropped.
  const showSelect = showDropzone || props.property.name === "target";
  const { onChange } = props;
  const handleSelect = useCallback(
    (value: ReturnType<typeof projectDocumentValue> | null) => {
      onChange(value ?? { type: "document", uri: "", asset_id: null, data: null, metadata: null });
    },
    [onChange]
  );

  // DocumentInput accepts Markdown directly and converts .txt/.html/.docx/.pdf
  // uploads or dropped assets into editable Markdown project documents.
  const handleDocumentAssetSelected = useCallback(
    async (next: Asset) => {
      if (isEditableMarkdownDocument(next.content_type, next.name)) {
        onChange(projectDocumentValue(next.id));
        return;
      }
      setConverting(true);
      try {
        const imported = await trpcClient.textDocuments.import.mutate({
          asset_id: next.id
        });
        void queryClient.invalidateQueries({ queryKey: [["documents"]] });
        void queryClient.invalidateQueries({ queryKey: ["assets"] });
        onChange(projectDocumentValue(imported.asset_id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addNotification({
          type: "error",
          alert: true,
          content: `Could not convert document to Markdown: ${message}`
        });
      } finally {
        setConverting(false);
      }
    },
    [addNotification, onChange]
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
          acceptImportableDocuments={isDocumentInput}
          onAssetSelected={
            isDocumentInput ? handleDocumentAssetSelected : undefined
          }
          busy={converting}
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
