import {
  Select,
  MenuItem,
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
import { memo, useState, useRef, useEffect } from "react";
import dialogStyles from "../../styles/DialogStyles";
import { isEqual } from "lodash";

const FolderProperty = (props: PropertyProps) => {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const load = useAssetStore((state) => state.load);
  const createFolder = useAssetStore((state) => state.createFolder);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const fetchFolders = async () => {
    return await load({ content_type: "folder" });
  };
  const { data, error, isLoading, refetch } = useQuery<AssetList, Error>({
    queryKey: ["assets", { content_type: "folder" }],
    queryFn: fetchFolders
  });
  const selectValue = props.value?.asset_id || "";
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

  const handleCreateFolder = () => {
    setAnchorEl(null);
    createFolder(selectValue || "", folderName).then(() => {
      addNotification({
        type: "success",
        content: `CREATE FOLDER: ${folderName}`
      });
      refetch();
    });
  };

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
        <Select
          id={id}
          labelId={id}
          name=""
          value={selectValue}
          variant="standard"
          onChange={(e) =>
            props.onChange({ type: "folder", asset_id: e.target.value })
          }
          className="mui-select nodrag"
          disableUnderline={true}
          MenuProps={{
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left"
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left"
            }
          }}
        >
          {data?.assets.map((folder) => (
            <MenuItem key={folder.id} value={folder.id}>
              {folder.name}
            </MenuItem>
          ))}
        </Select>
        <Button onClick={(e) => setAnchorEl(e.currentTarget)}>
          <CreateNewFolderIcon />
        </Button>
      </div>
      <Popover
        css={dialogStyles}
        className="dialog"
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
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
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateFolder();
              }
            }}
            onChange={(e) => setFolderName(e.target.value)}
            fullWidth
          />
        </DialogContent>
        <DialogActions className="dialog-actions">
          <Button className="button-cancel" onClick={() => setAnchorEl(null)}>
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
