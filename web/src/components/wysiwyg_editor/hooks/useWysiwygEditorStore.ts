/**
 * WYSIWYG Editor Store
 *
 * Zustand store for managing the editor state including the schema,
 * selection, and undo/redo history.
 */

import { create } from "zustand";
import { temporal } from "zundo";
import type { UISchema, UISchemaNode, MuiComponentType } from "../types";
import {
  createEmptySchema,
  createNode,
  findNodeById,
  addChildNode,
  removeNode,
  updateNodeProps,
  moveNode,
  reorderChildren,
  cloneNode,
  validateNodeCount,
} from "../utils/schemaUtils";

/**
 * Editor state interface
 */
interface WysiwygEditorState {
  // Schema
  schema: UISchema;

  // Selection
  selectedNodeId: string | null;
  hoveredNodeId: string | null;

  // UI State
  isDragging: boolean;
  isEditing: boolean;
  expandedNodeIds: Set<string>;

  // Actions
  setSchema: (schema: UISchema) => void;
  resetSchema: () => void;

  // Selection actions
  selectNode: (nodeId: string | null) => void;
  setHoveredNode: (nodeId: string | null) => void;

  // Node CRUD actions
  addNode: (parentId: string, type: MuiComponentType, index?: number) => string | null;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => string | null;
  updateNode: (nodeId: string, props: Record<string, unknown>) => void;

  // Tree manipulation
  moveNodeTo: (nodeId: string, newParentId: string, index?: number) => void;
  reorderNode: (parentId: string, fromIndex: number, toIndex: number) => void;

