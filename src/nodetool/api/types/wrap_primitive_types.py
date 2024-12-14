from typing import Any, Dict, List, Union

def wrap_primitive_types(value: Any) -> Union[Dict[str, Any], List[Any], Any]:
    if isinstance(value, str):
        return {"type": "string", "value": value}
    elif isinstance(value, int):
        return {"type": "integer", "value": value}
    elif isinstance(value, float):
        return {"type": "float", "value": value}
    elif isinstance(value, bool):
        return {"type": "boolean", "value": value}
    elif isinstance(value, bytes):
        return {"type": "bytes", "value": value}  # Keep bytes as-is
    elif isinstance(value, list):
        return {
            "type": "list",
            "value": [wrap_primitive_types(item) for item in value]
        }
    elif isinstance(value, dict):
        if "type" in value:
            return value  # If the dict already has a "type" key, leave it unchanged
        return {k: wrap_primitive_types(v) for k, v in value.items()}
    else:
        # For complex types or types we don't want to modify, return as is
        return value