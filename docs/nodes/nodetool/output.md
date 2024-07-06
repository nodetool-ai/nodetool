# nodetool.nodes.nodetool.output

## AudioOutput

Output node for audio content references.

Use cases:
- Displaying processed or generated audio
- Passing audio data between workflow nodes
- Returning results of audio analysis

**Tags:** audio, sound, media

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`AudioRef`)

## BooleanOutput

Output node for a single boolean value.

Use cases:
- Returning binary results (yes/no, true/false)
- Controlling conditional logic in workflows
- Indicating success/failure of operations

**Tags:** boolean, true/false, flag

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`bool`)

#### `get_json_schema`

**Parameters:**


## ChatOutput

Output node for chat message lists.

Use cases:
- Displaying conversation history
- Returning chatbot responses
- Formatting dialog for presentation

**Tags:** chat, messages, conversation

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: The messages to display in the chat. (`list[nodetool.metadata.types.Message]`)

#### `get_json_schema`

**Parameters:**


## ComfyImageOutput

Output node for raw image tensor data.

Use cases:
- Outputting directly from image generation models
- Passing raw image data for further processing
- Interfacing with tensor-based image libraries

**Tags:** image, tensor, raw

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: A raw image tensor. (`ImageTensor`)

#### `assign_property`

**Parameters:**

- `name` (str)
- `value` (Any)

## DataframeOutput

Output node for structured data references.

Use cases:
- Outputting tabular data results
- Passing structured data between analysis steps
- Displaying data in table format

**Tags:** dataframe, table, structured

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`DataframeRef`)

## DictionaryOutput

Output node for key-value pair data.

Use cases:
- Returning multiple named values
- Passing complex data structures between nodes
- Organizing heterogeneous output data

**Tags:** dictionary, key-value, mapping

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`dict[str, typing.Any]`)

## FloatOutput

Output node for a single float value.

Use cases:
- Returning decimal results (e.g. percentages, ratios)
- Passing floating-point parameters between nodes
- Displaying numeric metrics with decimal precision

**Tags:** float, decimal, number

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`float`)

#### `get_json_schema`

**Parameters:**


## GroupOutput

Generic output node for grouped data from any node.

Use cases:
- Aggregating multiple outputs from a single node
- Passing varied data types as a single unit
- Organizing related outputs in workflows

**Tags:** group, composite, multi-output

- **input** (`Any`)
- **name** (`str`)

## ImageListOutput

Output node for a list of image references.

Use cases:
- Displaying multiple images in a grid
- Returning image search results

**Tags:** images, list, gallery

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: The images to display. (`list[nodetool.metadata.types.ImageRef]`)

#### `get_json_schema`

**Parameters:**


## ImageOutput

Output node for a single image reference.

Use cases:
- Displaying a single processed or generated image
- Passing image data between workflow nodes
- Returning image analysis results

**Tags:** image, picture, visual

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`ImageRef`)

#### `get_json_schema`

**Parameters:**


## IntegerOutput

Output node for a single integer value.

Use cases:
- Returning numeric results (e.g. counts, indices)
- Passing integer parameters between nodes
- Displaying numeric metrics

**Tags:** integer, number, count

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`int`)

#### `get_json_schema`

**Parameters:**


## ListOutput

Output node for a list of arbitrary values.

Use cases:
- Returning multiple results from a workflow
- Aggregating outputs from multiple nodes

**Tags:** list, output, any

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`list[typing.Any]`)

#### `get_json_schema`

**Parameters:**


## ModelOutput

Output node for machine learning model references.

Use cases:
- Passing trained models between workflow steps
- Outputting newly created or fine-tuned models
- Referencing models for later use in the workflow

**Tags:** model, ml, ai

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`ModelRef`)

## StringOutput

Output node for a single string value.

Use cases:
- Returning text results or messages
- Passing string parameters between nodes
- Displaying short text outputs

**Tags:** string, text, output

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`str`)

#### `get_json_schema`

**Parameters:**


## TensorOutput

Output node for generic tensor data.

Use cases:
- Passing multi-dimensional data between nodes
- Outputting results from machine learning models
- Representing complex numerical data structures

**Tags:** tensor, array, numerical

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`Tensor`)

## TextOutput

Output node for structured text content.

Use cases:
- Returning longer text content or documents
- Passing formatted text between processing steps
- Displaying rich text output

**Tags:** text, content, document

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`TextRef`)

#### `get_json_schema`

**Parameters:**


## VideoOutput

Output node for video content references.

Use cases:
- Displaying processed or generated video content
- Passing video data between workflow steps
- Returning results of video analysis

**Tags:** video, media, clip

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`VideoRef`)
