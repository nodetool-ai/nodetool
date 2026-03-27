/**
 * SAM module barrel export.
 */

export { SamServiceStub, getSamService, setSamService } from "./SamService";
export { DEFAULT_SAM_MODEL_ID, DEFAULT_SAM_MODEL_NAME } from "./SamService";

export type {
  SamService,
  SamModelStatus,
  SamModelInfo,
  SegmentationRequest,
  SegmentationResponse
} from "./SamService";
