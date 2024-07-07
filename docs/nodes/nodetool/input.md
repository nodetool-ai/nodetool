# nodetool.nodes.nodetool.input

## AssetSchemaMixin

#### `get_json_schema`

**Parameters:**


## AudioFolder

Folder of audio assets input for workflows.

Use cases:
- Batch process multiple audio files
- Analyze audio datasets
- Create playlists or audio collections

**Tags:** input, parameter, folder, audio

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## AudioInput

Audio asset input for workflows.

Use cases:
- Load audio files for processing
- Analyze sound or speech content
- Provide audio input to models

**Tags:** input, parameter, audio

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The audio to use as input. (`AudioRef`)

## BooleanInput

Boolean parameter input for workflows.

Use cases:
- Toggle features on/off
- Set binary flags
- Control conditional logic

**Tags:** input, parameter, boolean, bool

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`bool`)

#### `get_json_schema`

**Parameters:**


## ChatInput

Chat message input for workflows.

Use cases:
- Accept user prompts or queries
- Capture conversational input
- Provide instructions to language models

**Tags:** input, parameter, chat, message

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`str`)

#### `get_json_schema`

**Parameters:**


## ComfyImageInput

Image input optimized for Comfy workflows.

Use cases:
- Load and preprocess images for Comfy models
- Handle multi-frame images and alpha channels
- Convert images to tensor format for ML tasks

**Tags:** input, parameter, image

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The image to use as input. (`ImageRef`)

## FloatInput

Float parameter input for workflows.

Use cases:
- Specify a numeric value within a defined range
- Set thresholds or scaling factors
- Configure continuous parameters like opacity or volume

**Tags:** input, parameter, float, number

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`float`)
- **min** (`float`)
- **max** (`float`)

#### `get_json_schema`

**Parameters:**


## Folder

Folder of assets input for workflows.

Use cases:
- Batch process multiple assets
- Select a collection of related files
- Iterate over a set of inputs

**Tags:** input, parameter, folder

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## GroupInput

Generic group input for loops.

Use cases:
- provides input for a loop
- iterates over a group of items

**Tags:** input, group, collection, loop


## ImageFolder

Folder of image assets input for workflows.

Use cases:
- Batch process multiple images
- Train models on image datasets
- Create image galleries or collections

**Tags:** input, parameter, folder, image

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## ImageInput

Image asset input for workflows.

Use cases:
- Load images for processing or analysis
- Provide visual input to models
- Select images for manipulation

**Tags:** input, parameter, image

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The image to use as input. (`ImageRef`)

## IntegerInput

Integer parameter input for workflows.

Use cases:
- Specify counts or quantities
- Set index values
- Configure discrete numeric parameters

**Tags:** input, parameter, integer, number

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`int`)
- **min** (`int`)
- **max** (`int`)

#### `get_json_schema`

**Parameters:**


## StringInput

String parameter input for workflows.

Use cases:
- Provide text labels or names
- Enter search queries
- Specify file paths or URLs

**Tags:** input, parameter, string, text

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value** (`str`)

#### `get_json_schema`

**Parameters:**


## TextFolder

Folder of text assets input for workflows.

Use cases:
- Batch process multiple text documents
- Analyze text corpora
- Create document collections

**Tags:** input, parameter, folder, text

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## TextInput

Text content input for workflows.

Use cases:
- Load text documents or articles
- Process multi-line text content
- Analyze large text bodies

**Tags:** input, parameter, text

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The text to use as input. (`TextRef`)

#### `get_json_schema`

**Parameters:**


## VideoFolder

Folder of video assets input for workflows.

Use cases:
- Batch process multiple video files
- Analyze video datasets
- Create video playlists or collections

**Tags:** input, parameter, folder, video

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **folder**: The folder to use as input. (`FolderRef`)
- **limit** (`int`)

## VideoInput

Video asset input for workflows.

Use cases:
- Load video files for processing
- Analyze video content
- Extract frames or audio from videos

**Tags:** input, parameter, video

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)
- **value**: The video to use as input. (`VideoRef`)

