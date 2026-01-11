/**
 * Types for the Memory Management API
 */

export interface MemoryStats {
  /** Total RAM in GB */
  ram_total_gb: number;
  /** Used RAM in GB */
  ram_used_gb: number;
  /** RAM usage percentage */
  ram_percent: number;
  /** GPU memory allocated in GB */
  gpu_allocated_gb: number;
  /** GPU memory reserved in GB */
  gpu_reserved_gb: number;
  /** GPU memory total in GB */
  gpu_total_gb?: number;
  /** Number of cached items */
  cache_count: number;
}

export interface LoadedModel {
  /** Model identifier */
  id: string;
  /** Model name */
  name: string;
  /** Memory usage in GB */
  memory_gb: number;
  /** Model type (e.g., "transformer", "diffusion") */
  type?: string;
  /** Whether model is currently in use */
  in_use: boolean;
}

export interface UnloadModelResponse {
  /** Success status */
  success: boolean;
  /** Message describing the result */
  message: string;
  /** Freed memory in GB */
  freed_memory_gb?: number;
}

export interface ClearModelsResponse {
  /** Success status */
  success: boolean;
  /** Number of models unloaded */
  models_unloaded: number;
  /** Total freed memory in GB */
  freed_memory_gb: number;
}

export interface ClearGPUResponse {
  /** Success status */
  success: boolean;
  /** Message describing the result */
  message: string;
  /** Freed memory in GB */
  freed_memory_gb?: number;
}

export interface FullCleanupResponse {
  /** Success status */
  success: boolean;
  /** Number of models unloaded */
  models_unloaded: number;
  /** Number of URI cache items cleared */
  uri_cache_cleared: number;
  /** Total freed memory in GB */
  freed_memory_gb: number;
}
