import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";

export {
  IfNode,
  ForEachNode,
  RepeatCountNode,
  RepeatValueStreamNode,
  TakeNode,
  DropNode,
  TakeWhileNode,
  DropWhileNode,
  FilterEqualNode,
  FilterCodeNode,
  ChunkNode,
  LastNode,
  CountStreamNode,
  DistinctNode,
  TapNode,
  CollectNode,
  RerouteNode,
  SwitchNode,
  TryCatchNode,
  CONTROL_NODES
} from "@nodetool-ai/core-nodes/nodes/control";
export {
  SetVariableNode,
  GetVariableNode,
  VARIABLE_NODES
} from "@nodetool-ai/core-nodes/nodes/variable";
export {
  AutomaticSpeechRecognitionNode,
  EmbeddingTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  LoadTextAssetsNode,
  FilterStringNode,
  FilterRegexStringNode,
  ConcatTextNode,
  CollectTextNode,
  PromptNode,
  TemplateTextNode,
  TEXT_EXTRA_NODES
} from "@nodetool-ai/text-nodes/nodes/text-extra";
export {
  ConstantBaseNode,
  ConstantBoolNode,
  ConstantIntegerNode,
  ConstantFloatNode,
  ConstantStringNode,
  ConstantListNode,
  ConstantTextListNode,
  ConstantDictNode,
  ConstantAudioNode,
  ConstantImageNode,
  ConstantVideoNode,
  ConstantDocumentNode,
  ConstantJSONNode,
  ConstantModel3DNode,
  ConstantDataFrameNode,
  ConstantAudioListNode,
  ConstantImageListNode,
  ConstantVideoListNode,
  ConstantSketchNode,
  ConstantSelectNode,
  ConstantImageSizeNode,
  ConstantDateNode,
  ConstantDateTimeNode,
  ConstantASRModelNode,
  ConstantEmbeddingModelNode,
  ConstantImageModelNode,
  ConstantLanguageModelNode,
  ConstantTTSModelNode,
  ConstantVideoModelNode,
  CONSTANT_NODES
} from "@nodetool-ai/core-nodes/nodes/constant";
export {
  FloatInputNode,
  BooleanInputNode,
  IntegerInputNode,
  StringInputNode,
  SelectInputNode,
  StringListInputNode,
  FolderPathInputNode,
  HuggingFaceModelInputNode,
  ColorInputNode,
  ImageSizeInputNode,
  LanguageModelInputNode,
  ImageModelInputNode,
  VideoModelInputNode,
  TTSModelInputNode,
  ASRModelInputNode,
  EmbeddingModelInputNode,
  DataframeInputNode,
  DocumentInputNode,
  ImageInputNode,
  ImageListInputNode,
  VideoListInputNode,
  AudioListInputNode,
  TextListInputNode,
  VideoInputNode,
  AudioInputNode,
  Model3DInputNode,
  RealtimeAudioInputNode,
  AssetFolderInputNode,
  FilePathInputNode,
  DocumentFileInputNode,
  MessageInputNode,
  MessageListInputNode,
  MessageDeconstructorNode,
  INPUT_NODES
} from "@nodetool-ai/core-nodes/nodes/input";
export { OutputNode, PreviewNode, OUTPUT_NODES } from "@nodetool-ai/audio-nodes/nodes/output";
export { WorkflowNode, WORKFLOW_NODES } from "@nodetool-ai/core-nodes/nodes/workflow";
export { SubgraphNode, SUBGRAPH_NODES } from "@nodetool-ai/core-nodes/nodes/subgraph";
export { CompareImagesNode, COMPARE_NODES } from "@nodetool-ai/core-nodes/nodes/compare";
export {
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  ListDocumentsNode,
  DOCUMENT_NODES
} from "@nodetool-ai/document-nodes/nodes/document";
export {
  ForEachRowNode,
  LoadCSVAssetsNode,
  DATA_NODES
} from "@nodetool-ai/data-nodes/nodes/data";
export {
  CodeNode,
  setCodeNodeAgentsModule
} from "@nodetool-ai/code-nodes/nodes/code-node";
export {
  LoadAudioAssetsNode,
  LoadAudioFileNode,
  LoadAudioFolderNode,
  SaveAudioNode,
  SaveAudioFileNode,
  NormalizeAudioNode,
  OverlayAudioNode,
  RemoveSilenceNode,
  SliceAudioNode,
  MonoToStereoNode,
  StereoToMonoNode,
  ReverseAudioNode,
  FadeInAudioNode,
  FadeOutAudioNode,
  RepeatAudioNode,
  AudioMixerNode,
  TrimAudioNode,
  CreateSilenceNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  TextToSpeechNode,
  ChunkToAudioNode,
  GetAudioInfoNode,
  AUDIO_NODES
} from "@nodetool-ai/audio-nodes/nodes/audio";
export {
  AudioToChunksNode,
  ChunksToAudioNode,
  StreamingGainNode,
  StreamingLowPassNode,
  StreamingHighPassNode,
  REALTIME_AUDIO_NODES
} from "@nodetool-ai/audio-nodes/nodes/realtime-audio";
export {
  OscillatorNode,
  LfoNode,
  AdsrNode,
  GateNode,
  VcaNode,
  VcfNode,
  AttenuverterNode,
  SampleHoldNode,
  MixerNode,
  SYNTHESIS_NODES
} from "@nodetool-ai/audio-nodes/nodes/synthesis";
export {
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
  TRIGGER_NODES
} from "@nodetool-ai/automation-nodes/nodes/triggers";
export {
  LoadImageFileNode,
  LoadImageFolderNode,
  SaveImageFileImageNode,
  LoadImageAssetsNode,
  SaveImageNode,
  GetMetadataNode,
  BatchToListNode,
  ImagesToListNode,
  PasteNode,
  ResizeImageNode,
  ScaleNode,
  ResizeNode,
  CanvasResizeNode,
  CropNode,
  FitNode,
  ChannelsNode,
  TextToImageNode,
  ImageToImageNode,
  CompositorNode,
  PainterNode,
  UpscaleImageNode,
  RemoveBackgroundNode,
  RelightImageNode,
  VectorizeImageNode,
  SegmentImageNode,
  IMAGE_NODES
} from "@nodetool-ai/image-nodes/nodes/image";
export {
  RenderSketchNode,
  SketchLayersNode,
  CreateSketchNode,
  SKETCH_NODES
} from "@nodetool-ai/image-nodes/nodes/sketch";
export {
  TextToVideoNode,
  ImageToVideoNode,
  LoadVideoFileNode,
  SaveVideoFileVideoNode,
  LoadVideoAssetsNode,
  SaveVideoNode,
  ForEachFrameNode,
  FpsNode,
  FrameToVideoNode,
  ConcatVideoNode,
  TrimVideoNode,
  ResizeVideoNode,
  RotateVideoNode,
  SetSpeedVideoNode,
  OverlayVideoNode,
  ColorBalanceVideoNode,
  DenoiseVideoNode,
  StabilizeVideoNode,
  SharpnessVideoNode,
  BlurVideoNode,
  SaturationVideoNode,
  AddSubtitlesVideoNode,
  ReverseVideoNode,
  TransitionVideoNode,
  AddAudioVideoNode,
  ChromaKeyVideoNode,
  ExtractAudioVideoNode,
  ExtractFrameVideoNode,
  GetVideoInfoNode,
  VideoToVideoNode,
  LipSyncNode,
  VIDEO_NODES
} from "@nodetool-ai/video-nodes/nodes/video";
export {
  RenderTimelineNode,
  TimelineTranscriptNode,
  AddClipsToTimelineNode,
  TIMELINE_NODES
} from "@nodetool-ai/video-nodes/nodes/timeline";
export {
  LoadScriptNode,
  VoiceScriptNode,
  ScriptToTimelineNode,
  SCRIPT_NODES
} from "@nodetool-ai/video-nodes/nodes/script";
export {
  SummarizerNode,
  EnhancePromptNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  AGENT_NODES
} from "@nodetool-ai/llm-nodes/nodes/agents";
export {
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode,
  GENERATOR_NODES
} from "@nodetool-ai/llm-nodes/nodes/generators";
export {
  DirectorNode,
  ScreenplayShotsNode,
  ApplyEntitiesNode,
  DIRECTOR_NODES
} from "@nodetool-ai/llm-nodes/nodes/director";
export {
  ShotBatchNode,
  ShotChainNode,
  SHOTS_NODES
} from "@nodetool-ai/llm-nodes/nodes/shots";
export {
  LoadModel3DFileNode,
  SaveModel3DFileNode,
  SaveModel3DNode,
  FormatConverterNode,
  GetModel3DMetadataNode,
  Transform3DNode,
  DecimateNode,
  Boolean3DNode,
  RecalculateNormalsNode,
  CenterMeshNode,
  FlipNormalsNode,
  MergeMeshesNode,
  TextTo3DNode,
  ImageTo3DNode,
  RenderToImageNode,
  MODEL3D_NODES
} from "@nodetool-ai/video-nodes/nodes/model3d";
export { RenderImageNode, RenderPassesNode, RenderAnimationNode, PrepareForEngineNode, ExportModelNode, BLENDER_NODES } from "@nodetool-ai/blender-nodes";
export {
  YtDlpDownloadLibNode,
  LIB_YTDLP_NODES
} from "@nodetool-ai/video-nodes/nodes/lib-video-download";
export {
  SliceImageGridLibNode,
  LIB_GRID_NODES
} from "@nodetool-ai/image-nodes/nodes/lib-grid";
export {
  DocumentLibNode,
  SVGToImageLibNode,
  LIB_SVG_NODES
} from "@nodetool-ai/text-nodes/nodes/lib-svg";
export { LIB_IMAGE_ENHANCE_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-enhance";
export { LIB_IMAGE_FILTER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter";
export { LIB_IMAGE_DRAW_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-draw";
export { LIB_IMAGE_COLOR_GRADING_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color-grading";
// Backward compatibility: existing tests that import LIB_PILLOW_NODES still work
import { LIB_IMAGE_ENHANCE_NODES as _LIB_IMAGE_ENHANCE_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-enhance";
import { LIB_IMAGE_FILTER_NODES as _LIB_IMAGE_FILTER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter";
import { LIB_IMAGE_DRAW_NODES as _LIB_IMAGE_DRAW_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-draw";
import { LIB_IMAGE_COLOR_GRADING_NODES as _LIB_IMAGE_COLOR_GRADING_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color-grading";
export const LIB_PILLOW_NODES = [
  ..._LIB_IMAGE_ENHANCE_NODES,
  ..._LIB_IMAGE_FILTER_NODES,
  ..._LIB_IMAGE_DRAW_NODES,
  ..._LIB_IMAGE_COLOR_GRADING_NODES
];
export {
  ScreenshotLibNode,
  LIB_BROWSER_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-browser";
export { ChartRendererLibNode, LIB_SEABORN_NODES } from "@nodetool-ai/data-nodes/nodes/lib-charts";
export {
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode,
  LIB_AUDIO_DSP_NODES
} from "@nodetool-ai/audio-nodes/nodes/lib-audio-dsp";
export {
  GetDatabasePathLibNode,
  LIB_SQLITE_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-sqlite";
export {
  BitcrushNode,
  CompressNode,
  DistortionNode,
  LimiterNode,
  ReverbNode,
  PitchShiftNode,
  TimeStretchNode,
  NoiseGateNode,
  PhaserNode,
  LIB_PEDALBOARD_EXTRA_NODES
} from "@nodetool-ai/audio-nodes/nodes/lib-audio-effects";
export {
  PdfExtractTextNode,
  PdfExtractMarkdownNode,
  PdfExtractTablesNode,
  PdfExtractStyledTextNode,
  PdfScreenshotNode,
  PdfToppmNode,
  PdfExtractOcrNode,
  LIB_PDF_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-pdf";
export {
  KieAINode,
  KIE_DYNAMIC_NODES,
  resolveKieDynamicSchema
} from "@nodetool-ai/integration-nodes/nodes/kie-dynamic";
export {
  CollectionNode,
  CountNode,
  GetDocumentsNode,
  PeekNode,
  IndexImageNode,
  IndexEmbeddingNode,
  IndexTextChunkNode,
  IndexAggregatedTextNode,
  IndexStringNode,
  QueryImageNode,
  QueryTextNode,
  RemoveOverlapNode,
  HybridSearchNode,
  VECTOR_NODES
} from "@nodetool-ai/core-nodes/nodes/vector";
export { GEMINI_NODES } from "@nodetool-ai/llm-nodes/nodes/gemini";
export {
  ComfyWorkflowNode,
  ComfyWorkerWorkflowNode,
  COMFY_NODES
} from "@nodetool-ai/integration-nodes/nodes/comfy";
export { MESSAGING_NODES } from "@nodetool-ai/integration-nodes/nodes/messaging";
export { MISTRAL_NODES } from "@nodetool-ai/llm-nodes/nodes/mistral";
export { OPENAI_NODES } from "@nodetool-ai/llm-nodes/nodes/openai";
export { XAI_NODES } from "@nodetool-ai/llm-nodes/nodes/xai";
import { CONTROL_NODES } from "@nodetool-ai/core-nodes/nodes/control";
import { VARIABLE_NODES } from "@nodetool-ai/core-nodes/nodes/variable";
import { TEXT_EXTRA_NODES } from "@nodetool-ai/text-nodes/nodes/text-extra";
import { CONSTANT_NODES } from "@nodetool-ai/core-nodes/nodes/constant";
import { FAKE_MEDIA_NODES } from "@nodetool-ai/core-nodes/nodes/fake-media";
import { EXTENDED_PLACEHOLDER_NODES } from "@nodetool-ai/core-nodes/nodes/extended-placeholders";
import { INPUT_NODES } from "@nodetool-ai/core-nodes/nodes/input";
import { OUTPUT_NODES } from "@nodetool-ai/audio-nodes/nodes/output";
import { WORKFLOW_NODES } from "@nodetool-ai/core-nodes/nodes/workflow";
import { SUBGRAPH_NODES } from "@nodetool-ai/core-nodes/nodes/subgraph";
import { COMPARE_NODES } from "@nodetool-ai/core-nodes/nodes/compare";
import { DOCUMENT_NODES } from "@nodetool-ai/document-nodes/nodes/document";
import { DATA_NODES } from "@nodetool-ai/data-nodes/nodes/data";
import { CodeNode } from "@nodetool-ai/code-nodes/nodes/code-node";
import { AUDIO_NODES } from "@nodetool-ai/audio-nodes/nodes/audio";
import { REALTIME_AUDIO_NODES } from "@nodetool-ai/audio-nodes/nodes/realtime-audio";
import { SYNTHESIS_NODES } from "@nodetool-ai/audio-nodes/nodes/synthesis";
import { TRIGGER_NODES } from "@nodetool-ai/automation-nodes/nodes/triggers";
import { IMAGE_NODES } from "@nodetool-ai/image-nodes/nodes/image";
import { SKETCH_NODES } from "@nodetool-ai/image-nodes/nodes/sketch";
import { VIDEO_NODES } from "@nodetool-ai/video-nodes/nodes/video";
import { TIMELINE_NODES } from "@nodetool-ai/video-nodes/nodes/timeline";
import { SCRIPT_NODES } from "@nodetool-ai/video-nodes/nodes/script";
import { AGENT_NODES } from "@nodetool-ai/llm-nodes/nodes/agents";
import { GENERATOR_NODES } from "@nodetool-ai/llm-nodes/nodes/generators";
import { DIRECTOR_NODES } from "@nodetool-ai/llm-nodes/nodes/director";
import { SHOTS_NODES } from "@nodetool-ai/llm-nodes/nodes/shots";
import { MODEL3D_NODES } from "@nodetool-ai/video-nodes/nodes/model3d";
import { BLENDER_NODES } from "@nodetool-ai/blender-nodes";
import { LIB_APPLE_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-apple";
import { LIB_YTDLP_NODES } from "@nodetool-ai/video-nodes/nodes/lib-video-download";
import { LIB_GRID_NODES } from "@nodetool-ai/image-nodes/nodes/lib-grid";
import { LIB_SVG_NODES } from "@nodetool-ai/text-nodes/nodes/lib-svg";
import { LIB_IMAGE_ENHANCE_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-enhance";
import { LIB_IMAGE_FILTER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter";
import { LIB_IMAGE_DRAW_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-draw";
import { LIB_IMAGE_COLOR_GRADING_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color-grading";
import { LIB_AUDIO_DSP_NODES } from "@nodetool-ai/audio-nodes/nodes/lib-audio-dsp";
import { LIB_SQLITE_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-sqlite";
import { LIB_BROWSER_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-browser";
import { LIB_SEABORN_NODES } from "@nodetool-ai/data-nodes/nodes/lib-charts";
import { LIB_PEDALBOARD_EXTRA_NODES } from "@nodetool-ai/audio-nodes/nodes/lib-audio-effects";
import { LIB_PDF_NODES } from "@nodetool-ai/document-nodes/nodes/lib-pdf";
import { KIE_DYNAMIC_NODES } from "@nodetool-ai/integration-nodes/nodes/kie-dynamic";
import { VECTOR_NODES } from "@nodetool-ai/core-nodes/nodes/vector";
import { GEMINI_NODES } from "@nodetool-ai/llm-nodes/nodes/gemini";
import { COMFY_NODES } from "@nodetool-ai/integration-nodes/nodes/comfy";
import { MESSAGING_NODES } from "@nodetool-ai/integration-nodes/nodes/messaging";
import { MISTRAL_NODES } from "@nodetool-ai/llm-nodes/nodes/mistral";
import { OPENAI_NODES } from "@nodetool-ai/llm-nodes/nodes/openai";
import { XAI_NODES } from "@nodetool-ai/llm-nodes/nodes/xai";
import { LIB_IMAGE_EFFECTS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-effects";
import { LIB_IMAGE_KEYER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-keyer";
import { LIB_IMAGE_MASK_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-mask";
import { LIB_IMAGE_CHANNEL_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-channel";
import { LIB_IMAGE_WARP_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-warp";
import { LIB_IMAGE_GENERATORS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-generators";
import { LIB_IMAGE_FILTER_EXTRAS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter-extras";
import { LIB_IMAGE_COLOR_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color";

export const ALL_BASE_NODES: readonly NodeClass[] = [
  ...CONTROL_NODES,
  ...VARIABLE_NODES,
  ...TEXT_EXTRA_NODES,
  ...CONSTANT_NODES,
  ...FAKE_MEDIA_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...INPUT_NODES,
  ...OUTPUT_NODES,
  ...WORKFLOW_NODES,
  ...SUBGRAPH_NODES,
  ...COMPARE_NODES,
  ...DOCUMENT_NODES,
  ...DATA_NODES,
  CodeNode,
  ...AUDIO_NODES,
  ...REALTIME_AUDIO_NODES,
  ...SYNTHESIS_NODES,
  ...TRIGGER_NODES,
  ...IMAGE_NODES,
  ...SKETCH_NODES,
  ...VIDEO_NODES,
  ...TIMELINE_NODES,
  ...SCRIPT_NODES,
  ...AGENT_NODES,
  ...GENERATOR_NODES,
  ...DIRECTOR_NODES,
  ...SHOTS_NODES,
  ...MODEL3D_NODES,
  ...BLENDER_NODES,
  ...(process.platform === "darwin" ? LIB_APPLE_NODES : []),
  ...LIB_YTDLP_NODES,
  ...LIB_GRID_NODES,
  ...LIB_SVG_NODES,
  ...LIB_IMAGE_ENHANCE_NODES,
  ...LIB_IMAGE_FILTER_NODES,
  ...LIB_IMAGE_DRAW_NODES,
  ...LIB_IMAGE_COLOR_GRADING_NODES,
  ...LIB_AUDIO_DSP_NODES,
  ...LIB_SQLITE_NODES,
  ...LIB_BROWSER_NODES,
  ...LIB_SEABORN_NODES,
  ...LIB_PEDALBOARD_EXTRA_NODES,
  ...LIB_PDF_NODES,
  ...KIE_DYNAMIC_NODES,
  ...VECTOR_NODES,
  ...GEMINI_NODES,
  ...COMFY_NODES,
  ...MESSAGING_NODES,
  ...MISTRAL_NODES,
  ...OPENAI_NODES,
  ...XAI_NODES,
  ...LIB_IMAGE_EFFECTS_NODES,
  ...LIB_IMAGE_KEYER_NODES,
  ...LIB_IMAGE_MASK_NODES,
  ...LIB_IMAGE_CHANNEL_NODES,
  ...LIB_IMAGE_WARP_NODES,
  ...LIB_IMAGE_GENERATORS_NODES,
  ...LIB_IMAGE_FILTER_EXTRAS_NODES,
  ...LIB_IMAGE_COLOR_NODES
];

export { LIB_IMAGE_EFFECTS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-effects";
export { LIB_IMAGE_KEYER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-keyer";
export { LIB_IMAGE_MASK_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-mask";
export { LIB_IMAGE_CHANNEL_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-channel";
export { LIB_IMAGE_WARP_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-warp";
export { LIB_IMAGE_GENERATORS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-generators";
export { LIB_IMAGE_FILTER_EXTRAS_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter-extras";
export { LIB_IMAGE_COLOR_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color";

export function registerBaseNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_BASE_NODES) {
    if (nodeClass.nodeType === "nodetool.workflows.base_node.Preview") {
      registry.register(nodeClass, {
        metadata: {
          title: "Preview",
          description: "Preview values inside the workflow graph",
          namespace: "nodetool.workflows.base_node",
          node_type: "nodetool.workflows.base_node.Preview",
          properties: [
            {
              name: "value",
              type: { type: "any", type_args: [] },
              default: null
            },
            { name: "name", type: { type: "str", type_args: [] }, default: "" }
          ],
          outputs: [{ name: "output", type: { type: "any", type_args: [] } }],
          inline_fields: ["value", "name"]
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.workflow_node.Workflow") {
      registry.register(nodeClass, {
        metadata: {
          title: "Workflow",
          description:
            "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.",
          namespace: "nodetool.workflows.workflow_node",
          node_type: "nodetool.workflows.workflow_node.Workflow",
          supports_dynamic_inputs: true,
          is_streaming_output: true,
          properties: [
            {
              name: "workflow_id",
              type: { type: "str", type_args: [] },
              default: ""
            },
            {
              name: "workflow_json",
              type: { type: "dict", type_args: [] },
              default: {}
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    if (nodeClass.nodeType === "nodetool.workflows.subgraph.Subgraph") {
      registry.register(nodeClass, {
        metadata: {
          title: "Subgraph",
          description:
            "Execute an inline sub-graph as an isolated workflow. Inputs/outputs are derived from inner Input/Output nodes.",
          namespace: "nodetool.workflows.subgraph",
          node_type: "nodetool.workflows.subgraph.Subgraph",
          supports_dynamic_inputs: true,
          is_streaming_output: true,
          properties: [
            {
              name: "graph",
              type: { type: "dict", type_args: [] },
              default: { nodes: [], edges: [] }
            }
          ],
          outputs: [],
          inline_fields: []
        }
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
