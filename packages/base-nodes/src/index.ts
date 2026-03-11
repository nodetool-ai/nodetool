import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";

export {
  IfNode,
  ForEachNode,
  CollectNode,
  RerouteNode,
  CONTROL_NODES,
} from "./nodes/control.js";
export {
  ConditionalSwitchNode,
  LogicalOperatorNode,
  NotNode,
  CompareNode,
  IsNoneNode,
  IsInNode,
  AllNode,
  SomeNode,
  BOOLEAN_NODES,
} from "./nodes/boolean.js";
export {
  LengthNode,
  ListRangeNode,
  GenerateSequenceNode,
  SliceNode,
  SelectElementsNode,
  GetElementNode,
  AppendNode,
  ExtendNode,
  DedupeNode,
  ReverseNode,
  RandomizeNode,
  SortNode,
  IntersectionNode,
  UnionNode,
  DifferenceNode,
  ChunkNode,
  SumNode,
  AverageNode,
  MinimumNode,
  MaximumNode,
  ProductNode,
  FlattenNode,
  SaveListNode,
  LIST_NODES,
} from "./nodes/list.js";
export {
  ToStringNode,
  ConcatTextNode,
  JoinTextNode,
  ReplaceTextNode,
  CollectTextNode,
  FormatTextNode,
  TemplateTextNode,
  TEXT_NODES,
} from "./nodes/text.js";
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
  TEXT_EXTRA_NODES,
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
  CONSTANT_NODES,
} from "./nodes/constant.js";
export {
  FilterNumberNode,
  FilterNumberRangeNode,
  NUMBERS_NODES,
} from "./nodes/numbers.js";
export {
  GetValueNode,
  UpdateDictionaryNode,
  RemoveDictionaryKeyNode,
  ParseJSONNode,
  ZipDictionaryNode,
  CombineDictionaryNode,
  FilterDictionaryNode,
  ReduceDictionariesNode,
  MakeDictionaryNode,
  ArgMaxNode,
  ToJSONNode,
  ToYAMLNode,
  LoadCSVFileNode,
  SaveCSVFileNode,
  FilterDictByQueryNode,
  FilterDictByNumberNode,
  FilterDictByRangeNode,
  FilterDictRegexNode,
  FilterDictByValueNode,
  DICTIONARY_NODES,
} from "./nodes/dictionary.js";
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
  INPUT_NODES,
} from "./nodes/input.js";
export { OutputNode, PreviewNode, OUTPUT_NODES } from "./nodes/output.js";
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
  WORKSPACE_NODES,
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
  DOCUMENT_NODES,
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
  DATA_NODES,
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
  CODE_NODES,
} from "./nodes/code.js";
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
  AudioToNumpyNode,
  NumpyToAudioNode,
  TrimAudioNode,
  ConvertToArrayNode,
  CreateSilenceNode,
  ConcatAudioNode,
  ConcatAudioListNode,
  TextToSpeechNode,
  ChunkToAudioNode,
  AUDIO_NODES,
} from "./nodes/audio.js";
export {
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
  TRIGGER_NODES,
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
  TextToImageNode,
  ImageToImageNode,
  IMAGE_NODES,
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
  VIDEO_NODES,
} from "./nodes/video.js";
export {
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  ControlAgentNode,
  ResearchAgentNode,
  AGENT_NODES,
} from "./nodes/agents.js";
export {
  StructuredOutputGeneratorNode,
  DataGeneratorNode,
  ListGeneratorNode,
  ChartGeneratorNode,
  SVGGeneratorNode,
  GENERATOR_NODES,
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
  MODEL3D_NODES,
} from "./nodes/model3d.js";
export {
  GenerateUUID4Node,
  GenerateUUID1Node,
  GenerateUUID3Node,
  GenerateUUID5Node,
  ParseUUIDNode,
  FormatUUIDNode,
  IsValidUUIDNode,
  UUID_NODES,
} from "./nodes/uuid.js";
export { LIB_COMPAT_PY_NODES } from "./nodes/lib-compat.js";
export {
  AddArrayNode,
  SubtractArrayNode,
  MultiplyArrayNode,
  DivideArrayNode,
  ModulusArrayNode,
  AbsArrayNode,
  SineArrayNode,
  CosineArrayNode,
  ExpArrayNode,
  LogArrayNode,
  SqrtArrayNode,
  PowerArrayNode,
  SumArrayNode,
  MeanArrayNode,
  MinArrayNode,
  MaxArrayNode,
  ArgMinArrayNode,
  ArgMaxArrayNode,
  SliceArrayNode,
  IndexArrayNode,
  TransposeArrayNode,
  MatMulNode,
  StackNode,
  SplitArrayNode,
  Reshape1DNode,
  Reshape2DNode,
  Reshape3DNode,
  Reshape4DNode,
  ListToArrayNode,
  ArrayToListNode,
  ScalarToArrayNode,
  ArrayToScalarNode,
  ConvertToImageNode as NumpyConvertToImageNode,
  ConvertToAudioNode as NumpyConvertToAudioNode,
  ConvertToArrayNumpyNode,
  SaveArrayNode,
  BinaryOperationNode,
  PlotArrayNode,
  LIB_NUMPY_NODES,
} from "./nodes/lib-numpy.js";
export {
  AddLibNode,
  SubtractLibNode,
  MultiplyLibNode,
  DivideLibNode,
  ModulusLibNode,
  MathFunctionLibNode,
  SineLibNode,
  CosineLibNode,
  PowerLibNode,
  SqrtLibNode,
  LIB_MATH_NODES,
} from "./nodes/lib-math.js";
export {
  ParseDictLibNode,
  ParseListLibNode,
  StringifyJSONLibNode,
  GetJSONPathStrLibNode,
  GetJSONPathIntLibNode,
  GetJSONPathFloatLibNode,
  GetJSONPathBoolLibNode,
  GetJSONPathListLibNode,
  GetJSONPathDictLibNode,
  ValidateJSONLibNode,
  FilterJSONLibNode,
  JSONTemplateLibNode,
  LoadJSONAssetsLibNode,
  LIB_JSON_NODES,
} from "./nodes/lib-json.js";
export {
  TodayLibNode,
  NowLibNode,
  ParseDateLibNode,
  ParseDateTimeLibNode,
  AddTimeDeltaLibNode,
  DateDifferenceLibNode,
  FormatDateTimeLibNode,
  GetWeekdayLibNode,
  DateRangeLibNode,
  IsDateInRangeLibNode,
  GetQuarterLibNode,
  DateToDatetimeLibNode,
  DatetimeToDateLibNode,
  RelativeTimeLibNode,
  BoundaryTimeLibNode,
  LIB_DATE_NODES,
} from "./nodes/lib-date.js";
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
  LIB_OS_NODES,
} from "./nodes/lib-os.js";
export {
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
  LIB_MARKDOWN_NODES,
} from "./nodes/lib-markdown.js";
export { GetSecretLibNode, LIB_SECRET_NODES } from "./nodes/lib-secret.js";
export {
  GetRequestLibNode,
  PostRequestLibNode,
  PutRequestLibNode,
  DeleteRequestLibNode,
  HeadRequestLibNode,
  FetchPageLibNode,
  ImageDownloaderLibNode,
  GetRequestBinaryLibNode,
  GetRequestDocumentLibNode,
  PostRequestBinaryLibNode,
  DownloadDataframeLibNode,
  FilterValidURLsLibNode,
  DownloadFilesLibNode,
  JSONPostRequestLibNode,
  JSONPutRequestLibNode,
  JSONPatchRequestLibNode,
  JSONGetRequestLibNode,
  LIB_HTTP_NODES,
} from "./nodes/lib-http.js";
export {
  ConvertFilePandocLibNode,
  ConvertTextPandocLibNode,
  LIB_PANDOC_NODES,
} from "./nodes/lib-pandoc.js";
export { YtDlpDownloadLibNode, LIB_YTDLP_NODES } from "./nodes/lib-ytdlp.js";
export {
  SliceImageGridLibNode,
  CombineImageGridLibNode,
  LIB_GRID_NODES,
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
  LIB_SVG_NODES,
} from "./nodes/lib-svg.js";
export { LIB_PILLOW_NODES } from "./nodes/lib-pillow.js";
export {
  WebFetchLibNode,
  DownloadFileLibNode,
  BrowserLibNode,
  ScreenshotLibNode,
  BrowserNavigationLibNode,
  SpiderCrawlLibNode,
  LIB_BROWSER_NODES,
} from "./nodes/lib-browser.js";
export {
  SendEmailLibNode,
  GmailSearchLibNode,
  AddLabelLibNode,
  MoveToArchiveLibNode,
  LIB_MAIL_NODES,
} from "./nodes/lib-mail.js";
export {
  ConvertToMarkdownLibNode,
  LIB_MARKITDOWN_NODES,
} from "./nodes/lib-markitdown.js";
export {
  ChartRendererLibNode,
  LIB_SEABORN_NODES,
} from "./nodes/lib-seaborn.js";
export {
  BaseUrlLibNode,
  ExtractLinksLibNode,
  ExtractImagesLibNode,
  ExtractAudioLibNode,
  ExtractVideosLibNode,
  ExtractMetadataLibNode,
  HTMLToTextLibNode,
  WebsiteContentExtractorLibNode,
  LIB_BEAUTIFULSOUP_NODES,
} from "./nodes/lib-beautifulsoup.js";
export {
  FetchRSSFeedLibNode,
  ExtractFeedMetadataLibNode,
  LIB_RSS_NODES,
} from "./nodes/lib-rss.js";
export {
  OscillatorLibNode,
  WhiteNoiseLibNode,
  PinkNoiseLibNode,
  FM_SynthesisLibNode,
  EnvelopeLibNode,
  LIB_SYNTHESIS_NODES,
} from "./nodes/lib-synthesis.js";
export {
  AmplitudeToDBNode,
  DBToAmplitudeNode,
  DBToPowerNode,
  PowerToDBNode,
  PlotSpectrogramNode,
  GainNode_,
  DelayNode_,
  HighPassFilterNode,
  LowPassFilterNode,
  HighShelfFilterNode,
  LowShelfFilterNode,
  PeakFilterNode,
  LIB_AUDIO_DSP_NODES,
} from "./nodes/lib-audio-dsp.js";
export {
  CreateTableLibNode,
  InsertLibNode as SqliteInsertLibNode,
  QueryLibNode,
  UpdateLibNode as SqliteUpdateLibNode,
  DeleteLibNode as SqliteDeleteLibNode,
  ExecuteSQLLibNode,
  GetDatabasePathLibNode,
  LIB_SQLITE_NODES,
} from "./nodes/lib-sqlite.js";
export {
  SelectLibNode,
  InsertLibNode as SupabaseInsertLibNode,
  UpdateLibNode as SupabaseUpdateLibNode,
  DeleteLibNode as SupabaseDeleteLibNode,
  UpsertLibNode,
  RPCLibNode,
  LIB_SUPABASE_NODES,
} from "./nodes/lib-supabase.js";
export {
  CreateWorkbookLibNode,
  ExcelToDataFrameLibNode,
  DataFrameToExcelLibNode,
  FormatCellsLibNode,
  AutoFitColumnsLibNode,
  SaveWorkbookLibNode,
  LIB_EXCEL_NODES,
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
  LIB_DOCX_NODES,
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
  LIB_PEDALBOARD_EXTRA_NODES,
} from "./nodes/lib-pedalboard-extra.js";
export {
  GetPageCountPdfPlumberNode,
  ExtractTextPdfPlumberNode,
  ExtractPageMetadataPdfPlumberNode,
  ExtractTablesPdfPlumberNode,
  ExtractImagesPdfPlumberNode,
  ExtractTextPyMuPdfNode,
  ExtractMarkdownPyMuPdfNode,
  ExtractTextBlocksPyMuPdfNode,
  ExtractTextWithStylePyMuPdfNode,
  ExtractTablesPyMuPdfNode,
  LIB_PDF_NODES,
} from "./nodes/lib-pdf.js";
export {
  STFTNode,
  MelSpectrogramNode,
  MFCCNode,
  ChromaSTFTNode,
  SpectralCentroidNode,
  SpectralContrastNode,
  GriffinLimNode,
  DetectOnsetsNode,
  SegmentAudioByOnsetsNode,
  SaveAudioSegmentsNode,
  LIB_LIBROSA_SPECTRAL_NODES,
} from "./nodes/lib-librosa-spectral.js";
export { PaddleOCRLibNode, LIB_OCR_NODES } from "./nodes/lib-ocr.js";
export { KIE_IMAGE_NODES } from "./nodes/kie-image.js";
export { KIE_VIDEO_NODES } from "./nodes/kie-video.js";
export { KIE_AUDIO_NODES } from "./nodes/kie-audio.js";
export { KieAINode, KIE_DYNAMIC_NODES } from "./nodes/kie-dynamic.js";
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
  VECTOR_CHROMA_NODES,
} from "./nodes/vector-chroma.js";
export {
  CreateIndexFlatL2Node,
  CreateIndexFlatIPNode,
  CreateIndexIVFFlatNode,
  TrainIndexNode,
  AddVectorsNode,
  AddWithIdsNode,
  SearchNode as FaissSearchNode,
  VECTOR_FAISS_NODES,
} from "./nodes/vector-faiss.js";
export { GEMINI_NODES } from "./nodes/gemini.js";
export { APIFY_NODES } from "./nodes/apify.js";
export { MESSAGING_NODES } from "./nodes/messaging.js";
export { MISTRAL_NODES } from "./nodes/mistral.js";
export { OPENAI_NODES } from "./nodes/openai.js";
export { SEARCH_NODES } from "./nodes/search.js";
export { SKILLS_NODES } from "./nodes/skills.js";
export { ANTHROPIC_NODES } from "./nodes/anthropic.js";

