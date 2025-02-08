import { Select } from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import { useQuery } from "@tanstack/react-query";
import { CollectionList } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useMemo } from "react";
import { isEqual } from "lodash";
import { useNodes } from "../../contexts/NodeContext";

const CollectionProperty = (props: PropertyProps) => {
  const id = `collection-${props.property.name}-${props.propertyIndex}`;
  const edges = useNodes((state) => state.edges);
  const isConnected = useMemo(() => {
    return edges.some(
      (edge) =>
        edge.target === props.nodeId &&
        edge.targetHandle === props.property.name
    );
  }, [edges, props.nodeId, props.property.name]);

  const { data, error, isLoading } = useQuery<CollectionList>({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/collections/");
      if (error) {
        throw error;
      }
      return data;
    }
  });

  const selectValue = props.value?.name || "";

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {!isConnected && (
        <Select
          id={id}
          labelId={id}
          name=""
          value={selectValue}
          variant="standard"
          onChange={(e) =>
            props.onChange({ type: "collection", name: e.target.value })
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
          {data?.collections.map((collection) => (
            <MenuItem key={collection.name} value={collection.name}>
              {collection.name}
            </MenuItem>
          ))}
        </Select>
      )}
    </>
  );
};

export default memo(CollectionProperty, isEqual);
