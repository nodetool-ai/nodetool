import { useMemo } from "react";
import useMetadataStore from "../stores/MetadataStore";
import useRemoteSettingsStore from "../stores/RemoteSettingStore";

/**
 * `createNamespaceTree` is a memoized function that builds a hierarchical grouping of the nodes based on their namespaces.
 *
 * @param path - An array of strings representing the parts of a namespace path.
 * @param ret - The result object in which the grouped structure is built. This object follows the `MetadataGroupedByNamespace` type definition.
 *
 * The function will recursively build the hierarchical grouping of the nodes based on their namespaces.
 *
 * For example, if this function gets called with the following parameters:
 *  - ["nodetool", "image", "generate"]
 *
 *
 * The ret object will be:
 * {
 *  "nodetool": {
 *  children: {
 *   "nodetool.image": {
 *  children: {
 *  "nodetool.image.generate": {
 *  ...
 * }
 *
 * @returns void and modifies the `ret` object in-place to build the hierarchical grouping.
 */
export type NamespaceTree = Record<string, { children: NamespaceTree }>;

const _createNamespaceTree = (path: string[], ret: NamespaceTree): void => {
  if (path.length === 0) return;

  const currentNamespace = path[0];
  if (!ret[currentNamespace]) {
    ret[currentNamespace] = { children: {} };
  }

  _createNamespaceTree(path.slice(1), ret[currentNamespace].children);
};

const sortNamespaceChildren = (tree: NamespaceTree): NamespaceTree => {
  const sortedTree: NamespaceTree = {};
  Object.keys(tree)
    .sort()
    .forEach((key) => {
      sortedTree[key] = {
        children: sortNamespaceChildren(tree[key].children)
      };
    });
  return sortedTree;
};

const useNamespaceTree = (): NamespaceTree => {
  const metadata = useMetadataStore((state) => state.getAllMetadata());
  const secrets = useRemoteSettingsStore((state) => state.secrets);

  const uniqueNamespaces: string[] = useMemo(
    () =>
      metadata
        .map((node) => node.namespace)
        .filter((namespace) => {
          // Filter based on API keys presence
          if (namespace.startsWith("openai.")) {
            return secrets.OPENAI_API_KEY;
          }
          if (namespace.startsWith("anthropic.")) {
            return secrets.ANTHROPIC_API_KEY;
          }
          if (namespace.startsWith("kling.")) {
            return secrets.KLING_ACCESS_KEY && secrets.KLING_SECRET_KEY;
          }
          if (namespace.startsWith("lumaai.")) {
            return secrets.LUMAAI_API_KEY;
          }
          if (namespace.startsWith("replicate.")) {
            return secrets.REPLICATE_API_TOKEN;
          }
          return true; // Show namespaces that don't require API keys
        })
        .filter(
          (value, index, self) => index === self.findIndex((t) => t === value)
        ) ?? [],
    [metadata, secrets]
  );

  const makeNamespaceTree = useMemo(() => {
    const ret: NamespaceTree = {};
    uniqueNamespaces.forEach((namespace) => {
      _createNamespaceTree(namespace.split("."), ret);
    });
    return sortNamespaceChildren(ret);
  }, [uniqueNamespaces]);

  return makeNamespaceTree;
};

export default useNamespaceTree;
