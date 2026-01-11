/**
 * Subgraph operations index
 * 
 * Exports all subgraph-related functions for easy importing
 */

// Boundary analysis
export {
  analyzeBoundary,
  groupBoundaryInputs,
  groupBoundaryOutputs,
  validateSelection,
  calculateSelectionCenter
} from "./boundary";

// Convert to subgraph
export {
  convertToSubgraph,
  type ConvertToSubgraphResult
} from "./convert";

// Unpack subgraph
export {
  unpackSubgraph,
  type UnpackSubgraphResult
} from "./unpack";

// I/O management
export {
  addInput,
  removeInput,
  renameInput,
  addOutput,
  removeOutput,
  renameOutput,
  updateInputType,
  updateOutputType
} from "./io";

// Flattening for execution
export {
  flattenSubgraphs,
  parseExecutionId,
  findNodeByExecutionId,
  hasSubgraphs,
  validateNoCircularReferences
} from "./flatten";
