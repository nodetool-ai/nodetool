# nodetool.metadata.types

## AnthropicModel

## AssetRef

**Fields:**
- **type** (str)
- **uri** (str)
- **asset_id** (str | None)
- **data** (bytes | list[bytes] | None)

### is_empty

**Args:**

### to_dict

**Args:**


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


## CLIPFile

**Fields:**
- **type** (typing.Literal['comfy.clip_file'])
- **name** (str)


## CLIPVision

**Fields:**
- **type** (typing.Literal['comfy.clip_vision'])
- **name** (str)


## CLIPVisionFile

**Fields:**
- **type** (typing.Literal['comfy.clip_vision_file'])
- **name** (str)


## CLIPVisionOutput

**Fields:**
- **type** (typing.Literal['comfy.clip_vision_output'])


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
- **content** (str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent])
- **name** (typing.Optional[str])


## CheckpointFile

**Fields:**
- **type** (typing.Literal['comfy.checkpoint_file'])
- **name** (str)


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


## Conditioning

**Fields:**
- **type** (typing.Literal['comfy.conditioning'])
- **data** (Any)


## ControlNet

**Fields:**
- **type** (typing.Literal['comfy.control_net'])
- **name** (str)


## ControlNetFile

**Fields:**
- **type** (typing.Literal['comfy.control_net_file'])
- **name** (str)


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
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFAudioToAudio

**Fields:**
- **type** (typing.Literal['hf.audio_to_audio'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFAutomaticSpeechRecognition

**Fields:**
- **type** (typing.Literal['hf.automatic_speech_recognition'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFComputerVision

**Fields:**
- **type** (typing.Literal['hf.computer_vision'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFControlNet

**Fields:**
- **type** (typing.Literal['hf.controlnet'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFControlNetSDXL

**Fields:**
- **type** (typing.Literal['hf.controlnet_sdxl'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFDepthEstimation

**Fields:**
- **type** (typing.Literal['hf.depth_estimation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFDocumentQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.document_question_answering'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFFeatureExtraction

**Fields:**
- **type** (typing.Literal['hf.feature_extraction'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFFillMask

**Fields:**
- **type** (typing.Literal['hf.fill_mask'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFIPAdapter

**Fields:**
- **type** (typing.Literal['hf.ip_adapter'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])
- **file_name** (str)


## HFIPAdapterSDXL

**Fields:**
- **type** (typing.Literal['hf.ip_adapter_sdxl'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])
- **file_name** (str)


## HFImageClassification

**Fields:**
- **type** (typing.Literal['hf.image_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageFeatureExtraction

**Fields:**
- **type** (typing.Literal['hf.image_feature_extraction'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageSegmentation

**Fields:**
- **type** (typing.Literal['hf.image_segmentation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageTextToText

**Fields:**
- **type** (typing.Literal['hf.image_text_to_text'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageTo3D

**Fields:**
- **type** (typing.Literal['hf.image_to_3d'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageToImage

**Fields:**
- **type** (typing.Literal['hf.image_to_image'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageToText

**Fields:**
- **type** (typing.Literal['hf.image_to_text'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFImageToVideo

**Fields:**
- **type** (typing.Literal['hf.image_to_video'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFLora

**Fields:**
- **type** (typing.Literal['hf.lora'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])
- **file_name** (str)


## HFLoraSDXL

**Fields:**
- **type** (typing.Literal['hf.lora_sdxl'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])
- **file_name** (str)


## HFMaskGeneration

**Fields:**
- **type** (typing.Literal['hf.mask_generation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFNaturalLanguageProcessing

**Fields:**
- **type** (typing.Literal['hf.natural_language_processing'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFObjectDetection

**Fields:**
- **type** (typing.Literal['hf.object_detection'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.question_answering'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFSentenceSimilarity

**Fields:**
- **type** (typing.Literal['hf.sentence_similarity'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFStableDiffusion

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFStableDiffusionXL

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_xl'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFStableDiffusionXLTurbo

**Fields:**
- **type** (typing.Literal['hf.stable_diffusion_xl_turbo'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFSummarization

**Fields:**
- **type** (typing.Literal['hf.summarization'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTableQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.table_question_answering'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFText2TextGeneration

**Fields:**
- **type** (typing.Literal['hf.text2text_generation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextClassification

**Fields:**
- **type** (typing.Literal['hf.text_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextGeneration

**Fields:**
- **type** (typing.Literal['hf.text_generation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextTo3D

**Fields:**
- **type** (typing.Literal['hf.text_to_3d'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextToAudio

**Fields:**
- **type** (typing.Literal['hf.text_to_audio'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextToImage

**Fields:**
- **type** (typing.Literal['hf.text_to_image'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextToSpeech

**Fields:**
- **type** (typing.Literal['hf.text_to_speech'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTextToVideo

**Fields:**
- **type** (typing.Literal['hf.text_to_video'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTokenClassification

**Fields:**
- **type** (typing.Literal['hf.token_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFTranslation

**Fields:**
- **type** (typing.Literal['hf.translation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFUnconditionalImageGeneration

**Fields:**
- **type** (typing.Literal['hf.unconditional_image_generation'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFVideoClassification

**Fields:**
- **type** (typing.Literal['hf.video_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFVideoTextToText

**Fields:**
- **type** (typing.Literal['hf.video_text_to_text'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFVisualQuestionAnswering

**Fields:**
- **type** (typing.Literal['hf.visual_question_answering'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFVoiceActivityDetection

**Fields:**
- **type** (typing.Literal['hf.voice_activity_detection'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFZeroShotAudioClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_audio_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFZeroShotClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFZeroShotImageClassification

**Fields:**
- **type** (typing.Literal['hf.zero_shot_image_classification'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HFZeroShotObjectDetection

**Fields:**
- **type** (typing.Literal['hf.zero_shot_object_detection'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## HuggingFaceModel

**Fields:**
- **type** (typing.Literal['hf.model'])
- **repo_id** (str)
- **allow_patterns** (list[str])
- **ignore_patterns** (list[str])


## IPAdapter

**Fields:**
- **type** (typing.Literal['comfy.ip_adapter'])
- **name** (str)


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


## InsightFace

**Fields:**
- **type** (typing.Literal['comfy.insight_face'])
- **data** (Any)


## InstantID

**Fields:**
- **type** (typing.Literal['comfy.instant_id'])
- **name** (str)


## InstantIDFile

**Fields:**
- **type** (typing.Literal['comfy.instant_id_file'])
- **name** (str)


## LORA

**Fields:**
- **type** (typing.Literal['comfy.lora'])
- **name** (str)


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
- **model** (str)
- **modified_at** (str)
- **size** (int)
- **digest** (str)
- **details** (dict)


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
- **thread_id** (str | None)
- **user_id** (str | None)
- **tool_call_id** (str | None)
- **role** (str)
- **name** (str)
- **content** (str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent] | None)
- **tool_calls** (list[nodetool.models.message.ToolCall] | None)
- **created_at** (str | None)

### from_model

Convert a Model object to a Message object.


**Args:**

- **message (Message)**: The Message object to convert.


**Returns:**

- **Message**: The abstract Message object.
**Args:**
- **message (Message)**


## ModelFile

**Fields:**
- **type** (str)
- **name** (str)


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


## Sampler

**Fields:**
- **type** (typing.Literal['comfy.sampler'])
- **data** (Any)


## Sigmas

**Fields:**
- **type** (typing.Literal['comfy.sigmas'])
- **data** (Any)


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


## UNet

**Fields:**
- **type** (typing.Literal['comfy.unet'])
- **name** (str)


## UNetFile

**Fields:**
- **type** (typing.Literal['comfy.unet_file'])
- **name** (str)


## UpscaleModel

**Fields:**
- **type** (typing.Literal['comfy.upscale_model'])
- **name** (str)


## UpscaleModelFile

**Fields:**
- **type** (typing.Literal['comfy.upscale_model_file'])
- **name** (str)


## VAE

**Fields:**
- **type** (typing.Literal['comfy.vae'])
- **name** (str)


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


