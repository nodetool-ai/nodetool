# nodetool.metadata.types

## AnthropicModel

## AssetRef

**Fields:**
- **type** (str)
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)

### encode_data_to_uri

**Args:**

### is_empty

**Args:**

### is_set

**Args:**

### to_dict

**Args:**


## AudioChunk

**Fields:**
- **type** (typing.Literal['audio_chunk'])
- **timestamp** (tuple[float, float])
- **text** (str)


## AudioRef

**Fields:**
- **type** (typing.Literal['audio'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)


## BaseType

This is the base class for all Nodetool types.
It is used to create a mapping of type names to their corresponding classes.

**Tags:** 

**Fields:**
- **type** (str)


## BoundingBox

**Fields:**
- **type** (typing.Literal['bounding_box'])
- **xmin** (float)
- **ymin** (float)
- **xmax** (float)
- **ymax** (float)


## CLIP

**Fields:**
- **type** (typing.Literal['comfy.clip'])
- **name** (str)
- **model** (Any)


## CLIPFile

**Fields:**
- **type** (typing.Literal['comfy.clip_file'])
- **name** (str)


## CLIPVision

**Fields:**
- **type** (typing.Literal['comfy.clip_vision'])
- **name** (str)
- **model** (Any)


## CLIPVisionFile

**Fields:**
- **type** (typing.Literal['comfy.clip_vision_file'])
- **name** (str)


## CLIPVisionOutput

**Fields:**
- **type** (typing.Literal['comfy.clip_vision_output'])
- **data** (Any)


## ChartConfig

**Fields:**
- **type** (typing.Literal['chart_config'])
- **title** (str)
- **x_label** (str)
- **y_label** (str)
- **legend** (bool)
- **data** (ChartData)
- **height** (float | None)
- **aspect** (float | None)
- **x_lim** (tuple[float, float] | None)
- **y_lim** (tuple[float, float] | None)
- **x_scale** (typing.Optional[typing.Literal['linear', 'log']])
- **y_scale** (typing.Optional[typing.Literal['linear', 'log']])
- **legend_position** (typing.Literal['auto', 'right', 'left', 'top', 'bottom'])
- **palette** (str | None)
- **hue_order** (list[str] | None)
- **hue_norm** (tuple[float, float] | None)
- **sizes** (tuple[float, float] | None)
- **size_order** (list[str] | None)
- **size_norm** (tuple[float, float] | None)
- **marginal_kws** (dict | None)
- **joint_kws** (dict | None)
- **diag_kind** (typing.Optional[typing.Literal['auto', 'hist', 'kde']])
- **corner** (bool)
- **center** (float | None)
- **vmin** (float | None)
- **vmax** (float | None)
- **cmap** (str | None)
- **annot** (bool)
- **fmt** (str)
- **square** (bool)


## ChartConfigSchema

**Fields:**
- **title** (str)
- **x_label** (str)
- **y_label** (str)
- **legend** (bool)
- **data** (ChartDataSchema)
- **height** (typing.Optional[float])
- **aspect** (typing.Optional[float])
- **x_lim** (typing.Optional[tuple[float, float]])
- **y_lim** (typing.Optional[tuple[float, float]])
- **x_scale** (typing.Optional[typing.Literal['linear', 'log']])
- **y_scale** (typing.Optional[typing.Literal['linear', 'log']])
- **legend_position** (typing.Literal['auto', 'right', 'left', 'top', 'bottom'])
- **palette** (typing.Optional[str])
- **hue_order** (typing.Optional[list[str]])
- **hue_norm** (typing.Optional[tuple[float, float]])
- **sizes** (typing.Optional[tuple[float, float]])
- **size_order** (typing.Optional[list[str]])
- **size_norm** (typing.Optional[tuple[float, float]])
- **marginal_kws** (typing.Optional[dict])
- **joint_kws** (typing.Optional[dict])
- **diag_kind** (typing.Optional[typing.Literal['auto', 'hist', 'kde']])
- **corner** (bool)
- **center** (typing.Optional[float])
- **vmin** (typing.Optional[float])
- **vmax** (typing.Optional[float])
- **cmap** (typing.Optional[str])
- **annot** (bool)
- **fmt** (str)
- **square** (bool)


## ChartData

**Fields:**
- **type** (typing.Literal['chart_data'])
- **series** (list[nodetool.metadata.types.DataSeries])
- **row** (str | None)
- **col** (str | None)
- **col_wrap** (int | None)


## ChartDataSchema

**Fields:**
- **series** (list[nodetool.metadata.types.DataSeriesSchema])
- **row** (typing.Optional[str])
- **col** (typing.Optional[str])
- **col_wrap** (typing.Optional[int])


## ChatAssistantMessageParam

**Fields:**
- **role** (typing.Literal['assistant'])
- **content** (typing.Optional[str])
- **name** (typing.Optional[str])
- **tool_calls** (typing.Optional[list])


## ChatConversation

The result of a chat conversation.

**Fields:**
- **messages**: The messages in the conversation (list[str])
- **response**: The response from the chat system (str)


## ChatMessageParam

**Fields:**
- **role** (str)


## ChatSystemMessageParam

**Fields:**
- **role** (typing.Literal['system'])
- **content** (str)
- **name** (typing.Optional[str])


## ChatToolMessageParam

**Fields:**
- **role** (typing.Literal['tool'])
- **content** (Any)
- **tool_call_id** (str)


## ChatToolParam

**Fields:**
- **type** (typing.Literal['function'])
- **function** (FunctionDefinition)


## ChatUserMessageParam

**Fields:**
- **role** (typing.Literal['user'])
- **content** (str | list[nodetool.metadata.types.MessageTextContent | nodetool.metadata.types.MessageImageContent | nodetool.metadata.types.MessageAudioContent | nodetool.metadata.types.MessageVideoContent])
- **name** (typing.Optional[str])


## CheckpointFile

**Fields:**
- **type** (typing.Literal['comfy.checkpoint_file'])
- **name** (str)


## ChromaCollection

**Fields:**
- **type** (typing.Literal['chroma_collection'])
- **name** (str)
- **embedding_function** (ChromaEmbeddingFunction)


## ChromaEmbeddingFunction

**Fields:**
- **type** (typing.Literal['chroma.embedding_function'])
- **embedding_function** (ChromaEmbeddingFunctionEnum)
- **model** (str | None)
- **repo_id** (str | None)


## ChromaEmbeddingFunctionEnum

## ColorRef

A reference to a color value.

**Fields:**
- **type** (typing.Literal['color'])
- **value** (str | None)


## ColumnDef

**Fields:**
- **name** (str)
- **data_type** (typing.Union[typing.Literal['int'], typing.Literal['float'], typing.Literal['datetime'], typing.Literal['string'], typing.Literal['object']])
- **description** (str)


## ComfyData

**Fields:**
- **type** (str)
- **data** (Any)

### serialize

**Args:**


## ComfyModel

**Fields:**
- **type** (str)
- **name** (str)
- **model** (Any)


## Conditioning

**Fields:**
- **type** (typing.Literal['comfy.conditioning'])
- **data** (Any)


## ControlNet

**Fields:**
- **type** (typing.Literal['comfy.control_net'])
- **name** (str)
- **model** (Any)


## ControlNetFile

**Fields:**
- **type** (typing.Literal['comfy.control_net_file'])
- **name** (str)


## DataSeries

**Fields:**
- **type** (typing.Literal['data_series'])
- **name** (str)
- **x** (str)
- **y** (str | None)
- **hue** (str | None)
- **size** (str | None)
- **style** (str | None)
- **weight** (str | None)
- **color** (str | None)
- **plot_type** (SeabornPlotType)
- **estimator** (nodetool.metadata.types.SeabornEstimator | None)
- **ci** (float | None)
- **n_boot** (int)
- **units** (str | None)
- **seed** (int | None)
- **stat** (nodetool.metadata.types.SeabornStatistic | None)
- **bins** (int | str | None)
- **binwidth** (float | None)
- **binrange** (tuple[float, float] | None)
- **discrete** (bool | None)
- **line_style** (str)
- **marker** (str)
- **alpha** (float)
- **orient** (typing.Optional[typing.Literal['v', 'h']])


## DataSeriesSchema

**Fields:**
- **name** (str)
- **x** (str)
- **y** (typing.Optional[str])
- **hue** (typing.Optional[str])
- **size** (typing.Optional[str])
- **style** (typing.Optional[str])
- **weight** (typing.Optional[str])
- **color** (typing.Optional[str])
- **plot_type** (SeabornPlotType)
- **estimator** (typing.Optional[nodetool.metadata.types.SeabornEstimator])
- **ci** (typing.Optional[float])
- **n_boot** (int)
- **units** (typing.Optional[str])
- **seed** (typing.Optional[int])
- **stat** (typing.Optional[nodetool.metadata.types.SeabornStatistic])
- **bins** (typing.Union[int, str, NoneType])
- **binwidth** (typing.Optional[float])
- **binrange** (typing.Optional[tuple[float, float]])
- **discrete** (typing.Optional[bool])
- **line_style** (str)
- **marker** (str)
- **alpha** (float)
- **orient** (typing.Optional[typing.Literal['v', 'h']])


## DataframeRef

**Fields:**
- **type** (typing.Literal['dataframe'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (list[list[typing.Any]] | None)
- **columns** (list[nodetool.metadata.types.ColumnDef] | None)


## Dataset

This class represents a dataset, which includes a dataframe of features and a dataframe of targets.

**Fields:**
- **data** (DataframeRef)
- **target** (DataframeRef)


## Embeds

**Fields:**
- **type** (typing.Literal['comfy.embeds'])
- **data** (Any)


## FaceAnalysis

**Fields:**
- **type** (typing.Literal['comfy.face_analysis'])
- **data** (Any)


## FaceEmbeds

**Fields:**
- **type** (typing.Literal['comfy.face_embeds'])
- **data** (Any)


## FolderRef

**Fields:**
- **type** (typing.Literal['folder'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)


## FunctionDefinition

**Fields:**
- **name** (str)
- **description** (str)
- **parameters** (Any)


## FunctionModel

**Fields:**
- **type** (typing.Literal['function_model'])
- **provider** (Provider)
- **name** (str)
- **repo_id** (str)
- **filename** (str)
- **local_path** (pathlib.Path | None)


## GLIGEN

**Fields:**
- **type** (typing.Literal['comfy.gligen'])
- **name** (str)
- **model** (Any)


## GLIGENFile

**Fields:**
- **type** (typing.Literal['comfy.gligen_file'])
- **name** (str)


## GPTModel

## Guider

**Fields:**
- **type** (typing.Literal['comfy.guider'])
- **data** (Any)


## HFAudioClassification

**Fields:**
- **type** (typing.Literal['hf.audio_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFAudioToAudio

**Fields:**
- **type** (typing.Literal['hf.audio_to_audio'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFAutomaticSpeechRecognition

**Fields:**
- **type** (typing.Literal['hf.automatic_speech_recognition'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFCLIP

**Fields:**
- **type** (typing.Literal['hf.clip'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFCLIPVision

**Fields:**
- **type** (typing.Literal['hf.clip_vision'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFCheckpointModel

**Fields:**
- **type** (typing.Literal['hf.checkpoint_model'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFComputerVision

**Fields:**
- **type** (typing.Literal['hf.computer_vision'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFControlNet

**Fields:**
- **type** (typing.Literal['hf.controlnet'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFControlNetSDXL

**Fields:**
- **type** (typing.Literal['hf.controlnet_sdxl'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFDepthEstimation

**Fields:**
- **type** (typing.Literal['hf.depth_estimation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFDocumentQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.document_question_answering'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFFeatureExtraction

**Fields:**
- **type** (typing.Literal['hf.feature_extraction'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFFillMask

**Fields:**
- **type** (typing.Literal['hf.fill_mask'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFFlux

**Fields:**
- **type** (typing.Literal['hf.flux'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFGOTOCR

**Fields:**
- **type** (typing.Literal['hf.gotocr'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFIPAdapter

**Fields:**
- **type** (typing.Literal['hf.ip_adapter'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageClassification

**Fields:**
- **type** (typing.Literal['hf.image_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageFeatureExtraction

**Fields:**
- **type** (typing.Literal['hf.image_feature_extraction'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageSegmentation

**Fields:**
- **type** (typing.Literal['hf.image_segmentation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageTextToText

**Fields:**
- **type** (typing.Literal['hf.image_text_to_text'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageTo3D

**Fields:**
- **type** (typing.Literal['hf.image_to_3d'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageToImage

**Fields:**
- **type** (typing.Literal['hf.image_to_image'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageToText

**Fields:**
- **type** (typing.Literal['hf.image_to_text'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFImageToVideo

**Fields:**
- **type** (typing.Literal['hf.image_to_video'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFLTXV

**Fields:**
- **type** (typing.Literal['hf.ltxv'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFLoraSD

**Fields:**
- **type** (typing.Literal['hf.lora_sd'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFLoraSDConfig

**Fields:**
- **type** (typing.Literal['hf.lora_sd_config'])
- **lora**: The LoRA model to use. (HFLoraSD)
- **strength**: LoRA strength (float)


## HFLoraSDXL

**Fields:**
- **type** (typing.Literal['hf.lora_sdxl'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFLoraSDXLConfig

**Fields:**
- **type** (typing.Literal['hf.lora_sdxl_config'])
- **lora**: The LoRA model to use. (HFLoraSDXL)
- **strength**: LoRA strength (float)


## HFMaskGeneration

**Fields:**
- **type** (typing.Literal['hf.mask_generation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFMiniCPM

**Fields:**
- **type** (typing.Literal['hf.minicpm'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFNaturalLanguageProcessing

**Fields:**
- **type** (typing.Literal['hf.natural_language_processing'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFObjectDetection

**Fields:**
- **type** (typing.Literal['hf.object_detection'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.question_answering'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFRealESRGAN

**Fields:**
- **type** (typing.Literal['hf.real_esrgan'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFSentenceSimilarity

**Fields:**
- **type** (typing.Literal['hf.sentence_similarity'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStableDiffusion

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStableDiffusion3

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_3'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStableDiffusionUpscale

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_upscale'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStableDiffusionXL

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_xl'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStableDiffusionXLTurbo

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_xl_turbo'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFStyleModel

**Fields:**
- **type** (typing.Literal['hf.style_model'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFSummarization

**Fields:**
- **type** (typing.Literal['hf.summarization'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTableQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.table_question_answering'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFText2TextGeneration

**Fields:**
- **type** (typing.Literal['hf.text2text_generation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextClassification

**Fields:**
- **type** (typing.Literal['hf.text_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextGeneration

**Fields:**
- **type** (typing.Literal['hf.text_generation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextTo3D

**Fields:**
- **type** (typing.Literal['hf.text_to_3d'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextToAudio

**Fields:**
- **type** (typing.Literal['hf.text_to_audio'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextToImage

**Fields:**
- **type** (typing.Literal['hf.text_to_image'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextToSpeech

**Fields:**
- **type** (typing.Literal['hf.text_to_speech'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTextToVideo

**Fields:**
- **type** (typing.Literal['hf.text_to_video'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTokenClassification

**Fields:**
- **type** (typing.Literal['hf.token_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFTranslation

**Fields:**
- **type** (typing.Literal['hf.translation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFUnconditionalImageGeneration

**Fields:**
- **type** (typing.Literal['hf.unconditional_image_generation'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFUnet

**Fields:**
- **type** (typing.Literal['hf.unet'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFVAE

**Fields:**
- **type** (typing.Literal['hf.vae'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFVideoClassification

**Fields:**
- **type** (typing.Literal['hf.video_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFVideoTextToText

**Fields:**
- **type** (typing.Literal['hf.video_text_to_text'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFVisualQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.visual_question_answering'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFVoiceActivityDetection

**Fields:**
- **type** (typing.Literal['hf.voice_activity_detection'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFZeroShotAudioClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_audio_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFZeroShotClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFZeroShotImageClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_image_classification'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HFZeroShotObjectDetection

**Fields:**
- **type** (typing.Literal['hf.zero_shot_object_detection'])
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)


## HuggingFaceModel

**Fields:**
- **type** (str)
- **repo_id** (str)
- **path** (str | None)
- **allow_patterns** (list[str] | None)
- **ignore_patterns** (list[str] | None)

### is_empty

**Args:**

**Returns:** bool

### is_set

**Args:**

**Returns:** bool


## IPAdapter

**Fields:**
- **type** (typing.Literal['comfy.ip_adapter'])
- **name** (str)
- **model** (Any)


## IPAdapterFile

**Fields:**
- **type** (typing.Literal['comfy.ip_adapter_file'])
- **name** (str)


## ImageRef

A reference to an image asset.

**Fields:**
- **type** (typing.Literal['image'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)


## ImageSegmentationResult

**Fields:**
- **type** (typing.Literal['image_segmentation_result'])
- **label** (str)
- **mask** (ImageRef)


## ImageTensor

**Fields:**
- **type** (typing.Literal['comfy.image_tensor'])
- **data** (Any)


## InstantID

**Fields:**
- **type** (typing.Literal['comfy.instant_id'])
- **name** (str)
- **model** (Any)


## InstantIDFile

**Fields:**
- **type** (typing.Literal['comfy.instant_id_file'])
- **name** (str)


## LORA

**Fields:**
- **type** (typing.Literal['comfy.lora'])
- **name** (str)
- **model** (Any)


## LORAFile

**Fields:**
- **type** (typing.Literal['comfy.lora_file'])
- **name** (str)


## Latent

**Fields:**
- **type** (typing.Literal['comfy.latent'])
- **data** (Any)


## LlamaModel

**Fields:**
- **type** (typing.Literal['llama_model'])
- **name** (str)
- **repo_id** (str)
- **modified_at** (str)
- **size** (int)
- **digest** (str)
- **details** (dict)

### is_set

**Args:**

**Returns:** bool


## LoRAConfig

**Fields:**
- **type** (typing.Literal['comfy.lora_config'])
- **lora**: The LoRA model to use. (LORAFile)
- **strength**: LoRA strength (float)


## Mask

**Fields:**
- **type** (typing.Literal['comfy.mask'])
- **data** (Any)


## Message

Abstract representation for a chat message.

**Tags:** Independent of the underlying chat system, such as OpenAI or Anthropic.

**Fields:**
- **type** (str)
- **id** (str | None)
- **auth_token** (str | None)
- **workflow_id** (str | None)
- **graph** (nodetool.types.graph.Graph | None)
- **thread_id** (str | None)
- **user_id** (str | None)
- **tool_call_id** (str | None)
- **role** (str)
- **name** (str)
- **content** (str | list[nodetool.metadata.types.MessageTextContent | nodetool.metadata.types.MessageImageContent | nodetool.metadata.types.MessageAudioContent | nodetool.metadata.types.MessageVideoContent] | None)
- **tool_calls** (list[nodetool.metadata.types.ToolCall] | None)
- **created_at** (str | None)

### from_model

Convert a Model object to a Message object.


**Args:**

- **message (Message)**: The Message object to convert.


**Returns:**

- **Message**: The abstract Message object.
**Args:**
- **message (Any)**


## MessageAudioContent

**Fields:**
- **type** (typing.Literal['audio'])
- **audio** (AudioRef)


## MessageImageContent

**Fields:**
- **type** (typing.Literal['image_url'])
- **image** (ImageRef)


## MessageTextContent

**Fields:**
- **type** (typing.Literal['text'])
- **text** (str)


## MessageVideoContent

**Fields:**
- **type** (typing.Literal['video'])
- **video** (VideoRef)


## ModelFile

**Fields:**
- **type** (str)
- **name** (str)

### is_empty

**Args:**

**Returns:** bool

### is_set

**Args:**

**Returns:** bool


## ModelRef

**Fields:**
- **type** (typing.Literal['model_ref'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)


## NodeRef

**Fields:**
- **type** (typing.Literal['node'])
- **id** (str)


## Noise

**Fields:**
- **type** (typing.Literal['comfy.noise'])
- **data** (Any)


## ObjectDetectionResult

**Fields:**
- **type** (typing.Literal['object_detection_result'])
- **label** (str)
- **score** (float)
- **box** (BoundingBox)


## OpenAIEmbeddingModel

## OutputSlot

An output slot is a slot that can be connected to an input slot.

**Fields:**
- **type** (TypeMetadata)
- **name** (str)
- **stream** (bool)


## OutputType

This is the base class for all strucutred output types when a node

**Tags:** wants to return more than one output.

**Fields:**


## Provider

## REMBGSession

**Fields:**
- **type** (typing.Literal['comfy.rembg_session'])
- **data** (Any)


## RankingResult

**Fields:**
- **type** (typing.Literal['ranking_result'])
- **score** (float)
- **text** (str)


## RecordType

**Fields:**
- **type** (typing.Literal['record_type'])
- **columns** (list[nodetool.metadata.types.ColumnDef])


## SVGElement

Base type for SVG elements that can be combined.

**Fields:**
- **type** (typing.Literal['svg_element'])
- **name** (str)
- **attributes** (dict[str, str])
- **content** (str)
- **children** (list[nodetool.metadata.types.SVGElement])

### render_attributes

**Args:**

**Returns:** str


## SVGRef

A reference to an SVG asset.

**Fields:**
- **type** (typing.Literal['svg'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | None)


## Sampler

**Fields:**
- **type** (typing.Literal['comfy.sampler'])
- **data** (Any)


## SeabornEstimator

## SeabornPlotType

## SeabornStatistic

## Sigmas

**Fields:**
- **type** (typing.Literal['comfy.sigmas'])
- **data** (Any)


## StyleModel

**Fields:**
- **type** (typing.Literal['comfy.style_model'])
- **name** (str)
- **model** (Any)


## StyleModelFile

**Fields:**
- **type** (typing.Literal['comfy.style_model_file'])
- **name** (str)


## Task

**Fields:**
- **type** (typing.Literal['task'])
- **id** (str)
- **task_type** (str)
- **user_id** (str)
- **thread_id** (str)
- **status** (str)
- **name** (str)
- **instructions** (str)
- **dependencies** (list[str])
- **started_at** (str)
- **finished_at** (str | None)
- **error** (str | None)
- **result** (str | None)
- **cost** (float | None)


## Tensor

**Fields:**
- **type** (typing.Literal['tensor'])
- **value** (list[typing.Any])
- **dtype** (typing.Optional[str])

### from_list

**Args:**
- **tensor (list)**
- **kwargs**

### from_numpy

**Args:**
- **tensor (ndarray)**
- **kwargs**

### is_empty

**Args:**

### to_list

**Args:**

**Returns:** list

### to_numpy

**Args:**

**Returns:** ndarray


## TextRef

**Fields:**
- **type** (typing.Literal['text'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)


## ToolCall

**Fields:**
- **id** (str)
- **name** (str)
- **args** (dict[str, typing.Any])
- **result** (Any)


## UNet

**Fields:**
- **type** (typing.Literal['comfy.unet'])
- **name** (str)
- **model** (Any)


## UNetFile

**Fields:**
- **type** (typing.Literal['comfy.unet_file'])
- **name** (str)


## UpscaleModel

**Fields:**
- **type** (typing.Literal['comfy.upscale_model'])
- **name** (str)
- **model** (Any)


## UpscaleModelFile

**Fields:**
- **type** (typing.Literal['comfy.upscale_model_file'])
- **name** (str)


## VAE

**Fields:**
- **type** (typing.Literal['comfy.vae'])
- **name** (str)
- **model** (Any)


## VAEFile

**Fields:**
- **type** (typing.Literal['comfy.vae_file'])
- **name** (str)


## VideoRef

**Fields:**
- **type** (typing.Literal['video'])
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)
- **duration** (typing.Optional[float])
- **format** (typing.Optional[str])


## WorkflowRef

**Fields:**
- **type** (typing.Literal['workflow'])
- **id** (str)


### add_type_name

Adds a type name to the TypeToEnum and EnumToType mappings.
**Args:**
- **type (typing.Type)**
- **name (str)**

### add_type_names

Add type names to the TypeToEnum and EnumToType mappings.
**Args:**
- **types**

### asset_to_ref

**Args:**
- **asset (Asset)**

### comfy_model_to_folder

**Args:**
- **type_name (str)**

**Returns:** str

### dtype_name

**Args:**
- **dtype (str)**

### is_output_type

**Args:**
- **type**

### pipeline_tag_to_model_type

**Args:**
- **tag (str)**

**Returns:** str | None

### to_numpy

**Args:**
- **num (float | int | nodetool.metadata.types.Tensor)**

**Returns:** ndarray

## unCLIPFile

**Fields:**
- **type** (typing.Literal['comfy.unclip_file'])
- **name** (str)


