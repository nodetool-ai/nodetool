import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";

export {
  IfNode,
  ForEachNode,
  CollectNode,
  RerouteNode,
  SwitchNode,
  TryCatchNode,
  CONTROL_NODES
} from "./nodes/control.js";
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
  TemplateTextNode,
  ReplaceTextNode,
  ToStringNode,
  TEXT_EXTRA_NODES
} from "./nodes/text-extra.js";
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
} from "./nodes/constant.js";
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
} from "./nodes/input.js";
export { OutputNode, PreviewNode, OUTPUT_NODES } from "./nodes/output.js";
export { WorkflowNode, WORKFLOW_NODES } from "./nodes/workflow.js";
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
} from "./nodes/workspace.js";
export { CompareImagesNode, COMPARE_NODES } from "./nodes/compare.js";
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
} from "./nodes/document.js";
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
  RowIteratorNode,
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
} from "./nodes/data.js";
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
} from "./nodes/code.js";
export { CodeNode } from "./nodes/code-node.js";
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
} from "./nodes/audio.js";
export {
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
  TRIGGER_NODES
} from "./nodes/triggers.js";
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
  CropNode,
  FitNode,
  RotateNode,
  FlipNode,
  TextToImageNode,
  ImageToImageNode,
  IMAGE_NODES
} from "./nodes/image.js";
export {
  TextToVideoNode,
  ImageToVideoNode,
  LoadVideoFileNode,
  SaveVideoFileVideoNode,
  LoadVideoAssetsNode,
  SaveVideoNode,
  FrameIteratorNode,
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
  VIDEO_NODES
} from "./nodes/video.js";
export {
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  AGENT_NODES
} from "./nodes/agents.js";
export {
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode,
  GENERATOR_NODES
} from "./nodes/generators.js";
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
} from "./nodes/model3d.js";
export { LIB_COMPAT_PY_NODES } from "./nodes/lib-compat.js";
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
} from "./nodes/lib-os.js";
export {
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  LIB_MARKDOWN_NODES
} from "./nodes/lib-markdown.js";
export { GetSecretLibNode, LIB_SECRET_NODES } from "./nodes/lib-secret.js";
export {
  ConvertFilePandocLibNode,
  ConvertTextPandocLibNode,
  LIB_PANDOC_NODES
} from "./nodes/lib-doc-transform.js";
export {
  YtDlpDownloadLibNode,
  LIB_YTDLP_NODES
} from "./nodes/lib-video-download.js";
export {
  SliceImageGridLibNode,
  CombineImageGridLibNode,
  LIB_GRID_NODES
} from "./nodes/lib-grid.js";
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
} from "./nodes/lib-svg.js";
export { LIB_IMAGE_ENHANCE_NODES } from "./nodes/lib-image-enhance.js";
export { LIB_IMAGE_FILTER_NODES } from "./nodes/lib-image-filter.js";
export { LIB_IMAGE_DRAW_NODES } from "./nodes/lib-image-draw.js";
export { LIB_IMAGE_COLOR_GRADING_NODES } from "./nodes/lib-image-color-grading.js";
// Backward compatibility: existing tests that import LIB_PILLOW_NODES still work
import { LIB_IMAGE_ENHANCE_NODES as _LIB_IMAGE_ENHANCE_NODES } from "./nodes/lib-image-enhance.js";
import { LIB_IMAGE_FILTER_NODES as _LIB_IMAGE_FILTER_NODES } from "./nodes/lib-image-filter.js";
import { LIB_IMAGE_DRAW_NODES as _LIB_IMAGE_DRAW_NODES } from "./nodes/lib-image-draw.js";
import { LIB_IMAGE_COLOR_GRADING_NODES as _LIB_IMAGE_COLOR_GRADING_NODES } from "./nodes/lib-image-color-grading.js";
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
  BrowserNavigationLibNode,
  SpiderCrawlLibNode,
  LIB_BROWSER_NODES
} from "./nodes/lib-browser.js";
export {
  HttpGetTextNode,
  HttpGetJsonNode,
  HttpGetBytesNode,
  HttpPostNode,
  HttpPutNode,
  HttpPatchNode,
  HttpDeleteNode,
  LIB_HTTP_NODES
} from "./nodes/lib-http.js";
export {
  GraphQLQueryLibNode,
  GraphQLQueryWithAuthLibNode,
  GraphQLIntrospectionLibNode,
  GraphQLBatchQueryLibNode,
  LIB_GRAPHQL_NODES
} from "./nodes/lib-graphql.js";
export {
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  LIB_MAIL_NODES
} from "./nodes/lib-mail.js";
export {
  TwilioSendSMSLibNode,
  TwilioSendWhatsAppLibNode,
  TwilioGetMessagesLibNode,
  TwilioLookupLibNode,
  LIB_TWILIO_NODES
} from "./nodes/lib-twilio.js";
export {
  ConvertToMarkdownLibNode,
  LIB_MARKITDOWN_NODES
} from "./nodes/lib-doc-convert.js";
export { ChartRendererLibNode, LIB_SEABORN_NODES } from "./nodes/lib-charts.js";
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
} from "./nodes/lib-html-parse.js";
export {
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode,
  LIB_RSS_NODES
} from "./nodes/lib-rss.js";
export {
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode,
  LIB_AUDIO_DSP_NODES
} from "./nodes/lib-audio-dsp.js";
export {
  CreateTableLibNode,
  InsertLibNode as SqliteInsertLibNode,
  QueryLibNode,
  UpdateLibNode as SqliteUpdateLibNode,
  DeleteLibNode as SqliteDeleteLibNode,
  ExecuteSQLLibNode,
  GetDatabasePathLibNode,
  LIB_SQLITE_NODES
} from "./nodes/lib-sqlite.js";
export {
  SelectLibNode,
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode,
  RPCLibNode,
  LIB_SUPABASE_NODES
} from "./nodes/lib-supabase.js";
export {
  NotionSearchLibNode,
  NotionGetPageLibNode,
  NotionGetPageContentLibNode,
  NotionCreatePageLibNode,
  NotionUpdatePageLibNode,
  NotionQueryDatabaseLibNode,
  LIB_NOTION_NODES
} from "./nodes/lib-notion.js";
export {
  S3ListBucketsLibNode,
  S3ListObjectsLibNode,
  S3GetObjectLibNode,
  S3PutObjectLibNode,
  S3DeleteObjectLibNode,
  S3CopyObjectLibNode,
  S3GetPresignedUrlLibNode,
  LIB_S3_NODES
} from "./nodes/lib-s3.js";
export {
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
  LIB_EXCEL_NODES
} from "./nodes/lib-excel.js";
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
} from "./nodes/lib-docx.js";
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
} from "./nodes/lib-audio-effects.js";
export {
  PdfPageCountNode,
  PdfExtractTextNode,
  PdfExtractMarkdownNode,
  PdfExtractTablesNode,
  PdfExtractTextBlocksNode,
  PdfExtractStyledTextNode,
  PdfPageMetadataNode,
  LIB_PDF_NODES
} from "./nodes/lib-pdf.js";
export {
  KieAINode,
  KIE_DYNAMIC_NODES,
  resolveKieDynamicSchema
} from "./nodes/kie-dynamic.js";
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
} from "./nodes/vector.js";
export { GEMINI_NODES } from "./nodes/gemini.js";
export { APIFY_NODES } from "./nodes/apify.js";
export { MESSAGING_NODES } from "./nodes/messaging.js";
export { MISTRAL_NODES } from "./nodes/mistral.js";
export { OPENAI_NODES } from "./nodes/openai.js";
export { SEARCH_NODES } from "./nodes/search.js";
export { TOOL_AGENT_NODES } from "./nodes/tool-agents.js";
export { ANTHROPIC_NODES } from "./nodes/anthropic.js";
export { TeamAgentNode, TeamLeadNode, TEAM_NODES } from "./nodes/team.js";
export {
  SentimentAnalysisLibNode,
  TokenizeLibNode,
  StemLibNode,
  TfIdfLibNode,
  ClassifyTextLibNode,
  ExtractEntitiesLibNode,
  PhoneticMatchLibNode,
  LIB_NLP_NODES
} from "./nodes/lib-nlp.js";
import { CONTROL_NODES } from "./nodes/control.js";
import { TEXT_EXTRA_NODES } from "./nodes/text-extra.js";
import { CONSTANT_NODES } from "./nodes/constant.js";
import { EXTENDED_PLACEHOLDER_NODES } from "./nodes/extended-placeholders.js";
import { INPUT_NODES } from "./nodes/input.js";
import { OUTPUT_NODES } from "./nodes/output.js";
import { WORKFLOW_NODES } from "./nodes/workflow.js";
import { WORKSPACE_NODES } from "./nodes/workspace.js";
import { COMPARE_NODES } from "./nodes/compare.js";
import { DOCUMENT_NODES } from "./nodes/document.js";
import { DATA_NODES } from "./nodes/data.js";
import { CODE_NODES } from "./nodes/code.js";
import { CodeNode } from "./nodes/code-node.js";
import { AUDIO_NODES } from "./nodes/audio.js";
import { TRIGGER_NODES } from "./nodes/triggers.js";
import { IMAGE_NODES } from "./nodes/image.js";
import { VIDEO_NODES } from "./nodes/video.js";
import { AGENT_NODES } from "./nodes/agents.js";
import { GENERATOR_NODES } from "./nodes/generators.js";
import { MODEL3D_NODES } from "./nodes/model3d.js";
import { LIB_COMPAT_PY_NODES } from "./nodes/lib-compat.js";
import { LIB_OS_NODES } from "./nodes/lib-os.js";
import { LIB_MARKDOWN_NODES } from "./nodes/lib-markdown.js";
import { LIB_SECRET_NODES } from "./nodes/lib-secret.js";
import { LIB_PANDOC_NODES } from "./nodes/lib-doc-transform.js";
import { LIB_YTDLP_NODES } from "./nodes/lib-video-download.js";
import { LIB_GRID_NODES } from "./nodes/lib-grid.js";
import { LIB_SVG_NODES } from "./nodes/lib-svg.js";
import { LIB_IMAGE_ENHANCE_NODES } from "./nodes/lib-image-enhance.js";
import { LIB_IMAGE_FILTER_NODES } from "./nodes/lib-image-filter.js";
import { LIB_IMAGE_DRAW_NODES } from "./nodes/lib-image-draw.js";
import { LIB_IMAGE_COLOR_GRADING_NODES } from "./nodes/lib-image-color-grading.js";
import { LIB_RSS_NODES } from "./nodes/lib-rss.js";
import { LIB_AUDIO_DSP_NODES } from "./nodes/lib-audio-dsp.js";
import { LIB_SQLITE_NODES } from "./nodes/lib-sqlite.js";
import { LIB_SUPABASE_NODES } from "./nodes/lib-supabase.js";
import { LIB_S3_NODES } from "./nodes/lib-s3.js";
import { LIB_EXCEL_NODES } from "./nodes/lib-excel.js";
import { LIB_DOCX_NODES } from "./nodes/lib-docx.js";
import { LIB_BEAUTIFULSOUP_NODES } from "./nodes/lib-html-parse.js";
import { LIB_BROWSER_NODES } from "./nodes/lib-browser.js";
import { LIB_HTTP_NODES } from "./nodes/lib-http.js";
import { LIB_GRAPHQL_NODES } from "./nodes/lib-graphql.js";
import { LIB_MAIL_NODES } from "./nodes/lib-mail.js";
import { LIB_TWILIO_NODES } from "./nodes/lib-twilio.js";
import { LIB_MARKITDOWN_NODES } from "./nodes/lib-doc-convert.js";
import { LIB_SEABORN_NODES } from "./nodes/lib-charts.js";
import { LIB_PEDALBOARD_EXTRA_NODES } from "./nodes/lib-audio-effects.js";
import { LIB_PDF_NODES } from "./nodes/lib-pdf.js";
import { LIB_NOTION_NODES } from "./nodes/lib-notion.js";
import { KIE_DYNAMIC_NODES } from "./nodes/kie-dynamic.js";
import { VECTOR_NODES } from "./nodes/vector.js";
import { GEMINI_NODES } from "./nodes/gemini.js";
import { APIFY_NODES } from "./nodes/apify.js";
import { MESSAGING_NODES } from "./nodes/messaging.js";
import { MISTRAL_NODES } from "./nodes/mistral.js";
import { OPENAI_NODES } from "./nodes/openai.js";
import { SEARCH_NODES } from "./nodes/search.js";
import { TOOL_AGENT_NODES } from "./nodes/tool-agents.js";
import { ANTHROPIC_NODES } from "./nodes/anthropic.js";
import { TEAM_NODES } from "./nodes/team.js";
import { LIB_NLP_NODES } from "./nodes/lib-nlp.js";

