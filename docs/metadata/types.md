# nodetool.metadata.types

## AnthropicModel

**Inherits from:** str, Enum

## AssetRef

**Inherits from:** BaseType

- **type** (`str`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

#### `is_empty`

**Parameters:**


#### `to_dict`

**Parameters:**


## AudioRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['audio']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## BaseType

This is the base class for all Nodetool types.
It is used to create a mapping of type names to their corresponding classes.

**Tags:** 

**Inherits from:** BaseModel

- **type** (`str`)

## CLIP

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.clip']`)

## CLIPFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.clip_file']`)
- **name** (`str`)

## CLIPVision

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.clip_vision']`)

## CLIPVisionFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.clip_vision_file']`)
- **name** (`str`)

## CLIPVisionOutput

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.clip_vision_output']`)

## ChatAssistantMessageParam

**Inherits from:** ChatMessageParam

- **role** (`typing.Literal['assistant']`)
- **content** (`typing.Optional[str]`)
- **name** (`typing.Optional[str]`)
- **tool_calls** (`typing.Optional[list]`)

## ChatConversation

The result of a chat conversation.

**Inherits from:** OutputType

- **messages**: The messages in the conversation (`list[str]`)
- **response**: The response from the chat system (`str`)

## ChatMessageParam

**Inherits from:** BaseModel

- **role** (`str`)

## ChatSystemMessageParam

**Inherits from:** ChatMessageParam

- **role** (`typing.Literal['system']`)
- **content** (`str`)
- **name** (`typing.Optional[str]`)

## ChatToolMessageParam

**Inherits from:** ChatMessageParam

- **role** (`typing.Literal['tool']`)
- **content** (`Any`)
- **tool_call_id** (`str`)

## ChatToolParam

**Inherits from:** BaseModel

- **type** (`typing.Literal['function']`)
- **function** (`FunctionDefinition`)

## ChatUserMessageParam

**Inherits from:** ChatMessageParam

- **role** (`typing.Literal['user']`)
- **content** (`str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent]`)
- **name** (`typing.Optional[str]`)

## CheckpointFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.checkpoint_file']`)
- **name** (`str`)

## ColumnDef

**Inherits from:** BaseModel

- **name** (`str`)
- **data_type** (`typing.Union[typing.Literal['int'], typing.Literal['float'], typing.Literal['datetime'], typing.Literal['string'], typing.Literal['object']]`)
- **description** (`str`)

## Conditioning

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.conditioning']`)

## ControlNet

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.control_net']`)

## ControlNetFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.control_net_file']`)
- **name** (`str`)

## DataframeRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['dataframe']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)
- **columns** (`list[nodetool.metadata.types.ColumnDef] | None`)
- **data** (`list[list[typing.Any]] | None`)

## Dataset

This class represents a dataset, which includes a dataframe of features and a dataframe of targets.

**Inherits from:** OutputType

- **data** (`DataframeRef`)
- **target** (`DataframeRef`)

## Embeds

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.embeds']`)

## FileRef

**Inherits from:** BaseType

- **type** (`typing.Literal['file']`)

## FolderRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['folder']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## FunctionDefinition

**Inherits from:** BaseModel

- **name** (`str`)
- **description** (`str`)
- **parameters** (`Any`)

## FunctionModel

**Inherits from:** BaseType

- **type** (`typing.Literal['function_model']`)
- **provider** (`Provider`)
- **name** (`str`)
- **repo_id** (`str`)
- **filename** (`str`)
- **local_path** (`pathlib.Path | None`)

## GLIGEN

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.gligen']`)

## GLIGENFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.gligen_file']`)
- **name** (`str`)

## GPTModel

**Inherits from:** str, Enum

## IPAdapter

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.ip_adapter']`)

## IPAdapterFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.ip_adapter_file']`)
- **name** (`str`)

## ImageRef

A reference to an image asset.

**Inherits from:** AssetRef

- **type** (`typing.Literal['image']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## ImageTensor

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.image_tensor']`)

## InsightFace

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.insight_face']`)

## LORA

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.lora']`)

## LORAFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.lora_file']`)
- **name** (`str`)

## Latent

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.latent']`)

## LlamaModel

**Inherits from:** BaseType

- **type** (`typing.Literal['llama_model']`)
- **name** (`str`)
- **model** (`str`)
- **modified_at** (`str`)
- **size** (`int`)
- **digest** (`str`)
- **details** (`dict`)

## Mask

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.mask']`)

## Message

Abstract representation for a chat message.

**Tags:** Independent of the underlying chat system, such as OpenAI or Anthropic.

**Inherits from:** BaseType

- **type** (`str`)
- **id** (`str | None`)
- **thread_id** (`str | None`)
- **user_id** (`str | None`)
- **tool_call_id** (`str | None`)
- **role** (`str`)
- **name** (`str`)
- **content** (`str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent] | None`)
- **tool_calls** (`list[nodetool.models.message.ToolCall] | None`)
- **created_at** (`str | None`)

#### `from_model`

Convert a Model object to a Message object.

        Args:
            message (Message): The Message object to convert.

        Returns:
            Message: The abstract Message object.

**Parameters:**

- `message` (Message)

## ModelFile

**Inherits from:** BaseType

- **type** (`str`)
- **name** (`str`)

## ModelRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['model_ref']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## NodeRef

**Inherits from:** BaseType

- **type** (`typing.Literal['node']`)
- **id** (`str`)

## OutputSlot

An output slot is a slot that can be connected to an input slot.

**Inherits from:** BaseModel

- **type** (`TypeMetadata`)
- **name** (`str`)
- **stream** (`bool`)

## OutputType

This is the base class for all strucutred output types when a node

**Tags:** wants to return more than one output.

**Inherits from:** BaseModel


## Provider

**Inherits from:** str, Enum

## RankingResult

**Inherits from:** BaseType

- **type** (`typing.Literal['ranking_result']`)
- **score** (`float`)
- **text** (`str`)

## RecordType

**Inherits from:** BaseType

- **type** (`typing.Literal['record_type']`)
- **columns** (`list[nodetool.metadata.types.ColumnDef]`)

## Sampler

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.sampler']`)

## Sigmas

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.sigmas']`)

## Task

**Inherits from:** BaseType

- **type** (`typing.Literal['task']`)
- **id** (`str`)
- **task_type** (`str`)
- **user_id** (`str`)
- **thread_id** (`str`)
- **status** (`str`)
- **name** (`str`)
- **instructions** (`str`)
- **dependencies** (`list[str]`)
- **required_capabilities** (`list[str]`)
- **started_at** (`str`)
- **finished_at** (`str | None`)
- **error** (`str | None`)
- **result** (`str | None`)
- **cost** (`float | None`)

## Tensor

**Inherits from:** BaseType

- **type** (`typing.Literal['tensor']`)
- **value** (`list[typing.Any]`)
- **dtype** (`typing.Optional[str]`)

#### `from_list`

**Parameters:**

- `tensor` (list)
- `kwargs`

#### `from_numpy`

**Parameters:**

- `tensor` (ndarray)
- `kwargs`

#### `is_empty`

**Parameters:**


#### `to_list`

**Parameters:**


**Returns:** `list`

#### `to_numpy`

**Parameters:**


**Returns:** `ndarray`

## TextRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['text']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## TrainTestOutput

**Inherits from:** OutputType

- **train_X** (`DataframeRef`)
- **train_y** (`DataframeRef`)
- **test_X** (`DataframeRef`)
- **test_y** (`DataframeRef`)

## UNet

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.unet']`)

## UpscaleModel

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.upscale_model']`)

## UpscaleModelFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.upscale_model_file']`)
- **name** (`str`)

## VAE

**Inherits from:** BaseType

- **type** (`typing.Literal['comfy.vae']`)

## VAEFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.vae_file']`)
- **name** (`str`)

## VideoRef

**Inherits from:** AssetRef

- **type** (`typing.Literal['video']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)
- **duration** (`typing.Optional[float]`)
- **format** (`typing.Optional[str]`)

## WorkflowRef

**Inherits from:** BaseType

- **type** (`typing.Literal['workflow']`)
- **id** (`str`)

#### `add_type_name`

Adds a type name to the TypeToEnum and EnumToType mappings.

**Parameters:**

- `type` (typing.Type)
- `name` (str)

#### `add_type_names`

Add type names to the TypeToEnum and EnumToType mappings.

**Parameters:**

- `types`

#### `asset_to_ref`

**Parameters:**

- `asset` (Asset)

#### `dtype_name`

**Parameters:**

- `dtype` (str)

#### `is_output_type`

**Parameters:**

- `type`

#### `to_numpy`

**Parameters:**

- `num` (float | int | nodetool.metadata.types.Tensor)

**Returns:** `ndarray`

## unCLIPFile

**Inherits from:** ModelFile

- **type** (`typing.Literal['comfy.unclip_file']`)
- **name** (`str`)