  // UI actions
  setDragging: (isDragging: boolean) => void;
  setEditing: (isEditing: boolean) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  expandNode: (nodeId: string) => void;
  collapseNode: (nodeId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Helpers
  getSelectedNode: () => UISchemaNode | null;
  getNode: (nodeId: string) => UISchemaNode | null;
}

/**
 * Maximum nodes allowed in the schema
 */
const MAX_NODES = 200;

/**
 * Create the editor store with undo/redo support
 */
export const useWysiwygEditorStore = create<WysiwygEditorState>()(
  temporal(
    (set, get) => ({
      // Initial state
      schema: createEmptySchema(),
      selectedNodeId: null,
      hoveredNodeId: null,
      isDragging: false,
      isEditing: false,
      expandedNodeIds: new Set([]),

      // Schema actions
      setSchema: (schema) => set({ schema }),

      resetSchema: () =>
        set({
          schema: createEmptySchema(),
          selectedNodeId: null,
          hoveredNodeId: null,
          expandedNodeIds: new Set([]),
        }),

      // Selection actions
      selectNode: (nodeId) =>
        set({
          selectedNodeId: nodeId,
          isEditing: false,
        }),

      setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),

      // Node CRUD actions
      addNode: (parentId, type, index) => {
        const { schema } = get();

        // Check max nodes
        if (!validateNodeCount(schema.root, MAX_NODES - 1)) {
          console.warn(`Cannot add node: maximum of ${MAX_NODES} nodes reached`);
          return null;
        }

        const newNode = createNode(type);
        const newRoot = addChildNode(schema.root, parentId, newNode, index);

        // If nothing changed (validation failed), return null
        if (newRoot === schema.root) {
          return null;
        }

        set({
          schema: { ...schema, root: newRoot },
          selectedNodeId: newNode.id,
        });

        // Auto-expand parent
        const { expandedNodeIds } = get();
        if (!expandedNodeIds.has(parentId)) {
          set({ expandedNodeIds: new Set([...expandedNodeIds, parentId]) });
        }

        return newNode.id;
      },

      deleteNode: (nodeId) => {
        const { schema, selectedNodeId } = get();

        // Cannot delete root
        if (nodeId === schema.root.id) {
          console.warn("Cannot delete root node");
          return;
        }

        const newRoot = removeNode(schema.root, nodeId);
        if (newRoot) {
          set({
            schema: { ...schema, root: newRoot },
            selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId,
          });
        }
      },

      duplicateNode: (nodeId) => {
        const { schema } = get();
        const node = findNodeById(schema.root, nodeId);

        if (!node) {
          return null;
        }

        // Cannot duplicate root
        if (nodeId === schema.root.id) {
          console.warn("Cannot duplicate root node");
          return null;
        }

        // Find parent to add duplicate
        const findParent = (root: UISchemaNode, id: string): UISchemaNode | null => {
          if (root.children?.some((c) => c.id === id)) {
            return root;
          }
          if (root.children) {
            for (const child of root.children) {
              const found = findParent(child, id);
              if (found) {
                return found;
              }
            }
          }
          return null;
        };

        const parent = findParent(schema.root, nodeId);
        if (!parent) {
          return null;
        }

        // Check max nodes
        const cloned = cloneNode(node);
        if (!validateNodeCount(schema.root, MAX_NODES - 1)) {
          console.warn(`Cannot duplicate: maximum of ${MAX_NODES} nodes would be exceeded`);
          return null;
        }

        // Find index and insert after
        const index = parent.children?.findIndex((c) => c.id === nodeId) ?? -1;
        const newRoot = addChildNode(schema.root, parent.id, cloned, index + 1);

        set({
          schema: { ...schema, root: newRoot },
          selectedNodeId: cloned.id,
        });

        return cloned.id;
      },

      updateNode: (nodeId, props) => {
        const { schema } = get();
        const newRoot = updateNodeProps(schema.root, nodeId, props);
        set({ schema: { ...schema, root: newRoot } });
      },

      // Tree manipulation
      moveNodeTo: (nodeId, newParentId, index) => {
        const { schema } = get();

        // Cannot move root
        if (nodeId === schema.root.id) {
          console.warn("Cannot move root node");
          return;
        }

        // Cannot move to itself or its descendants
        const isDescendant = (parentId: string, childId: string): boolean => {
          const parent = findNodeById(schema.root, parentId);
          if (!parent || !parent.children) {
            return false;
          }
          for (const child of parent.children) {
            if (child.id === childId || isDescendant(child.id, childId)) {
              return true;
            }
          }
          return false;
        };

        if (nodeId === newParentId || isDescendant(nodeId, newParentId)) {
          console.warn("Cannot move node to itself or its descendant");
          return;
        }

        const newRoot = moveNode(schema.root, nodeId, newParentId, index);
        set({ schema: { ...schema, root: newRoot } });
      },

      reorderNode: (parentId, fromIndex, toIndex) => {
        const { schema } = get();
        const newRoot = reorderChildren(schema.root, parentId, fromIndex, toIndex);
        set({ schema: { ...schema, root: newRoot } });
      },

      // UI actions
      setDragging: (isDragging) => set({ isDragging }),
      setEditing: (isEditing) => set({ isEditing }),

      toggleNodeExpanded: (nodeId) => {
        const { expandedNodeIds } = get();
        const newSet = new Set(expandedNodeIds);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        set({ expandedNodeIds: newSet });
      },

      expandNode: (nodeId) => {
        const { expandedNodeIds } = get();
        if (!expandedNodeIds.has(nodeId)) {
          set({ expandedNodeIds: new Set([...expandedNodeIds, nodeId]) });
        }
      },

      collapseNode: (nodeId) => {
        const { expandedNodeIds } = get();
        if (expandedNodeIds.has(nodeId)) {
          const newSet = new Set(expandedNodeIds);
          newSet.delete(nodeId);
          set({ expandedNodeIds: newSet });
        }
      },

      expandAll: () => {
        const { schema } = get();
        const collectIds = (node: UISchemaNode): string[] => {
          const ids = [node.id];
          if (node.children) {
            for (const child of node.children) {
              ids.push(...collectIds(child));
            }
          }
          return ids;
        };
        set({ expandedNodeIds: new Set(collectIds(schema.root)) });
      },

      collapseAll: () => {
        set({ expandedNodeIds: new Set() });
      },

      // Helpers
      getSelectedNode: () => {
        const { schema, selectedNodeId } = get();
        if (!selectedNodeId) {
          return null;
        }
        return findNodeById(schema.root, selectedNodeId);
      },

      getNode: (nodeId) => {
        const { schema } = get();
        return findNodeById(schema.root, nodeId);
      },
    }),
    {
      // Undo/redo configuration
      partialize: (state) => ({
        schema: state.schema,
      }),
      limit: 50,
    }
  )
);

/**
 * Hook to access undo/redo functionality
 */
export const useWysiwygHistory = () => {
  const { undo, redo, pastStates, futureStates } = useWysiwygEditorStore.temporal.getState();

  return {
    undo,
    redo,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
  };
};
