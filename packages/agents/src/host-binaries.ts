/**
 * Re-export shim: the host binary runner lives in `@nodetool-ai/runtime`.
 * Import paths into this module keep working; call sites are unchanged.
 */
export {
  runHostBinary,
  HostBinaryMissingError,
  MAX_CAPTURED_BYTES,
  MAX_ARTIFACT_BYTES,
  maxConcurrentHostBinaries,
  mimeFromFilename,
  clampTimeoutSeconds,
  type HostBinaryResult,
  type RunHostBinaryOptions
} from "@nodetool-ai/runtime";
