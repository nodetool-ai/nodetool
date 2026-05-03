import { useQuery } from "@tanstack/react-query";
import { CollectionList } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import { memo, useMemo } from "react";
import isEqual from "fast-deep-equal";
import { useNodes } from "../../contexts/NodeContext";
import Select from "../inputs/Select";
import { useIsConnectedSelector } from "../../hooks/nodes/useIsConnected";
import ConnectedBadge from "./ConnectedBadge";

const CollectionProperty = (props: PropertyProps) => {
  const id = `collection-${props.property.name}-${props.propertyIndex}`;
  const isConnectedSelector = useIsConnectedSelector(
    props.nodeId,
    props.property.name
  );
  const isConnected = useNodes(isConnectedSelector);

  const { data, error, isLoading } = useQuery<CollectionList>({
    queryKey: ["collections"],
    queryFn: async () => {
      return (await trpcClient.collections.list.query()) as unknown as CollectionList;
    }
  });

  const selectValue = props.value?.name || "";

  const options = useMemo(() => {
    return (
      data?.collections.map((collection: { name: string }) => ({
        label: collection.name,
        value: collection.name
      })) || []
    );
  }, [data]);

  if (isConnected) {
    return (
      <div className="connected">
        <PropertyLabel
          name={props.property.name}
          description={props.property.description}
          id={id}
        />
        <ConnectedBadge />
      </div>
    );
  }

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      <Select
        value={selectValue}
        options={options}
        onChange={(newValue) =>
          props.onChange({ type: "collection", name: newValue })
        }
        placeholder="Select collection..."
        label={props.property.name}
      />
    </>
  );
};

export default memo(CollectionProperty, isEqual);
