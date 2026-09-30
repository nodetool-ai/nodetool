import useMetadataStore from "../../stores/MetadataStore";

/**
 * Whether the node keeps its static list items on `propertyName` when an edge
 * feeds it. The node then receives the connected items followed by the static
 * ones, so the property stays editable while connected.
 */
export const useAppendsStaticInput = (
  nodeType: string,
  propertyName: string
): boolean =>
  useMetadataStore(
    (state) =>
      state.getMetadata(nodeType)?.append_static_inputs?.includes(
        propertyName
      ) ?? false
  );