import { CONTROL_NODES } from "./nodes/control.js";
import { BOOLEAN_NODES } from "./nodes/boolean.js";
import { LIST_NODES } from "./nodes/list.js";
import { TEXT_NODES } from "./nodes/text.js";
import { TEXT_EXTRA_NODES } from "./nodes/text-extra.js";
import { CONSTANT_NODES } from "./nodes/constant.js";
import { NUMBERS_NODES } from "./nodes/numbers.js";
import { DICTIONARY_NODES } from "./nodes/dictionary.js";
import { EXTENDED_PLACEHOLDER_NODES } from "./nodes/extended-placeholders.js";
import { INPUT_NODES } from "./nodes/input.js";
import { OUTPUT_NODES } from "./nodes/output.js";
import { WORKSPACE_NODES } from "./nodes/workspace.js";
import { COMPARE_NODES } from "./nodes/compare.js";
import { DOCUMENT_NODES } from "./nodes/document.js";
import { DATA_NODES } from "./nodes/data.js";
import { CODE_NODES } from "./nodes/code.js";
import { AUDIO_NODES } from "./nodes/audio.js";
import { TRIGGER_NODES } from "./nodes/triggers.js";
import { IMAGE_NODES } from "./nodes/image.js";
import { VIDEO_NODES } from "./nodes/video.js";
import { AGENT_NODES } from "./nodes/agents.js";
import { GENERATOR_NODES } from "./nodes/generators.js";
import { MODEL3D_NODES } from "./nodes/model3d.js";
import { UUID_NODES } from "./nodes/uuid.js";
import { LIB_COMPAT_PY_NODES } from "./nodes/lib-compat.js";
import { LIB_NUMPY_NODES } from "./nodes/lib-numpy.js";
import { LIB_MATH_NODES } from "./nodes/lib-math.js";
import { LIB_JSON_NODES } from "./nodes/lib-json.js";
import { LIB_DATE_NODES } from "./nodes/lib-date.js";
import { LIB_OS_NODES } from "./nodes/lib-os.js";
import { LIB_MARKDOWN_NODES } from "./nodes/lib-markdown.js";
import { LIB_SECRET_NODES } from "./nodes/lib-secret.js";
import { LIB_HTTP_NODES } from "./nodes/lib-http.js";
import { LIB_PANDOC_NODES } from "./nodes/lib-pandoc.js";
import { LIB_YTDLP_NODES } from "./nodes/lib-ytdlp.js";
import { LIB_GRID_NODES } from "./nodes/lib-grid.js";
import { LIB_SVG_NODES } from "./nodes/lib-svg.js";
import { LIB_PILLOW_NODES } from "./nodes/lib-pillow.js";
import { LIB_RSS_NODES } from "./nodes/lib-rss.js";
import { LIB_SYNTHESIS_NODES } from "./nodes/lib-synthesis.js";
import { LIB_AUDIO_DSP_NODES } from "./nodes/lib-audio-dsp.js";
import { LIB_SQLITE_NODES } from "./nodes/lib-sqlite.js";
import { LIB_SUPABASE_NODES } from "./nodes/lib-supabase.js";
import { LIB_EXCEL_NODES } from "./nodes/lib-excel.js";
import { LIB_DOCX_NODES } from "./nodes/lib-docx.js";
import { LIB_BEAUTIFULSOUP_NODES } from "./nodes/lib-beautifulsoup.js";
import { LIB_BROWSER_NODES } from "./nodes/lib-browser.js";
import { LIB_MAIL_NODES } from "./nodes/lib-mail.js";
import { LIB_MARKITDOWN_NODES } from "./nodes/lib-markitdown.js";
import { LIB_SEABORN_NODES } from "./nodes/lib-seaborn.js";
import { LIB_PEDALBOARD_EXTRA_NODES } from "./nodes/lib-pedalboard-extra.js";
import { LIB_PDF_NODES } from "./nodes/lib-pdf.js";
import { LIB_LIBROSA_SPECTRAL_NODES } from "./nodes/lib-librosa-spectral.js";
import { LIB_OCR_NODES } from "./nodes/lib-ocr.js";
import { KIE_IMAGE_NODES } from "./nodes/kie-image.js";
import { KIE_VIDEO_NODES } from "./nodes/kie-video.js";
import { KIE_AUDIO_NODES } from "./nodes/kie-audio.js";
import { KIE_DYNAMIC_NODES } from "./nodes/kie-dynamic.js";
import { VECTOR_CHROMA_NODES } from "./nodes/vector-chroma.js";
import { VECTOR_FAISS_NODES } from "./nodes/vector-faiss.js";
import { GEMINI_NODES } from "./nodes/gemini.js";
import { APIFY_NODES } from "./nodes/apify.js";
import { MESSAGING_NODES } from "./nodes/messaging.js";
import { MISTRAL_NODES } from "./nodes/mistral.js";
import { OPENAI_NODES } from "./nodes/openai.js";
import { SEARCH_NODES } from "./nodes/search.js";
import { SKILLS_NODES } from "./nodes/skills.js";
import { ANTHROPIC_NODES } from "./nodes/anthropic.js";

