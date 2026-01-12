/**
 * Blueprint system for saving and loading subgraph definitions
 * 
 * Blueprints are reusable subgraph templates that can be:
 * - Saved to localStorage for local use
 * - Exported as JSON files
 * - Imported from JSON files
 * - Shared between workflows
 */

import { SubgraphDefinition } from "../../../types/subgraph";

// Storage key for blueprints in localStorage
const BLUEPRINTS_STORAGE_KEY = "nodetool_subgraph_blueprints";

export interface SubgraphBlueprint {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  definition: SubgraphDefinition;
  created_at: string;
  updated_at: string;
  author?: string;
  version?: string;
}

/**
 * Get all blueprints from localStorage
 */
export function getAllBlueprints(): SubgraphBlueprint[] {
  try {
    const stored = localStorage.getItem(BLUEPRINTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored);
  } catch (error) {
    console.error("[Blueprints] Failed to load blueprints:", error);
    return [];
  }
}

/**
 * Get a specific blueprint by ID
 */
export function getBlueprint(id: string): SubgraphBlueprint | undefined {
  const blueprints = getAllBlueprints();
  return blueprints.find((bp) => bp.id === id);
}

/**
 * Save a blueprint to localStorage
 */
export function saveBlueprint(blueprint: SubgraphBlueprint): void {
  try {
    const blueprints = getAllBlueprints();
    const existingIndex = blueprints.findIndex((bp) => bp.id === blueprint.id);
    
    if (existingIndex >= 0) {
      // Update existing blueprint
      blueprints[existingIndex] = {
        ...blueprint,
        updated_at: new Date().toISOString()
      };
    } else {
      // Add new blueprint
      blueprints.push({
        ...blueprint,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    localStorage.setItem(BLUEPRINTS_STORAGE_KEY, JSON.stringify(blueprints));
  } catch (error) {
    console.error("[Blueprints] Failed to save blueprint:", error);
    throw new Error("Failed to save blueprint to storage");
  }
}

/**
 * Delete a blueprint from localStorage
 */
export function deleteBlueprint(id: string): void {
  try {
    const blueprints = getAllBlueprints();
    const filtered = blueprints.filter((bp) => bp.id !== id);
    localStorage.setItem(BLUEPRINTS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("[Blueprints] Failed to delete blueprint:", error);
    throw new Error("Failed to delete blueprint from storage");
  }
}

/**
 * Create a blueprint from a subgraph definition
 */
export function createBlueprintFromDefinition(
  definition: SubgraphDefinition,
  metadata: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    author?: string;
  } = {}
): SubgraphBlueprint {
  return {
    id: `blueprint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: metadata.name || definition.name,
    description: metadata.description || definition.description,
    category: metadata.category,
    tags: metadata.tags || [],
    definition: definition,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    author: metadata.author,
    version: "1.0.0"
  };
}

/**
 * Export a blueprint as a JSON file
 */
export function exportBlueprint(blueprint: SubgraphBlueprint): string {
  return JSON.stringify(blueprint, null, 2);
}

/**
 * Import a blueprint from JSON string
 */
export function importBlueprint(json: string): SubgraphBlueprint {
  try {
    const blueprint = JSON.parse(json);
    
    // Validate blueprint structure
    if (!blueprint.definition || !blueprint.definition.id) {
      throw new Error("Invalid blueprint format: missing definition");
    }
    
    // Generate new ID to avoid conflicts
    blueprint.id = `blueprint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    blueprint.definition.id = `subgraph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return blueprint;
  } catch (error) {
    console.error("[Blueprints] Failed to import blueprint:", error);
    throw new Error("Failed to parse blueprint JSON");
  }
}

/**
 * Search blueprints by name, description, or tags
 */
export function searchBlueprints(query: string): SubgraphBlueprint[] {
  const blueprints = getAllBlueprints();
  const lowerQuery = query.toLowerCase();
  
  return blueprints.filter((bp) => {
    const nameMatch = bp.name.toLowerCase().includes(lowerQuery);
    const descMatch = bp.description?.toLowerCase().includes(lowerQuery);
    const tagMatch = bp.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));
    const categoryMatch = bp.category?.toLowerCase().includes(lowerQuery);
    
    return nameMatch || descMatch || tagMatch || categoryMatch;
  });
}

/**
 * Get blueprints by category
 */
export function getBlueprintsByCategory(category: string): SubgraphBlueprint[] {
  const blueprints = getAllBlueprints();
  return blueprints.filter((bp) => bp.category === category);
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  const blueprints = getAllBlueprints();
  const categories = new Set<string>();
  
  blueprints.forEach((bp) => {
    if (bp.category) {
      categories.add(bp.category);
    }
  });
  
  return Array.from(categories).sort();
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const blueprints = getAllBlueprints();
  const tags = new Set<string>();
  
  blueprints.forEach((bp) => {
    bp.tags?.forEach((tag) => tags.add(tag));
  });
  
  return Array.from(tags).sort();
}
