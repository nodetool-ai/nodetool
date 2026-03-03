/**
 * Types for the Memory Management API
 * 
 * These types match the backend Pydantic models in nodetool-core/src/nodetool/types/memory.py
 */

export interface MemoryStats {
  /** Process RAM usage in MB */
  ram_mb: number;
  /** Total system RAM in MB */
  ram_total_mb?: number;
  /** GPU memory allocated in MB (null if no GPU) */
  gpu_allocated_mb?: number;
  /** GPU memory reserved in MB (null if no GPU) */
  gpu_reserved_mb?: number;
  /** GPU total memory in MB (null if no GPU) */
  gpu_total_mb?: number;
  /** Number of items in memory URI cache */
  memory_cache_count: number;
  /** Number of loaded models */
  loaded_models_count: number;
  /** Total memory used by loaded models in MB */
  loaded_models_memory_mb: number;
}

export interface LoadedModel {
  /** Unique identifier (typically node_id) */
  id: string;
  /** Model/pipeline type name (e.g., "StableDiffusionXLPipeline") */
  type: string;
  /** Estimated memory usage in MB */
  memory_mb: number;
  /** Device location (cuda, cpu, mps) */
  device: string;
  /** Whether CPU offload is enabled */
  offloaded: boolean;
  /** HuggingFace model ID if applicable */
  model_id?: string;
}

export interface LoadedModelsResponse {
  /** List of loaded models */
  models: LoadedModel[];
  /** Total memory used by all models in MB */
  total_memory_mb: number;
}

export interface ModelUnloadResult {
  /** Success status */
  success: boolean;
  /** ID of the model that was unloaded */
  model_id: string;
  /** Message describing the result */
  message: string;
  /** Estimated memory freed in MB */
  memory_freed_mb: number;
}

export interface MemoryCleanupResult {
  /** Success status */
  success: boolean;
  /** Message describing the result */
  message: string;
  /** RAM freed in MB */
  ram_freed_mb: number;
  /** Number of models unloaded */
  models_unloaded: number;
  /** Number of cache items cleared */
  cache_items_cleared: number;
}
