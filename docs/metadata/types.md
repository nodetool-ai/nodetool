# nodetool.metadata.types

## AnthropicModel

## AssetRef

- **type** (`str`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

#### `is_empty`

**Parameters:**


#### `to_dict`

**Parameters:**


## AudioRef

- **type** (`typing.Literal['audio']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## BaseType

This is the base class for all Nodetool types.
It is used to create a mapping of type names to their corresponding classes.

**Tags:** 

- **type** (`str`)

## CLIP

- **type** (`typing.Literal['comfy.clip']`)

## CLIPFile

- **type** (`typing.Literal['comfy.clip_file']`)
- **name** (`str`)

## CLIPVision

- **type** (`typing.Literal['comfy.clip_vision']`)

## CLIPVisionFile

- **type** (`typing.Literal['comfy.clip_vision_file']`)
- **name** (`str`)

## CLIPVisionOutput

- **type** (`typing.Literal['comfy.clip_vision_output']`)

## ChatAssistantMessageParam

- **role** (`typing.Literal['assistant']`)
- **content** (`typing.Optional[str]`)
- **name** (`typing.Optional[str]`)
- **tool_calls** (`typing.Optional[list]`)

## ChatConversation

The result of a chat conversation.

- **messages**: The messages in the conversation (`list[str]`)
- **response**: The response from the chat system (`str`)

## ChatMessageParam

- **role** (`str`)

## ChatSystemMessageParam

- **role** (`typing.Literal['system']`)
- **content** (`str`)
- **name** (`typing.Optional[str]`)

## ChatToolMessageParam

- **role** (`typing.Literal['tool']`)
- **content** (`Any`)
- **tool_call_id** (`str`)

## ChatToolParam

- **type** (`typing.Literal['function']`)
- **function** (`FunctionDefinition`)

## ChatUserMessageParam

- **role** (`typing.Literal['user']`)
- **content** (`str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent]`)
- **name** (`typing.Optional[str]`)

## CheckpointFile

- **type** (`typing.Literal['comfy.checkpoint_file']`)
- **name** (`str`)

## ColumnDef

- **name** (`str`)
- **data_type** (`typing.Union[typing.Literal['int'], typing.Literal['float'], typing.Literal['datetime'], typing.Literal['string'], typing.Literal['object']]`)
- **description** (`str`)

## Conditioning

- **type** (`typing.Literal['comfy.conditioning']`)

## ControlNet

- **type** (`typing.Literal['comfy.control_net']`)

## ControlNetFile

- **type** (`typing.Literal['comfy.control_net_file']`)
- **name** (`str`)

## DataframeRef

- **type** (`typing.Literal['dataframe']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)
- **columns** (`list[nodetool.metadata.types.ColumnDef] | None`)
- **data** (`list[list[typing.Any]] | None`)

## Dataset

This class represents a dataset, which includes a dataframe of features and a dataframe of targets.

- **data** (`DataframeRef`)
- **target** (`DataframeRef`)

## Embeds

- **type** (`typing.Literal['comfy.embeds']`)

## FileRef

- **type** (`typing.Literal['file']`)

## FolderRef

- **type** (`typing.Literal['folder']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## FunctionDefinition

- **name** (`str`)
- **description** (`str`)
- **parameters** (`Any`)

## FunctionModel

- **type** (`typing.Literal['function_model']`)
- **provider** (`Provider`)
- **name** (`str`)
- **repo_id** (`str`)
- **filename** (`str`)
- **local_path** (`pathlib.Path | None`)

## GLIGEN

- **type** (`typing.Literal['comfy.gligen']`)

## GLIGENFile

- **type** (`typing.Literal['comfy.gligen_file']`)
- **name** (`str`)

## GPTModel

## IPAdapter

- **type** (`typing.Literal['comfy.ip_adapter']`)

## IPAdapterFile

- **type** (`typing.Literal['comfy.ip_adapter_file']`)
- **name** (`str`)

## ImageRef

A reference to an image asset.

- **type** (`typing.Literal['image']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## ImageTensor

- **type** (`typing.Literal['comfy.image_tensor']`)

## InsightFace

- **type** (`typing.Literal['comfy.insight_face']`)

## LORA

- **type** (`typing.Literal['comfy.lora']`)

## LORAFile

- **type** (`typing.Literal['comfy.lora_file']`)
- **name** (`str`)

## Latent

- **type** (`typing.Literal['comfy.latent']`)

## LlamaModel

- **type** (`typing.Literal['llama_model']`)
- **name** (`str`)
- **model** (`str`)
- **modified_at** (`str`)
- **size** (`int`)
- **digest** (`str`)
- **details** (`dict`)

## Mask

- **type** (`typing.Literal['comfy.mask']`)

## Message

Abstract representation for a chat message.

**Tags:** Independent of the underlying chat system, such as OpenAI or Anthropic.

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

- **type** (`str`)
- **name** (`str`)

## ModelRef

- **type** (`typing.Literal['model_ref']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## NodeRef

- **type** (`typing.Literal['node']`)
- **id** (`str`)

## OutputSlot

An output slot is a slot that can be connected to an input slot.

- **type** (`TypeMetadata`)
- **name** (`str`)
- **stream** (`bool`)

## OutputType

This is the base class for all strucutred output types when a node

**Tags:** wants to return more than one output.


## Provider

## RankingResult

- **type** (`typing.Literal['ranking_result']`)
- **score** (`float`)
- **text** (`str`)

## RecordType

- **type** (`typing.Literal['record_type']`)
- **columns** (`list[nodetool.metadata.types.ColumnDef]`)

## Sampler

- **type** (`typing.Literal['comfy.sampler']`)

## Sigmas

- **type** (`typing.Literal['comfy.sigmas']`)

## Task

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

- **type** (`typing.Literal['text']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)

## TrainTestOutput

- **train_X** (`DataframeRef`)
- **train_y** (`DataframeRef`)
- **test_X** (`DataframeRef`)
- **test_y** (`DataframeRef`)

## UNet

- **type** (`typing.Literal['comfy.unet']`)

## UpscaleModel

- **type** (`typing.Literal['comfy.upscale_model']`)

## UpscaleModelFile

- **type** (`typing.Literal['comfy.upscale_model_file']`)
- **name** (`str`)

## VAE

- **type** (`typing.Literal['comfy.vae']`)

## VAEFile

- **type** (`typing.Literal['comfy.vae_file']`)
- **name** (`str`)

## VideoRef

- **type** (`typing.Literal['video']`)
- **uri** (`str`)
- **asset_id** (`str | None`)
- **temp_id** (`str | None`)
- **duration** (`typing.Optional[float]`)
- **format** (`typing.Optional[str]`)

## WorkflowRef

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

- **type** (`typing.Literal['comfy.unclip_file']`)
- **name** (`str`)

