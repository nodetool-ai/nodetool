/** @jsxImportSource @emotion/react */
import { useTheme } from "@mui/material/styles";
import {
  Button,
  Popover,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from "@mui/material";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import { AssetList } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "@tanstack/react-query";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useState, useRef, useEffect, useMemo, useCallback } from "react";
import dialogStyles from "../../styles/DialogStyles";
import isEqual from "lodash/isEqual";
import { NodeSelect, NodeMenuItem } from "../editor_ui";

const FolderProperty = (props: PropertyProps) => {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const load = useAssetStore((state) => state.load);
  const createFolder = useAssetStore((state) => state.createFolder);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const fetchFolders = async () => {
    return await load({ content_type: "folder" });
  };
  const { data, error, isLoading, refetch } = useQuery<AssetList, Error>({
    queryKey: ["assets", { content_type: "folder" }],
    queryFn: fetchFolders
  });

  // Validate that the selected value exists in the options
  const availableFolderIds = useMemo(
    () => data?.assets.map((folder) => folder.id) || [],
    [data?.assets]
  );

  const selectValue = useMemo(() => {
    const assetId = props.value?.asset_id || "";
    // Only use the asset_id if it exists in the available options
    return availableFolderIds.includes(assetId) ? assetId : "";
  }, [props.value?.asset_id, availableFolderIds]);

  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [folderName, setFolderName] = useState<string>("New Folder");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (anchorEl) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [anchorEl]);

  const handleCreateFolder = useCallback(() => {
    setAnchorEl(null);
    createFolder(selectValue || "", folderName).then(() => {
      addNotification({
        type: "success",
        content: `CREATE FOLDER: ${folderName}`
      });
      refetch();
    });
  }, [createFolder, selectValue, folderName, addNotification, refetch]);

  const handleOpenMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
    },
    []
  );

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleFolderNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFolderName(e.target.value);
    },
    []
  );

  const handleFolderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleCreateFolder();
      }
    },
    [handleCreateFolder]
  );

  const handleFolderSelect = useCallback(
    (
      event:
        | React.ChangeEvent<HTMLInputElement>
        | (Event & { target: { value: unknown; name: string } })
    ) => {
      props.onChange({
        type: "folder",
        asset_id: event.target.value as string
      });
    },
    [props]
  );

  const theme = useTheme();
  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
        <NodeSelect
          id={id}
          labelId={id}
          name=""
          value={selectValue}
          onChange={handleFolderSelect}
        >
          {data?.assets.map((folder) => (
            <NodeMenuItem key={folder.id} value={folder.id}>
              {folder.name}
            </NodeMenuItem>
          ))}
        </NodeSelect>
        <Button
          onClick={handleOpenMenu}
          sx={{
            border: "none",
            padding: "0",
            margin: "0"
          }}
        >
          <CreateNewFolderIcon sx={{ fontSize: "1.2rem" }} />
        </Button>
      </div>
      <Popover
        css={dialogStyles(theme)}
        className="dialog"
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleCloseMenu}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle className="dialog-title" id="alert-dialog-title">
          {"Create Folder"}
        </DialogTitle>
        <DialogContent className="dialog-content">
          <TextField
            className="input-field"
            inputRef={inputRef}
            placeholder="Folder Name"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onKeyDown={handleFolderKeyDown}
            onChange={handleFolderNameChange}
          />
        </DialogContent>
        <DialogActions className="dialog-actions">
          <Button className="button-cancel" onClick={handleCloseMenu}>
            Cancel
          </Button>
          <Button className="button-confirm" onClick={handleCreateFolder}>
            Create Folder
          </Button>
        </DialogActions>
      </Popover>
    </>
  );
};

export default memo(FolderProperty, isEqual);
