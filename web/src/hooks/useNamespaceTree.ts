import { useMetadata } from "../serverState/useMetadata";

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
  const { data, error, isLoading } = useMetadata();
  if (error) {
    throw error;
  }
  if (!data || isLoading) {
    return {};
  }

  const uniqueNamespaces: string[] = data.metadata
    .map((node) => node.namespace)
    .filter(
      (value, index, self) => index === self.findIndex((t) => t === value)
    );

  const ret: NamespaceTree = {};
  uniqueNamespaces.forEach((namespace) => {
    _createNamespaceTree(namespace.split("."), ret);
  });

  return sortNamespaceChildren(ret);
};

export default useNamespaceTree;
