# nodetool.metadata.types

## AnthropicModel

An enumeration.

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
- **messages**: The messages in the conversation (list)
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
- **content** (typing.Any)
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
- **data** (typing.Any)

### serialize

**Args:**


## ComfyModel

**Fields:**
- **type** (str)
- **name** (str)


## Conditioning

**Fields:**
- **type** (typing.Literal['comfy.conditioning'])
- **data** (typing.Any)


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
- **data** (typing.Any)


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
- **parameters** (typing.Any)


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

An enumeration.

## Guider

**Fields:**
- **type** (typing.Literal['comfy.guider'])
- **data** (typing.Any)


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
- **data** (typing.Any)


## InsightFace

**Fields:**
- **type** (typing.Literal['comfy.insight_face'])
- **data** (typing.Any)


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
- **data** (typing.Any)


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
- **data** (typing.Any)


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
- **data** (typing.Any)


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

An enumeration.

## RankingResult

**Fields:**
- **type** (typing.Literal['ranking_result'])
- **score** (float)
- **text** (str)


## RecordType

**Fields:**
- **type** (typing.Literal['record_type'])
- **columns** (list)


## Sampler

**Fields:**
- **type** (typing.Literal['comfy.sampler'])
- **data** (typing.Any)


## Sigmas

**Fields:**
- **type** (typing.Literal['comfy.sigmas'])
- **data** (typing.Any)


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
- **dependencies** (list)
- **started_at** (str)
- **finished_at** (str | None)
- **error** (str | None)
- **result** (str | None)
- **cost** (float | None)


## Tensor

**Fields:**
- **type** (typing.Literal['tensor'])
- **value** (list)
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

### to_numpy

**Args:**
- **num (float | int | nodetool.metadata.types.Tensor)**

**Returns:** ndarray

## unCLIPFile

**Fields:**
- **type** (typing.Literal['comfy.unclip_file'])
- **name** (str)