export const ALL_BASE_NODES: readonly NodeClass[] = [
  ...CONTROL_NODES,
  ...BOOLEAN_NODES,
  ...LIST_NODES,
  ...TEXT_NODES,
  ...TEXT_EXTRA_NODES,
  ...CONSTANT_NODES,
  ...NUMBERS_NODES,
  ...DICTIONARY_NODES,
  ...EXTENDED_PLACEHOLDER_NODES,
  ...INPUT_NODES,
  ...OUTPUT_NODES,
  ...WORKSPACE_NODES,
  ...COMPARE_NODES,
  ...DOCUMENT_NODES,
  ...DATA_NODES,
  ...CODE_NODES,
  ...AUDIO_NODES,
  ...TRIGGER_NODES,
  ...IMAGE_NODES,
  ...VIDEO_NODES,
  ...AGENT_NODES,
  ...GENERATOR_NODES,
  ...MODEL3D_NODES,
  ...UUID_NODES,
  ...LIB_COMPAT_PY_NODES,
  ...LIB_NUMPY_NODES,
  ...LIB_MATH_NODES,
  ...LIB_JSON_NODES,
  ...LIB_DATE_NODES,
  ...LIB_OS_NODES,
  ...LIB_MARKDOWN_NODES,
  ...LIB_SECRET_NODES,
  ...LIB_HTTP_NODES,
  ...LIB_PANDOC_NODES,
  ...LIB_YTDLP_NODES,
  ...LIB_GRID_NODES,
  ...LIB_SVG_NODES,
  ...LIB_PILLOW_NODES,
  ...LIB_RSS_NODES,
  ...LIB_SYNTHESIS_NODES,
  ...LIB_AUDIO_DSP_NODES,
  ...LIB_SQLITE_NODES,
  ...LIB_SUPABASE_NODES,
  ...LIB_EXCEL_NODES,
  ...LIB_DOCX_NODES,
  ...LIB_BEAUTIFULSOUP_NODES,
  ...LIB_BROWSER_NODES,
  ...LIB_MAIL_NODES,
  ...LIB_MARKITDOWN_NODES,
  ...LIB_SEABORN_NODES,
  ...LIB_PEDALBOARD_EXTRA_NODES,
  ...LIB_PDF_NODES,
  ...LIB_LIBROSA_SPECTRAL_NODES,
  ...LIB_OCR_NODES,
  ...KIE_IMAGE_NODES,
  ...KIE_VIDEO_NODES,
  ...KIE_AUDIO_NODES,
  ...KIE_DYNAMIC_NODES,
  ...VECTOR_CHROMA_NODES,
  ...VECTOR_FAISS_NODES,
  ...GEMINI_NODES,
  ...APIFY_NODES,
  ...MESSAGING_NODES,
  ...MISTRAL_NODES,
  ...OPENAI_NODES,
  ...SEARCH_NODES,
  ...SKILLS_NODES,
  ...ANTHROPIC_NODES,
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
            { name: "value", type: { type: "any", type_args: [] }, default: null },
            { name: "name", type: { type: "str", type_args: [] }, default: "" },
          ],
          outputs: [{ name: "output", type: { type: "any", type_args: [] } }],
          basic_fields: ["value"],
        },
      });
      continue;
    }
    registry.register(nodeClass);
  }
}
