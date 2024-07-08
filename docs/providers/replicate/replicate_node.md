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


### convert_output

Convert the output to the specified type.


**Args:**

- **context**: The processing context.
- **output**: The output to be converted.


**Returns:**

The converted output.
### get_output_index

**Args:**

**Returns:** int

### output_key

**Args:**

**Returns:** str

### run_replicate

Run prediction on Replicate.


**Args:**

- **context**: The processing context.
- **params**: Optional dictionary of parameters.


**Returns:**

Result of the prediction.
### add_replicate_model

**Args:**
- **model_id (str)**
- **model_info (dict[str, typing.Any])**

### capitalize

Capitalizes the first letter of a string.


**Args:**

- **name (str)**: The string to be capitalized.


**Returns:**

- **str**: The capitalized string.
### convert_enum_value

Converts an enum value to its corresponding value.


**Args:**

- **value (Any)**: The value to be converted.


**Returns:**

- **Any**: The converted value.
### convert_output_value

Converts the output value to the specified type.
Performs automatic conversions using heuristics.


**Args:**

- **value (Any)**: The value to be converted.
- **t (Type[Any])**: The target type to convert the value to.
- **output_index**: The index for list outputs to use.


**Returns:**

- **Any**: The converted value.


**Raises:**

- **TypeError**: If the value is not of the expected type.
### parse_model_info

Parses the replicate model information from the given URL.


**Args:**

- **url (str)**: The URL to fetch the HTML content from.


**Returns:**

- **dict**: A dictionary containing the parsed model information.
### sanitize_enum

Sanitizes an enum string by replacing hyphens, dots, and spaces with underscores.


**Args:**

- **enum (str)**: The enum string to be sanitized.


**Returns:**

- **str**: The sanitized enum string.
