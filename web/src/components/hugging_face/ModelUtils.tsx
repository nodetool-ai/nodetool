import { UnifiedModel } from "../../stores/ApiTypes";

export interface ModelComponentProps {
  model: UnifiedModel;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  onDownload?: () => void;
  onSelect?: () => void;
  compactView?: boolean;
  showModelStats?: boolean;
}
