import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import { AssetList } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import PropertyLabel from "../node/PropertyLabel";
import { useQuery } from "react-query";
import { PropertyProps } from "../node/PropertyInput";

export function FolderProperty(props: PropertyProps) {
  const id = `folder-${props.property.name}-${props.propertyIndex}`;
  const load = useAssetStore((state) => state.load);
  const fetchFolders = async () => {
    return await load({ content_type: "folder" });
  };
  const { data, error, isLoading } = useQuery<AssetList, Error>(
    ["assets", { content_type: "folder" }],
    fetchFolders
  );
  const selectValue = props.value?.asset_id || "";

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      <Select
        id={id}
        labelId={id}
        name=""
        value={selectValue}
        variant="standard"
        onChange={(e) => props.onChange({ type: "folder", asset_id: e.target.value })}
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
    </>
  );
}
