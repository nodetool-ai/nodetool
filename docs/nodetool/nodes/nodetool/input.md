# nodetool.nodes.nodetool.input

## AssetSchemaMixin

#### `get_json_schema(self)`

**Parameters:**


## AudioFolder

Repesents an audio folder parameter for the workflow.

**Tags:** input, parameter, folder, audio

**Inherits from:** Folder

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## AudioInput

Represents an audio parameter for the workflow.

**Tags:** input, parameter, audio

**Inherits from:** AssetSchemaMixin, InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The audio to use as input. (`AudioRef`)

## BooleanInput

Represents a boolean parameter for the workflow.

**Tags:** input, parameter, boolean, bool

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`bool`)

#### `get_json_schema(self)`

**Parameters:**


## ChatInput

Represents a chat message parameter for the workflow.

**Tags:** input, parameter, chat, message

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`str`)

#### `get_json_schema(self)`

**Parameters:**


## ComfyImageInput

Represents an image parameter for the workflow.

**Tags:** input, parameter, image

**Inherits from:** AssetSchemaMixin, InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The image to use as input. (`ImageRef`)

## FloatInput

Represents a float parameter for the workflow.

**Tags:** input, parameter, float, number

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`float`)
- **min** (`float`)
- **max** (`float`)

#### `get_json_schema(self)`

**Parameters:**


## Folder

Represents a folder parameter for the workflow.

**Tags:** input, parameter, folder

**Inherits from:** AssetSchemaMixin, InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## GroupInput

Input node for any group node.

**Inherits from:** BaseNode

- **items** (`list[typing.Any] | nodetool.metadata.types.DataframeRef`)
- **name** (`str`)

## ImageFolder

Represents an image folder parameter for the workflow.

**Tags:** input, parameter, folder, image

**Inherits from:** Folder

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## ImageInput

Represents an image parameter for the workflow.

**Tags:** input, parameter, image

**Inherits from:** AssetSchemaMixin, InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The image to use as input. (`ImageRef`)

## IntegerInput

Represents an integer parameter for the workflow.

**Tags:** input, parameter, integer, number

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`int`)
- **min** (`int`)
- **max** (`int`)

#### `get_json_schema(self)`

**Parameters:**


## StringInput

Represents a string parameter for the workflow.

**Tags:** input, parameter, string, text

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`str`)

#### `get_json_schema(self)`

**Parameters:**


## TextFolder

Represents a text folder parameter for the workflow.

**Tags:** input, parameter, folder, text

**Inherits from:** Folder

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## TextInput

Represents a text parameter for the workflow.

**Tags:** input, parameter, text

**Inherits from:** InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The text to use as input. (`TextRef`)

#### `get_json_schema(self)`

**Parameters:**


## VideoFolder

Represents a video folder parameter for the workflow.

**Tags:** input, parameter, folder, video

**Inherits from:** Folder

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## VideoInput

Represents a video parameter for the workflow.

**Tags:** input, parameter, video

**Inherits from:** AssetSchemaMixin, InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The video to use as input. (`VideoRef`)

