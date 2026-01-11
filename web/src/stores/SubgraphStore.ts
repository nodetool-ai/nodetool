/**
 * SubgraphStore manages subgraph definitions and navigation state.
 * 
 * Responsibilities:
 * - Registry of subgraph definitions (blueprints)
 * - Navigation stack for hierarchical graph traversal
 * - Viewport caching per graph level
 * - Subgraph CRUD operations
 */

import { create } from "zustand";
import { Viewport } from "@xyflow/react";
import {
  SubgraphDefinition,
  SubgraphNavigationState
} from "../types/subgraph";

/**
 * Root graph identifier
 */
export const ROOT_GRAPH_ID = "root";

export interface SubgraphStoreState {
  // Subgraph definitions registry (keyed by definition ID)
  definitions: Map<string, SubgraphDefinition>;
  
  // Navigation state
  currentGraphId: string;           // "root" or subgraph instance ID
  navigationPath: string[];         // Path from root to current (instance IDs)
  viewportCache: Map<string, Viewport>;
  
  // Definition management
  addDefinition: (definition: SubgraphDefinition) => void;
  removeDefinition: (id: string) => void;
  updateDefinition: (id: string, updates: Partial<SubgraphDefinition>) => void;
  getDefinition: (id: string) => SubgraphDefinition | undefined;
  getAllDefinitions: () => SubgraphDefinition[];
  hasDefinition: (id: string) => boolean;
  
  // Navigation operations
  openSubgraph: (instanceId: string, viewport?: Viewport) => void;
  exitSubgraph: () => void;
  exitToRoot: () => void;
  isAtRoot: () => boolean;
  getCurrentDepth: () => number;
  getNavigationState: () => SubgraphNavigationState;
  
  // Viewport management
  saveViewport: (graphId: string, viewport: Viewport) => void;
  getViewport: (graphId: string) => Viewport | undefined;
  clearViewportCache: () => void;
  
  // Utility
  reset: () => void;
}

/**
 * Create the subgraph store
 */
export const useSubgraphStore = create<SubgraphStoreState>((set, get) => ({
  // Initial state
  definitions: new Map(),
  currentGraphId: ROOT_GRAPH_ID,
  navigationPath: [],
  viewportCache: new Map(),
  
  // Definition management
  addDefinition: (definition: SubgraphDefinition) => {
    set((state) => {
      const newDefinitions = new Map(state.definitions);
      newDefinitions.set(definition.id, definition);
      return { definitions: newDefinitions };
    });
  },
  
  removeDefinition: (id: string) => {
    set((state) => {
      const newDefinitions = new Map(state.definitions);
      newDefinitions.delete(id);
      return { definitions: newDefinitions };
    });
  },
  
  updateDefinition: (id: string, updates: Partial<SubgraphDefinition>) => {
    set((state) => {
      const existing = state.definitions.get(id);
      if (!existing) {
        console.warn(`[SubgraphStore] Cannot update non-existent definition: ${id}`);
        return state;
      }
      
      const updated: SubgraphDefinition = {
        ...existing,
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      const newDefinitions = new Map(state.definitions);
      newDefinitions.set(id, updated);
      return { definitions: newDefinitions };
    });
  },
  
  getDefinition: (id: string) => {
    return get().definitions.get(id);
  },
  
  getAllDefinitions: () => {
    return Array.from(get().definitions.values());
  },
  
  hasDefinition: (id: string) => {
    return get().definitions.has(id);
  },
  
  // Navigation operations
  openSubgraph: (instanceId: string, viewport?: Viewport) => {
    const state = get();
    
    // Save current viewport before navigating
    if (viewport) {
      state.saveViewport(state.currentGraphId, viewport);
    }
    
    // Push to navigation stack
    const newPath = [...state.navigationPath, instanceId];
    
    set({
      currentGraphId: instanceId,
      navigationPath: newPath
    });
    
    console.log(`[SubgraphStore] Opened subgraph: ${instanceId}, depth: ${newPath.length}`);
  },
  
  exitSubgraph: () => {
    const state = get();
    
    if (state.navigationPath.length === 0) {
      console.warn("[SubgraphStore] Already at root, cannot exit");
      return;
    }
    
    // Pop from navigation stack
    const newPath = [...state.navigationPath];
    newPath.pop();
    
    // Determine new current graph
    const newCurrentId = newPath.length > 0 
      ? newPath[newPath.length - 1] 
      : ROOT_GRAPH_ID;
    
    set({
      currentGraphId: newCurrentId,
      navigationPath: newPath
    });
    
    console.log(`[SubgraphStore] Exited to: ${newCurrentId}, depth: ${newPath.length}`);
  },
  
  exitToRoot: () => {
    set({
      currentGraphId: ROOT_GRAPH_ID,
      navigationPath: []
    });
    
    console.log("[SubgraphStore] Exited to root");
  },
  
  isAtRoot: () => {
    return get().currentGraphId === ROOT_GRAPH_ID;
  },
  
  getCurrentDepth: () => {
    return get().navigationPath.length;
  },
  
  getNavigationState: () => {
    const state = get();
    return {
      currentGraphId: state.currentGraphId,
      navigationPath: state.navigationPath,
      viewportCache: state.viewportCache
    };
  },
  
  // Viewport management
  saveViewport: (graphId: string, viewport: Viewport) => {
    set((state) => {
      const newCache = new Map(state.viewportCache);
      newCache.set(graphId, viewport);
      return { viewportCache: newCache };
    });
  },
  
  getViewport: (graphId: string) => {
    return get().viewportCache.get(graphId);
  },
  
  clearViewportCache: () => {
    set({ viewportCache: new Map() });
  },
  
  // Utility
  reset: () => {
    set({
      definitions: new Map(),
      currentGraphId: ROOT_GRAPH_ID,
      navigationPath: [],
      viewportCache: new Map()
    });
  }
}));

/**
 * Selector hooks for common use cases
 */
export const useSubgraphDefinitions = () => 
  useSubgraphStore((state) => state.getAllDefinitions());

export const useCurrentGraphId = () => 
  useSubgraphStore((state) => state.currentGraphId);

export const useNavigationPath = () => 
  useSubgraphStore((state) => state.navigationPath);

export const useIsAtRoot = () => 
  useSubgraphStore((state) => state.isAtRoot());

export const useSubgraphDefinition = (id: string) =>
  useSubgraphStore((state) => state.getDefinition(id));