export const ALL_BASE_NODES: readonly NodeClass[] = [
  ...CONTROL_NODES,
  ...TEXT_EXTRA_NODES,
  ...CONSTANT_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...INPUT_NODES,
  ...OUTPUT_NODES,
  ...WORKFLOW_NODES,
  ...WORKSPACE_NODES,
  ...COMPARE_NODES,
  ...DOCUMENT_NODES,
  ...DATA_NODES,
  ...CODE_NODES,
  CodeNode,
  ...AUDIO_NODES,
  ...TRIGGER_NODES,
  ...IMAGE_NODES,
  ...VIDEO_NODES,
  ...AGENT_NODES,
  ...GENERATOR_NODES,
  ...MODEL3D_NODES,
  ...LIB_COMPAT_PY_NODES,
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
  ...LIB_NOTION_NODES,
  ...KIE_DYNAMIC_NODES,
  ...VECTOR_NODES,
  ...GEMINI_NODES,
  ...APIFY_NODES,
  ...MESSAGING_NODES,
  ...MISTRAL_NODES,
  ...OPENAI_NODES,
  ...SEARCH_NODES,
  ...TOOL_AGENT_NODES,
  ...ANTHROPIC_NODES,
  ...TEAM_NODES,
  ...LIB_NLP_NODES
];

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
          basic_fields: ["value"]
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
          is_dynamic: true,
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
          basic_fields: []
        }
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
