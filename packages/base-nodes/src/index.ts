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
  RangeNode,
  TileNode,
  RepeatEachNode,
  RepeatValueNode,
  LIST_NODES
} from "@nodetool-ai/core-nodes/nodes/list";
export {
  SplitTextNode,
  ExtractTextNode,
  ChunkTextNode,
  ExtractRegexNode,
  FindAllRegexNode,
  TextParseJSONNode,
  ExtractJSONNode,
  RegexMatchNode,
  RegexReplaceNode,
  RegexSplitNode,
  RegexValidateNode,
  CompareTextNode,
  EqualsTextNode,
  ToUppercaseNode,
  ToLowercaseNode,
  ToTitlecaseNode,
  CapitalizeTextNode,
  SliceTextNode,
  StartsWithTextNode,
  EndsWithTextNode,
  ContainsTextNode,
  TrimWhitespaceNode,
  CollapseWhitespaceNode,
  IsEmptyTextNode,
  RemovePunctuationNode,
  StripAccentsNode,
  SlugifyNode,
  HasLengthTextNode,
  TruncateTextNode,
  PadTextNode,
  LengthTextNode,
  IndexOfTextNode,
  SurroundWithTextNode,
  CountTokensNode,
  HtmlToTextNode,
  AutomaticSpeechRecognitionNode,
  EmbeddingTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  LoadTextAssetsNode,
  FilterStringNode,
  FilterRegexStringNode,
  ConcatTextNode,
  JoinTextNode,
  CollectTextNode,
  FormatTextNode,
  PromptNode,
  TemplateTextNode,
  ReplaceTextNode,
  ToStringNode,
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
export {
  GetWorkspaceDirNode,
  ListWorkspaceFilesNode,
  ReadTextFileNode,
  WriteTextFileNode,
  ReadBinaryFileNode,
  WriteBinaryFileNode,
  DeleteWorkspaceFileNode,
  CreateWorkspaceDirectoryNode,
  WorkspaceFileExistsNode,
  GetWorkspaceFileInfoNode,
  CopyWorkspaceFileNode,
  MoveWorkspaceFileNode,
  GetWorkspaceFileSizeNode,
  IsWorkspaceFileNode,
  IsWorkspaceDirectoryNode,
  JoinWorkspacePathsNode,
  SaveImageFileNode,
  SaveVideoFileNode,
  WORKSPACE_NODES
} from "@nodetool-ai/automation-nodes/nodes/workspace";
export { CompareImagesNode, COMPARE_NODES } from "@nodetool-ai/core-nodes/nodes/compare";
export {
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  ListDocumentsNode,
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitRecursivelyNode,
  SplitMarkdownNode,
  DOCUMENT_NODES
} from "@nodetool-ai/document-nodes/nodes/document";
export {
  SchemaNode,
  FilterDataframeNode,
  SliceDataframeNode,
  SaveDataframeNode,
  ImportCSVNode,
  LoadCSVURLNode,
  LoadCSVFileDataNode,
  FromListNode,
  JSONToDataframeNode,
  ToListNode,
  SelectColumnNode,
  ExtractColumnNode,
  AddColumnNode,
  MergeDataframeNode,
  AppendDataframeNode,
  JoinDataframeNode,
  FindRowNode,
  SortByColumnNode,
  DropDuplicatesNode,
  DropNANode,
  ForEachRowNode,
  LoadCSVAssetsNode,
  AggregateNode,
  PivotNode,
  RenameNode,
  FillNANode,
  SaveCSVDataframeFileNode,
  FilterNoneNode,
  DescribeNode,
  DATA_NODES
} from "@nodetool-ai/data-nodes/nodes/data";
export {
  ExecutePythonNode,
  ExecuteJavaScriptNode,
  ExecuteBashNode,
  ExecuteRubyNode,
  ExecuteLuaNode,
  ExecuteCommandNode,
  RunPythonCommandNode,
  RunJavaScriptCommandNode,
  RunBashCommandNode,
  RunRubyCommandNode,
  RunLuaCommandNode,
  RunLuaCommandDockerNode,
  RunShellCommandNode,
  RunPythonCommandDockerNode,
  RunJavaScriptCommandDockerNode,
  RunBashCommandDockerNode,
  RunRubyCommandDockerNode,
  RunShellCommandDockerNode,
  CODE_NODES
} from "@nodetool-ai/code-nodes/nodes/code";
export { CodeNode } from "@nodetool-ai/code-nodes/nodes/code-node";
export {
  DateNowNode,
  FormatDateNode,
  DateAddNode,
  DateDiffNode,
  DateStartEndNode,
  LIB_DATETIME_NODES
} from "@nodetool-ai/core-nodes/nodes/lib-datetime";
export {
  ValidateEmailNode,
  ValidateURLNode,
  ValidateIPNode,
  ValidateStringNode,
  SanitizeStringNode,
  LIB_VALIDATE_NODES
} from "@nodetool-ai/core-nodes/nodes/lib-validate";
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
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  AgentStepNode,
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
  MODEL3D_NODES
} from "@nodetool-ai/video-nodes/nodes/model3d";
export {
  WorkspaceDirectoryLibNode,
  OpenWorkspaceDirectoryLibNode,
  FileExistsLibNode,
  ListFilesLibNode,
  CopyFileLibNode,
  MoveFileLibNode,
  CreateDirectoryLibNode,
  GetFileSizeLibNode,
  CreatedTimeLibNode,
  ModifiedTimeLibNode,
  AccessedTimeLibNode,
  IsFileLibNode,
  IsDirectoryLibNode,
  FileExtensionLibNode,
  FileNameLibNode,
  GetDirectoryLibNode,
  FileNameMatchLibNode,
  FilterFileNamesLibNode,
  BasenameLibNode,
  DirnameLibNode,
  JoinPathsLibNode,
  NormalizePathLibNode,
  GetPathInfoLibNode,
  AbsolutePathLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  RelativePathLibNode,
  PathToStringLibNode,
  ShowNotificationLibNode,
  LIB_OS_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-os";
export {
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  LIB_MARKDOWN_NODES
} from "@nodetool-ai/text-nodes/nodes/lib-markdown";
export { GetSecretLibNode, LIB_SECRET_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-secret";
export {
  ConvertFilePandocLibNode,
  ConvertTextPandocLibNode,
  LIB_PANDOC_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-doc-transform";
export {
  YtDlpDownloadLibNode,
  LIB_YTDLP_NODES
} from "@nodetool-ai/video-nodes/nodes/lib-video-download";
export {
  SliceImageGridLibNode,
  CombineImageGridLibNode,
  LIB_GRID_NODES
} from "@nodetool-ai/image-nodes/nodes/lib-grid";
export {
  RectLibNode,
  CircleLibNode,
  EllipseLibNode,
  LineLibNode,
  PolygonLibNode,
  PathLibNode,
  TextLibNode,
  GaussianBlurLibNode,
  DropShadowLibNode,
  DocumentLibNode,
  SVGToImageLibNode,
  GradientLibNode,
  TransformLibNode,
  ClipPathLibNode,
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
  WebFetchLibNode,
  DownloadFileLibNode,
  BrowserLibNode,
  ScreenshotLibNode,
  SpiderCrawlLibNode,
  LIB_BROWSER_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-browser";
export {
  HttpGetTextNode,
  HttpGetJsonNode,
  HttpGetBytesNode,
  HttpPostNode,
  HttpPutNode,
  HttpPatchNode,
  HttpDeleteNode,
  LIB_HTTP_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-http";
export {
  GraphQLQueryLibNode,
  GraphQLQueryWithAuthLibNode,
  GraphQLIntrospectionLibNode,
  GraphQLBatchQueryLibNode,
  LIB_GRAPHQL_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-graphql";
export {
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  LIB_MAIL_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-mail";
export {
  TwilioSendSMSLibNode,
  TwilioSendWhatsAppLibNode,
  TwilioGetMessagesLibNode,
  TwilioLookupLibNode,
  LIB_TWILIO_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-twilio";
export {
  ConvertToMarkdownLibNode,
  LIB_MARKITDOWN_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-doc-convert";
export { ChartRendererLibNode, LIB_SEABORN_NODES } from "@nodetool-ai/data-nodes/nodes/lib-charts";
export {
  BaseUrlLibNode,
  ExtractLinksLibNode,
  ExtractImagesLibNode,
  ExtractAudioLibNode,
  ExtractVideosLibNode,
  ExtractMetadataLibNode,
  HTMLToTextLibNode,
  WebsiteContentExtractorLibNode,
  LIB_BEAUTIFULSOUP_NODES
} from "@nodetool-ai/text-nodes/nodes/lib-html-parse";
export {
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode,
  LIB_RSS_NODES
} from "@nodetool-ai/data-nodes/nodes/lib-rss";
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
  CreateTableLibNode,
  InsertLibNode as SqliteInsertLibNode,
  QueryLibNode,
  UpdateLibNode as SqliteUpdateLibNode,
  DeleteLibNode as SqliteDeleteLibNode,
  ExecuteSQLLibNode,
  GetDatabasePathLibNode,
  LIB_SQLITE_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-sqlite";
export {
  SelectLibNode,
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode,
  RPCLibNode,
  LIB_SUPABASE_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-supabase";
export {
  NotionSearchLibNode,
  NotionGetPageLibNode,
  NotionGetPageContentLibNode,
  NotionCreatePageLibNode,
  NotionUpdatePageLibNode,
  NotionQueryDatabaseLibNode,
  LIB_NOTION_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-notion";
export {
  S3ListBucketsLibNode,
  S3ListObjectsLibNode,
  S3GetObjectLibNode,
  S3PutObjectLibNode,
  S3DeleteObjectLibNode,
  S3CopyObjectLibNode,
  S3GetPresignedUrlLibNode,
  LIB_S3_NODES
} from "@nodetool-ai/integration-nodes/nodes/lib-s3";
export {
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
  LIB_EXCEL_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-excel";
export {
  CreateDocumentLibNode,
  LoadWordDocumentLibNode,
  AddHeadingLibNode,
  AddParagraphLibNode,
  AddTableLibNode,
  AddImageLibNode,
  AddPageBreakLibNode,
  SetDocumentPropertiesLibNode,
  SaveDocumentLibNode,
  LIB_DOCX_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-docx";
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
  PdfPageCountNode,
  PdfExtractTextNode,
  PdfExtractMarkdownNode,
  PdfExtractTablesNode,
  PdfExtractTextBlocksNode,
  PdfExtractStyledTextNode,
  PdfPageMetadataNode,
  PdfScreenshotNode,
  PdfSearchTextNode,
  PdfExtractOcrNode,
  LIB_PDF_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-pdf";
export {
  EpubMetadataLibNode,
  EpubTableOfContentsLibNode,
  EpubExtractTextLibNode,
  EpubExtractChaptersLibNode,
  LIB_EPUB_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-epub";
export {
  PptxExtractTextLibNode,
  PptxExtractSlidesLibNode,
  LIB_PPTX_NODES
} from "@nodetool-ai/document-nodes/nodes/lib-pptx";
export {
  OcrExtractTextLibNode,
  OcrExtractDataLibNode,
  LIB_OCR_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-ocr";
export {
  TensorflowMobileNetClassifyNode,
  TensorflowMobileNetEmbeddingNode,
  TensorflowCocoSsdDetectNode,
  TensorflowQnaNode,
  LIB_TENSORFLOW_NODES
} from "@nodetool-ai/automation-nodes/nodes/lib-tensorflow";
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
export { APIFY_NODES } from "@nodetool-ai/integration-nodes/nodes/apify";
export {
  ComfyWorkflowNode,
  COMFY_NODES
} from "@nodetool-ai/integration-nodes/nodes/comfy";
export { MESSAGING_NODES } from "@nodetool-ai/integration-nodes/nodes/messaging";
export { MISTRAL_NODES } from "@nodetool-ai/llm-nodes/nodes/mistral";
export { OPENAI_NODES } from "@nodetool-ai/llm-nodes/nodes/openai";
export { XAI_NODES } from "@nodetool-ai/llm-nodes/nodes/xai";
export { SEARCH_NODES } from "@nodetool-ai/integration-nodes/nodes/search";
export { TOOL_AGENT_NODES } from "@nodetool-ai/code-nodes/nodes/tool-agents";
export {
  SandboxShellNode,
  SandboxFileNode,
  SANDBOX_NODES
} from "@nodetool-ai/code-nodes/nodes/sandbox";
export {
  SentimentAnalysisLibNode,
  TokenizeLibNode,
  StemLibNode,
  TfIdfLibNode,
  ClassifyTextLibNode,
  ExtractEntitiesLibNode,
  PhoneticMatchLibNode,
  LIB_NLP_NODES
} from "@nodetool-ai/text-nodes/nodes/lib-nlp";
import { CONTROL_NODES } from "@nodetool-ai/core-nodes/nodes/control";
import { LIST_NODES } from "@nodetool-ai/core-nodes/nodes/list";
import { TEXT_EXTRA_NODES } from "@nodetool-ai/text-nodes/nodes/text-extra";
import { CONSTANT_NODES } from "@nodetool-ai/core-nodes/nodes/constant";
import { EXTENDED_PLACEHOLDER_NODES } from "@nodetool-ai/core-nodes/nodes/extended-placeholders";
import { INPUT_NODES } from "@nodetool-ai/core-nodes/nodes/input";
import { OUTPUT_NODES } from "@nodetool-ai/audio-nodes/nodes/output";
import { WORKFLOW_NODES } from "@nodetool-ai/core-nodes/nodes/workflow";
import { SUBGRAPH_NODES } from "@nodetool-ai/core-nodes/nodes/subgraph";
import { WORKSPACE_NODES } from "@nodetool-ai/automation-nodes/nodes/workspace";
import { COMPARE_NODES } from "@nodetool-ai/core-nodes/nodes/compare";
import { DOCUMENT_NODES } from "@nodetool-ai/document-nodes/nodes/document";
import { DATA_NODES } from "@nodetool-ai/data-nodes/nodes/data";
import { CODE_NODES } from "@nodetool-ai/code-nodes/nodes/code";
import { CodeNode } from "@nodetool-ai/code-nodes/nodes/code-node";
import { AUDIO_NODES } from "@nodetool-ai/audio-nodes/nodes/audio";
import { REALTIME_AUDIO_NODES } from "@nodetool-ai/audio-nodes/nodes/realtime-audio";
import { SYNTHESIS_NODES } from "@nodetool-ai/audio-nodes/nodes/synthesis";
import { TRIGGER_NODES } from "@nodetool-ai/automation-nodes/nodes/triggers";
import { IMAGE_NODES } from "@nodetool-ai/image-nodes/nodes/image";
import { SKETCH_NODES } from "@nodetool-ai/image-nodes/nodes/sketch";
import { VIDEO_NODES } from "@nodetool-ai/video-nodes/nodes/video";
import { TIMELINE_NODES } from "@nodetool-ai/video-nodes/nodes/timeline";
import { AGENT_NODES } from "@nodetool-ai/llm-nodes/nodes/agents";
import { GENERATOR_NODES } from "@nodetool-ai/llm-nodes/nodes/generators";
import { MODEL3D_NODES } from "@nodetool-ai/video-nodes/nodes/model3d";
import { LIB_OS_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-os";
import { LIB_MARKDOWN_NODES } from "@nodetool-ai/text-nodes/nodes/lib-markdown";
import { LIB_SECRET_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-secret";
import { LIB_PANDOC_NODES } from "@nodetool-ai/document-nodes/nodes/lib-doc-transform";
import { LIB_YTDLP_NODES } from "@nodetool-ai/video-nodes/nodes/lib-video-download";
import { LIB_GRID_NODES } from "@nodetool-ai/image-nodes/nodes/lib-grid";
import { LIB_SVG_NODES } from "@nodetool-ai/text-nodes/nodes/lib-svg";
import { LIB_IMAGE_ENHANCE_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-enhance";
import { LIB_IMAGE_FILTER_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-filter";
import { LIB_IMAGE_DRAW_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-draw";
import { LIB_IMAGE_COLOR_GRADING_NODES } from "@nodetool-ai/image-nodes/nodes/lib-image-color-grading";
import { LIB_RSS_NODES } from "@nodetool-ai/data-nodes/nodes/lib-rss";
import { LIB_AUDIO_DSP_NODES } from "@nodetool-ai/audio-nodes/nodes/lib-audio-dsp";
import { LIB_SQLITE_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-sqlite";
import { LIB_SUPABASE_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-supabase";
import { LIB_S3_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-s3";
import { LIB_EXCEL_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-excel";
import { LIB_DOCX_NODES } from "@nodetool-ai/document-nodes/nodes/lib-docx";
import { LIB_BEAUTIFULSOUP_NODES } from "@nodetool-ai/text-nodes/nodes/lib-html-parse";
import { LIB_BROWSER_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-browser";
import { LIB_HTTP_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-http";
import { LIB_GRAPHQL_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-graphql";
import { LIB_MAIL_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-mail";
import { LIB_TWILIO_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-twilio";
import { LIB_MARKITDOWN_NODES } from "@nodetool-ai/document-nodes/nodes/lib-doc-convert";
import { LIB_SEABORN_NODES } from "@nodetool-ai/data-nodes/nodes/lib-charts";
import { LIB_PEDALBOARD_EXTRA_NODES } from "@nodetool-ai/audio-nodes/nodes/lib-audio-effects";
import { LIB_PDF_NODES } from "@nodetool-ai/document-nodes/nodes/lib-pdf";
import { LIB_EPUB_NODES } from "@nodetool-ai/document-nodes/nodes/lib-epub";
import { LIB_PPTX_NODES } from "@nodetool-ai/document-nodes/nodes/lib-pptx";
import { LIB_OCR_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-ocr";
import { LIB_TENSORFLOW_NODES } from "@nodetool-ai/automation-nodes/nodes/lib-tensorflow";
import { LIB_NOTION_NODES } from "@nodetool-ai/integration-nodes/nodes/lib-notion";
import { KIE_DYNAMIC_NODES } from "@nodetool-ai/integration-nodes/nodes/kie-dynamic";
import { VECTOR_NODES } from "@nodetool-ai/core-nodes/nodes/vector";
import { GEMINI_NODES } from "@nodetool-ai/llm-nodes/nodes/gemini";
import { APIFY_NODES } from "@nodetool-ai/integration-nodes/nodes/apify";
import { COMFY_NODES } from "@nodetool-ai/integration-nodes/nodes/comfy";
import { MESSAGING_NODES } from "@nodetool-ai/integration-nodes/nodes/messaging";
import { MISTRAL_NODES } from "@nodetool-ai/llm-nodes/nodes/mistral";
import { OPENAI_NODES } from "@nodetool-ai/llm-nodes/nodes/openai";
import { XAI_NODES } from "@nodetool-ai/llm-nodes/nodes/xai";
import { SEARCH_NODES } from "@nodetool-ai/integration-nodes/nodes/search";
import { TOOL_AGENT_NODES } from "@nodetool-ai/code-nodes/nodes/tool-agents";
import { SANDBOX_NODES } from "@nodetool-ai/code-nodes/nodes/sandbox";
import { LIB_NLP_NODES } from "@nodetool-ai/text-nodes/nodes/lib-nlp";
import { LIB_DATETIME_NODES } from "@nodetool-ai/core-nodes/nodes/lib-datetime";
import { LIB_VALIDATE_NODES } from "@nodetool-ai/core-nodes/nodes/lib-validate";
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
  ...LIST_NODES,
  ...TEXT_EXTRA_NODES,
  ...CONSTANT_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...INPUT_NODES,
  ...OUTPUT_NODES,
  ...WORKFLOW_NODES,
  ...SUBGRAPH_NODES,
  ...WORKSPACE_NODES,
  ...COMPARE_NODES,
  ...DOCUMENT_NODES,
  ...DATA_NODES,
  ...CODE_NODES,
  CodeNode,
  ...LIB_DATETIME_NODES,
  ...LIB_VALIDATE_NODES,
  ...AUDIO_NODES,
  ...REALTIME_AUDIO_NODES,
  ...SYNTHESIS_NODES,
  ...TRIGGER_NODES,
  ...IMAGE_NODES,
  ...SKETCH_NODES,
  ...VIDEO_NODES,
  ...TIMELINE_NODES,
  ...AGENT_NODES,
  ...GENERATOR_NODES,
  ...MODEL3D_NODES,
  ...LIB_OS_NODES,
  ...LIB_MARKDOWN_NODES,
  ...LIB_SECRET_NODES,
  ...LIB_PANDOC_NODES,
  ...LIB_YTDLP_NODES,
  ...LIB_GRID_NODES,
  ...LIB_SVG_NODES,
  ...LIB_IMAGE_ENHANCE_NODES,
  ...LIB_IMAGE_FILTER_NODES,
  ...LIB_IMAGE_DRAW_NODES,
  ...LIB_IMAGE_COLOR_GRADING_NODES,
  ...LIB_RSS_NODES,
  ...LIB_AUDIO_DSP_NODES,
  ...LIB_SQLITE_NODES,
  ...LIB_SUPABASE_NODES,
  ...LIB_S3_NODES,
  ...LIB_EXCEL_NODES,
  ...LIB_DOCX_NODES,
  ...LIB_BEAUTIFULSOUP_NODES,
  ...LIB_BROWSER_NODES,
  ...LIB_HTTP_NODES,
  ...LIB_GRAPHQL_NODES,
  ...LIB_MAIL_NODES,
  ...LIB_TWILIO_NODES,
  ...LIB_MARKITDOWN_NODES,
  ...LIB_SEABORN_NODES,
  ...LIB_PEDALBOARD_EXTRA_NODES,
  ...LIB_PDF_NODES,
  ...LIB_EPUB_NODES,
  ...LIB_PPTX_NODES,
  ...LIB_OCR_NODES,
  ...LIB_TENSORFLOW_NODES,
  ...LIB_NOTION_NODES,
  ...KIE_DYNAMIC_NODES,
  ...VECTOR_NODES,
  ...GEMINI_NODES,
  ...APIFY_NODES,
  ...COMFY_NODES,
  ...MESSAGING_NODES,
  ...MISTRAL_NODES,
  ...OPENAI_NODES,
  ...XAI_NODES,
  ...SEARCH_NODES,
  ...TOOL_AGENT_NODES,
  ...SANDBOX_NODES,
  ...LIB_NLP_NODES,
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
