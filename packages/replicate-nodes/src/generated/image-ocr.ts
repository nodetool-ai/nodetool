import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class TextExtractOCR extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.TextExtractOCR";
  static readonly title = "Text Extract O C R";
  static readonly description = `A simple OCR Model that can easily extract text from an image.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Image to process" })
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "abiruyt/text-extract-ocr:a524caeaa23495bc9edc805ab08ab5fe943afd3febed884a4f3747aa32e9cd61",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class LatexOCR extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.LatexOCR";
  static readonly title = "Latex O C R";
  static readonly description = `Optical character recognition to turn images of latex equations into latex format.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Input image" })
  declare image_path: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const imagePathRef = this.image_path as Record<string, unknown> | undefined;
    if (isRefSet(imagePathRef)) {
      const imagePathUrl = await assetToUrl(imagePathRef!, apiKey);
      if (imagePathUrl) args["image_path"] = imagePathUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "mickeybeurskens/latex-ocr:b3278fae4c46eb2798804fc66e721e6ce61a450d072041a7e402b2c77805dcc3",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class OCR_Surya extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.OCR_Surya";
  static readonly title = "O C R_ Surya";
  static readonly description = `Surya is a document OCR toolkit that does:
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "enum",
    default: "Run Text Detection",
    values: ["Run Text Detection", "Run OCR"],
    description: "Action"
  })
  declare action: any;

  @prop({ type: "image", default: "", description: "Upload PDF or Image" })
  declare image: any;

  @prop({
    type: "enum",
    default: "English",
    values: [
      "Afrikaans",
      "Albanian",
      "Amharic",
      "Arabic",
      "Armenian",
      "Assamese",
      "Azerbaijani",
      "Basque",
      "Belarusian",
      "Bengali",
      "Bosnian",
      "Breton",
      "Bulgarian",
      "Burmese",
      "Catalan",
      "Chinese",
      "Croatian",
      "Czech",
      "Danish",
      "Dutch",
      "English",
      "Esperanto",
      "Estonian",
      "Finnish",
      "French",
      "Galician",
      "Georgian",
      "German",
      "Greek",
      "Gujarati",
      "Hausa",
      "Hebrew",
      "Hindi",
      "Hungarian",
      "Icelandic",
      "Indonesian",
      "Irish",
      "Italian",
      "Japanese",
      "Javanese",
      "Kannada",
      "Kazakh",
      "Khmer",
      "Korean",
      "Kurdish",
      "Kyrgyz",
      "Lao",
      "Latin",
      "Latvian",
      "Lithuanian",
      "Macedonian",
      "Malagasy",
      "Malay",
      "Malayalam",
      "Marathi",
      "Mongolian",
      "Nepali",
      "Norwegian",
      "Oriya",
      "Oromo",
      "Pashto",
      "Persian",
      "Polish",
      "Portuguese",
      "Punjabi",
      "Romanian",
      "Russian",
      "Sanskrit",
      "Scottish Gaelic",
      "Serbian",
      "Sindhi",
      "Sinhala",
      "Slovak",
      "Slovenian",
      "Somali",
      "Spanish",
      "Sundanese",
      "Swahili",
      "Swedish",
      "Tagalog",
      "Tamil",
      "Telugu",
      "Thai",
      "Turkish",
      "Ukrainian",
      "Urdu",
      "Uyghur",
      "Uzbek",
      "Vietnamese",
      "Welsh",
      "Western Frisian",
      "Xhosa",
      "Yiddish"
    ],
    description: "Languages"
  })
  declare languages_choices: any;

  @prop({
    type: "str",
    default: "English",
    description: "Languages (comma-separated list)"
  })
  declare languages_input: any;

  @prop({ type: "int", default: 1, description: "Page Number" })
  declare page_number: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const action = String(this.action ?? "Run Text Detection");
    const languagesChoices = String(this.languages_choices ?? "English");
    const languagesInput = String(this.languages_input ?? "English");
    const pageNumber = Number(this.page_number ?? 1);

    const args: Record<string, unknown> = {
      action: action,
      languages_choices: languagesChoices,
      languages_input: languagesInput,
      page_number: pageNumber
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "cudanexus/ocr-surya:7ab5bedee2cd1f0c82b2df6718d19bf0b473f738f9db062f122e47e1467f96ce",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_OCR extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.Deepseek_OCR";
  static readonly title = "Deepseek_ O C R";
  static readonly description = `Convert documents to markdown, extract raw text, and locate specific content
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Input image to perform OCR on (supports documents, charts, tables, etc.)"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Reference text to locate in the image (only used for 'Locate Object by Reference' task). Example: 'the teacher', '20-10', 'a red car'"
  })
  declare reference_text: any;

  @prop({
    type: "enum",
    default: "Gundam (Recommended)",
    values: ["Gundam (Recommended)", "Tiny", "Small", "Base", "Large"],
    description: "Model resolution size - affects speed and accuracy trade-off"
  })
  declare resolution_size: any;

  @prop({
    type: "enum",
    default: "Convert to Markdown",
    values: [
      "Convert to Markdown",
      "Free OCR",
      "Parse Figure",
      "Locate Object by Reference"
    ],
    description: "Type of OCR task to perform"
  })
  declare task_type: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const referenceText = String(this.reference_text ?? "");
    const resolutionSize = String(
      this.resolution_size ?? "Gundam (Recommended)"
    );
    const taskType = String(this.task_type ?? "Convert to Markdown");

    const args: Record<string, unknown> = {
      reference_text: referenceText,
      resolution_size: resolutionSize,
      task_type: taskType
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "lucataco/deepseek-ocr:cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Datalab_OCR extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.Datalab_OCR";
  static readonly title = "Datalab_ O C R";
  static readonly description = `Detect and transcribe text in images with accurate bounding boxes, layout analysis, reding order, and table recognition, in 90 languages
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Input file. Must be one of: .pdf, .doc, .docx, .ppt, .pptx, .png, .jpg, .jpeg, .webp"
  })
  declare file: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of pages to process. Cannot be specified if page_range is set - these parameters are mutually exclusive"
  })
  declare max_pages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Page range to parse, comma separated like 0,5-10,20. Example: '0,2-4' will process pages 0, 2, 3, and 4. Cannot be specified if max_pages is set - these parameters are mutually exclusive"
  })
  declare page_range: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Return detailed page information including text lines, bounding boxes, polygons, and character-level data. When disabled, only text and page_count will be returned"
  })
  declare return_pages: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Bypass the server-side cache and force re-processing. By default, identical requests are cached to save time and cost. Enable this to get fresh results"
  })
  declare skip_cache: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Draw red polygons on the input image(s) to visualize detected text regions and return the annotated images"
  })
  declare visualize: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxPages = Number(this.max_pages ?? 0);
    const pageRange = String(this.page_range ?? "");
    const returnPages = Boolean(this.return_pages ?? false);
    const skipCache = Boolean(this.skip_cache ?? false);
    const visualize = Boolean(this.visualize ?? false);

    const args: Record<string, unknown> = {
      max_pages: maxPages,
      page_range: pageRange,
      return_pages: returnPages,
      skip_cache: skipCache,
      visualize: visualize
    };

    const fileRef = this.file as Record<string, unknown> | undefined;
    if (isRefSet(fileRef)) {
      const fileUrl = await assetToUrl(fileRef!, apiKey);
      if (fileUrl) args["file"] = fileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "datalab-to/ocr:3e6db0d5311d6fdc232eea333c1e26055ba4e542180043f12acb2967e5c77f4a",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Marker extends ReplicateNode {
  static readonly nodeType = "replicate.image.ocr.Marker";
  static readonly title = "Marker";
  static readonly description = `Convert PDF to markdown + JSON quickly with high accuracy
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description:
      "Advanced configuration options as JSON string. Options include: 'disable_links' (remove hyperlinks), 'keep_pageheader_in_output' (preserve headers), 'keep_pagefooter_in_output' (preserve footers), 'filter_blank_pages' (skip empty pages), 'drop_repeated_text' (remove duplicates), and layout/table processing thresholds. Full list at: https://documentation.datalab.to/api-reference/marker"
  })
  declare additional_config: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional text prompt to guide output improvements. Use this to specify formatting preferences or extraction requirements, e.g., 'Extract all dates in YYYY-MM-DD format' or 'Keep all tables in their original structure'"
  })
  declare block_correction_prompt: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Skip extracting images from the PDF. By default, images are extracted and returned as base64-encoded data in the images field"
  })
  declare disable_image_extraction: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Disable recognition of inline mathematical expressions during OCR. By default, math expressions are detected and can be formatted as LaTeX"
  })
  declare disable_ocr_math: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Input file. Must be one of: .pdf, .doc, .docx, .ppt, .pptx, .png, .jpg, .jpeg, .webp"
  })
  declare file: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Force OCR on all pages even if text is extractable. By default, Marker automatically uses OCR only when needed (e.g., scanned PDFs). Enable this if you see garbled or incorrect text in the output"
  })
  declare force_ocr: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Detect and format inline mathematical expressions and text styles (bold, italic, etc.) in the output. Useful for documents with mathematical notation"
  })
  declare format_lines: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Include detailed metadata and JSON structure in the output. When enabled, returns json_data (hierarchical document structure with bounding boxes) and metadata (page stats, table of contents). When disabled (default), only returns markdown to reduce response size"
  })
  declare include_metadata: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of pages to process. Cannot be specified if page_range is set - these parameters are mutually exclusive"
  })
  declare max_pages: any;

  @prop({
    type: "enum",
    default: "fast",
    values: ["fast", "balanced", "accurate"],
    description:
      "Processing mode affecting speed and quality. 'fast': lowest latency, preserves most positional information. 'balanced': same as using use_llm. 'accurate': highest quality, slowest, preserves least positional information"
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Page range to parse, comma separated like 0,5-10,20. Example: '0,2-4' will process pages 0, 2, 3, and 4. Cannot be specified if max_pages is set - these parameters are mutually exclusive"
  })
  declare page_range: any;

  @prop({
    type: "str",
    default: "",
    description:
      'Structured extraction: Provide a JSON Schema to extract specific fields from your document. When provided, the model extracts only the fields you define and returns them in the \'extraction_schema_json\' output field (as a JSON string containing your extracted data plus citation fields showing which parts of the document were used). The \'markdown\' and \'json_data\' fields will still contain the full document conversion. Example: {"type":"object","properties":{"invoice_number":{"type":"string"},"total":{"type":"number"}}}. See: https://documentation.datalab.to/docs/recipes/structured-extraction/api-overview. Increases cost by 50%'
  })
  declare page_schema: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Add page separators to the output. Each page will be separated by a horizontal rule containing the page number in the format: \\n\\n{PAGE_NUMBER}\\n{48 dashes}\\n\\n"
  })
  declare paginate: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Save processing checkpoint for iterative refinement. Checkpoints can be used with the Marker Prompt API to apply custom rules without re-parsing the entire document. Only useful for advanced workflows"
  })
  declare save_checkpoint: any;

  @prop({
    type: "str",
    default: "",
    description:
      "JSON Schema for document segmentation. Define segment names and descriptions to identify and extract different sections of the document (e.g., 'Executive Summary', 'Financial Data'). Useful for splitting long documents by section. See: https://documentation.datalab.to/api-reference/marker"
  })
  declare segmentation_schema: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Bypass the server-side cache and force re-processing. By default, identical requests are cached to save time and cost. Enable this to get fresh results"
  })
  declare skip_cache: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Remove embedded OCR text layer from the PDF and re-run OCR from scratch. Some PDFs have low-quality embedded OCR text; this option lets you regenerate it. Ignored if force_ocr is enabled"
  })
  declare strip_existing_ocr: any;

  @prop({
    type: "bool",
    default: false,
    description:
      "Use an LLM to significantly improve accuracy for tables, forms, inline math, and layout detection. This merges tables across pages, handles complex layouts, and extracts form values. Will increase processing time"
  })
  declare use_llm: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const additionalConfig = String(this.additional_config ?? "");
    const blockCorrectionPrompt = String(this.block_correction_prompt ?? "");
    const disableImageExtraction = Boolean(
      this.disable_image_extraction ?? false
    );
    const disableOcrMath = Boolean(this.disable_ocr_math ?? false);
    const forceOcr = Boolean(this.force_ocr ?? false);
    const formatLines = Boolean(this.format_lines ?? false);
    const includeMetadata = Boolean(this.include_metadata ?? false);
    const maxPages = Number(this.max_pages ?? 0);
    const mode = String(this.mode ?? "fast");
    const pageRange = String(this.page_range ?? "");
    const pageSchema = String(this.page_schema ?? "");
    const paginate = Boolean(this.paginate ?? false);
    const saveCheckpoint = Boolean(this.save_checkpoint ?? false);
    const segmentationSchema = String(this.segmentation_schema ?? "");
    const skipCache = Boolean(this.skip_cache ?? false);
    const stripExistingOcr = Boolean(this.strip_existing_ocr ?? false);
    const useLlm = Boolean(this.use_llm ?? false);

    const args: Record<string, unknown> = {
      additional_config: additionalConfig,
      block_correction_prompt: blockCorrectionPrompt,
      disable_image_extraction: disableImageExtraction,
      disable_ocr_math: disableOcrMath,
      force_ocr: forceOcr,
      format_lines: formatLines,
      include_metadata: includeMetadata,
      max_pages: maxPages,
      mode: mode,
      page_range: pageRange,
      page_schema: pageSchema,
      paginate: paginate,
      save_checkpoint: saveCheckpoint,
      segmentation_schema: segmentationSchema,
      skip_cache: skipCache,
      strip_existing_ocr: stripExistingOcr,
      use_llm: useLlm
    };

    const fileRef = this.file as Record<string, unknown> | undefined;
    if (isRefSet(fileRef)) {
      const fileUrl = await assetToUrl(fileRef!, apiKey);
      if (fileUrl) args["file"] = fileUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "datalab-to/marker:60af7e72bef73c71197269b27a98929910d7496806efecac17d9deab596e5239",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_IMAGE_OCR_NODES: readonly NodeClass[] = [
  TextExtractOCR,
  LatexOCR,
  OCR_Surya,
  Deepseek_OCR,
  Datalab_OCR,
  Marker
] as const;
