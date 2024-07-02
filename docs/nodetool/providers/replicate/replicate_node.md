# nodetool.providers.replicate.replicate_node

## ReplicateNode

This is the base class for all replicate nodes.
Methods:
replicate_model_id: Returns the model ID for replication.
get_hardware: Returns the hardware information.
run_replicate: Runs prediction on Replicate.
extra_params: Returns any extra parameters.
process: Processes the prediction output.
convert_output: Converts the output to the specified type.

**Tags:** 

**Inherits from:** BaseNode


#### `convert_output(self, context: nodetool.workflows.processing_context.ProcessingContext, output: Any) -> Any`

Convert the output to the specified type.

        Args:
            context: The processing context.
            output: The output to be converted.

        Returns:
            The converted output.

**Parameters:**

- `context` (ProcessingContext)
- `output` (Any)

**Returns:** `Any`

#### `get_output_index(self) -> int`

**Parameters:**


**Returns:** `int`

#### `output_key(self) -> str`

**Parameters:**


**Returns:** `str`

#### `run_replicate(self, context: nodetool.workflows.processing_context.ProcessingContext, params: dict[str, typing.Any] | None = None)`

Run prediction on Replicate.

        Args:
            context: The processing context.
            params: Optional dictionary of parameters.

        Returns:
            Result of the prediction.

**Parameters:**

- `context` (ProcessingContext)
- `params` (dict[str, typing.Any] | None) (default: `None`)

## Function: `add_replicate_model(model_id: str, model_info: dict[str, typing.Any])`

**Parameters:**

- `model_id` (str)
- `model_info` (dict[str, typing.Any])

## Function: `capitalize(name: str) -> str`

Capitalizes the first letter of a string.

    Args:
        name (str): The string to be capitalized.

    Returns:
        str: The capitalized string.

**Parameters:**

- `name` (str)

**Returns:** `str`

## Function: `convert_enum_value(value: Any)`

Converts an enum value to its corresponding value.

    Args:
        value (Any): The value to be converted.

    Returns:
        Any: The converted value.

**Parameters:**

- `value` (Any)

## Function: `convert_output_value(value: Any, t: Type[Any], output_index: int = 0, output_key: str = 'output')`

Converts the output value to the specified type.
    Performs automatic conversions using heuristics.

    Args:
        value (Any): The value to be converted.
        t (Type[Any]): The target type to convert the value to.
        output_index: The index for list outputs to use.

    Returns:
        Any: The converted value.

    Raises:
        TypeError: If the value is not of the expected type.

**Parameters:**

- `value` (Any)
- `t` (typing.Type[typing.Any])
- `output_index` (int) (default: `0`)
- `output_key` (str) (default: `output`)

## Function: `parse_model_info(url: str)`

Parses the replicate model information from the given URL.

    Args:
        url (str): The URL to fetch the HTML content from.

    Returns:
        dict: A dictionary containing the parsed model information.

**Parameters:**

- `url` (str)

## Function: `sanitize_enum(name: str) -> str`

Sanitizes an enum string by replacing hyphens, dots, and spaces with underscores.

    Args:
        enum (str): The enum string to be sanitized.

    Returns:
        str: The sanitized enum string.

**Parameters:**

- `name` (str)

**Returns:** `str`

