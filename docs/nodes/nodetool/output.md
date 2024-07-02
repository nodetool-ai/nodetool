# nodetool.nodes.nodetool.output

## AudioOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`AudioRef`)

## BooleanOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`bool`)

#### `get_json_schema(self)`

**Parameters:**


## ChatOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: The messages to display in the chat. (`list[nodetool.metadata.types.Message]`)

#### `get_json_schema(self)`

**Parameters:**


## ComfyImageOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: A raw image tensor. (`ImageTensor`)

#### `assign_property(self, name: str, value: Any)`

**Parameters:**

- `name` (str)
- `value` (Any)

## DataframeOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`DataframeRef`)

## DictionaryOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`dict[str, typing.Any]`)

## FloatOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`float`)

#### `get_json_schema(self)`

**Parameters:**


## GroupOutput

Output node for any group node.

**Inherits from:** BaseNode

- **input** (`Any`)
- **name** (`str`)

## ImageListOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value**: The images to display. (`list[nodetool.metadata.types.ImageRef]`)

#### `get_json_schema(self)`

**Parameters:**


## ImageOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`ImageRef`)

#### `get_json_schema(self)`

**Parameters:**


## IntegerOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`int`)

#### `get_json_schema(self)`

**Parameters:**


## ListOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`list[typing.Any]`)

#### `get_json_schema(self)`

**Parameters:**


## ModelOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`ModelRef`)

## StringOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`str`)

#### `get_json_schema(self)`

**Parameters:**


## TensorOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`Tensor`)

## TextOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`TextRef`)

#### `get_json_schema(self)`

**Parameters:**


## VideoOutput

**Inherits from:** OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)
- **value** (`VideoRef`)

