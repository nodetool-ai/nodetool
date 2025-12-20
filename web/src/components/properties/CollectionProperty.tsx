import { useQuery } from "@tanstack/react-query";
import { CollectionList } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useMemo } from "react";
import isEqual from "lodash/isEqual";
import { useNodes } from "../../contexts/NodeContext";
import Select from "../inputs/Select";

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

  const options = useMemo(() => {
    return (
      data?.collections.map((collection) => ({
        label: collection.name,
        value: collection.name
      })) || []
    );
  }, [data]);

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
          value={selectValue}
          options={options}
          onChange={(newValue) =>
            props.onChange({ type: "collection", name: newValue })
          }
          placeholder="Select collection..."
          label={props.property.name}
        />
      )}
    </>
  );
};

export default memo(CollectionProperty, isEqual);
