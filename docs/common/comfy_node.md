# nodetool.common.comfy_node

## ComfyNode

A comfy node wraps around a comfy class and delegates processing to the actual

Attributes:
_comfy_class (str): The comfy class wrapped by this node.

**Tags:** implementation. The comfy class is looed up in the NODE_CLASS_MAPPINGS.

**Fields:**

### call_comfy_node

Delegate the processing to the comfy class.
Values will be converted for model files and enums.


**Args:**

- **context (ProcessingContext)**: The processing context.


**Returns:**

- **Any**: The result of the processing.
**Args:**
- **context (ProcessingContext)**
- **name (str | None) (default: None)**
- **kwargs**

### convert_output

Converts the output value.

Comfy data types are wrapped with their respective classes.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **value (Any)**: The value to be converted.


**Returns:**

- **Any**: The converted output value.
**Args:**
- **context (ProcessingContext)**
- **value (Any)**

### get_comfy_class_name

**Args:**

**Returns:** str

### pre_process

**Args:**
- **context (ProcessingContext)**

### properties_for_client

**Args:**

### required_inputs

**Args:**

### requires_gpu

**Args:**

**Returns:** bool


## DensePoseModel

## EnableDisable

### resolve_comfy_class

**Args:**
- **name (str)**

**Returns:** type | None

