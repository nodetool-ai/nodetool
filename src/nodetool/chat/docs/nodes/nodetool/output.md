# nodetool.nodes.nodetool.output

## AudioOutput

Output node for audio content references.

Use cases:
- Displaying processed or generated audio
- Passing audio data between workflow nodes
- Returning results of audio analysis

**Fields:**
label: str
name: str
description: str
value: AudioRef

## BooleanOutput

Output node for a single boolean value.

Use cases:
- Returning binary results (yes/no, true/false)
- Controlling conditional logic in workflows
- Indicating success/failure of operations

**Fields:**
label: str
name: str
description: str
value: bool

## ChatOutput

Output node for chat message lists.

Use cases:
- Displaying conversation history
- Returning chatbot responses
- Formatting dialog for presentation

**Fields:**
label: str
name: str
description: str
value: list

## DataframeOutput

Output node for structured data references.

Use cases:
- Outputting tabular data results
- Passing structured data between analysis steps
- Displaying data in table format

**Fields:**
label: str
name: str
description: str
value: DataframeRef

## DictionaryOutput

Output node for key-value pair data.

Use cases:
- Returning multiple named values
- Passing complex data structures between nodes
- Organizing heterogeneous output data

**Fields:**
label: str
name: str
description: str
value: dict

## FloatOutput

Output node for a single float value.

Use cases:
- Returning decimal results (e.g. percentages, ratios)
- Passing floating-point parameters between nodes
- Displaying numeric metrics with decimal precision

**Fields:**
label: str
name: str
description: str
value: float

## GroupOutput

Generic output node for grouped data from any node.

Use cases:
- Aggregating multiple outputs from a single node
- Passing varied data types as a single unit
- Organizing related outputs in workflows

**Fields:**
input: typing.Any

## ImageListOutput

Output node for a list of image references.

Use cases:
- Displaying multiple images in a grid
- Returning image search results

**Fields:**
label: str
name: str
description: str
value: list

## ImageOutput

Output node for a single image reference.

Use cases:
- Displaying a single processed or generated image
- Passing image data between workflow nodes
- Returning image analysis results

**Fields:**
label: str
name: str
description: str
value: ImageRef

## IntegerOutput

Output node for a single integer value.

Use cases:
- Returning numeric results (e.g. counts, indices)
- Passing integer parameters between nodes
- Displaying numeric metrics

**Fields:**
label: str
name: str
description: str
value: int

## ListOutput

Output node for a list of arbitrary values.

Use cases:
- Returning multiple results from a workflow
- Aggregating outputs from multiple nodes

**Fields:**
label: str
name: str
description: str
value: list

## ModelOutput

Output node for machine learning model references.

Use cases:
- Passing trained models between workflow steps
- Outputting newly created or fine-tuned models
- Referencing models for later use in the workflow

**Fields:**
label: str
name: str
description: str
value: ModelRef

## StringOutput

Output node for a single string value.

Use cases:
- Returning text results or messages
- Passing string parameters between nodes
- Displaying short text outputs

**Fields:**
label: str
name: str
description: str
value: str

## TensorOutput

Output node for generic tensor data.

Use cases:
- Passing multi-dimensional data between nodes
- Outputting results from machine learning models
- Representing complex numerical data structures

**Fields:**
label: str
name: str
description: str
value: Tensor

## TextOutput

Output node for structured text content.

Use cases:
- Returning longer text content or documents
- Passing formatted text between processing steps
- Displaying rich text output

**Fields:**
label: str
name: str
description: str
value: TextRef

## VideoOutput

Output node for video content references.

Use cases:
- Displaying processed or generated video content
- Passing video data between workflow steps
- Returning results of video analysis

**Fields:**
label: str
name: str
description: str
value: VideoRef

