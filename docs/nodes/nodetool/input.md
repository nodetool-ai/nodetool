# nodetool.nodes.nodetool.input

## AudioInput

Audio asset input for workflows.

Use cases:
- Load audio files for processing
- Analyze sound or speech content
- Provide audio input to models

**Tags:** input, parameter, audio

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The audio to use as input. (AudioRef)


## BooleanInput

Boolean parameter input for workflows.

Use cases:
- Toggle features on/off
- Set binary flags
- Control conditional logic

**Tags:** input, parameter, boolean, bool

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value** (bool)


## ChatInput

Chat message input for workflows.

Use cases:
- Accept user prompts or queries
- Capture conversational input
- Provide instructions to language models

**Tags:** input, parameter, chat, message

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The chat message to use as input. (list[nodetool.metadata.types.Message])


## DocumentInput

Document asset input for workflows.

Use cases:
- Load documents for processing
- Analyze document content
- Provide document input to models

**Tags:** input, parameter, document

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The document to use as input. (DocumentRef)


## EnumInput

Enumeration parameter input for workflows.

Use cases:
- Select from predefined options
- Enforce choice from valid values
- Configure categorical parameters

**Tags:** input, parameter, enum, options, select

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value** (str)
- **options**: Comma-separated list of valid options (str)


## FloatInput

Float parameter input for workflows.

Use cases:
- Specify a numeric value within a defined range
- Set thresholds or scaling factors
- Configure continuous parameters like opacity or volume

**Tags:** input, parameter, float, number

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value** (float)
- **min** (float)
- **max** (float)


## GroupInput

Generic group input for loops.

Use cases:
- provides input for a loop
- iterates over a group of items

**Tags:** input, group, collection, loop

**Fields:**


## ImageInput

Image asset input for workflows.

Use cases:
- Load images for processing or analysis
- Provide visual input to models
- Select images for manipulation

**Tags:** input, parameter, image

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The image to use as input. (ImageRef)


## IntegerInput

Integer parameter input for workflows.

Use cases:
- Specify counts or quantities
- Set index values
- Configure discrete numeric parameters

**Tags:** input, parameter, integer, number

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value** (int)
- **min** (int)
- **max** (int)


## PathInput

Local path input for workflows.

Use cases:
- Provide a local path to a file or directory
- Specify a file or directory for processing
- Load local data for analysis

**Tags:** input, parameter, path

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The path to use as input. (FilePath)


## StringInput

String parameter input for workflows.

Use cases:
- Provide text labels or names
- Enter search queries
- Specify file paths or URLs

**Tags:** input, parameter, string, text

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value** (str)


## TextInput

Text content input for workflows.

Use cases:
- Load text documents or articles
- Process multi-line text content
- Analyze large text bodies

**Tags:** input, parameter, text

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The text to use as input. (TextRef)


## VideoInput

Video asset input for workflows.

Use cases:
- Load video files for processing
- Analyze video content
- Extract frames or audio from videos

**Tags:** input, parameter, video

**Fields:**
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)
- **value**: The video to use as input. (VideoRef)


