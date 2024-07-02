# nodetool.models.base_model

## Function: `DBField(hash_key: bool = False, **kwargs: Any)`

**Parameters:**

- `hash_key` (bool) (default: `False`)
- `kwargs` (Any)

## DBModel

**Inherits from:** BaseModel


#### `before_save(self)`

**Parameters:**


#### `delete(self)`

**Parameters:**


#### `partition_value(self) -> str`

Get the value of the hash key.

**Parameters:**


**Returns:** `str`

#### `reload(self)`

Reload the model instance from the DB.

**Parameters:**


#### `save(self)`

Save a model instance to DynamoDB and return the instance.

**Parameters:**


#### `update(self, **kwargs)`

Update the model instance and save it to DynamoDB.

**Parameters:**

- `kwargs`

## Function: `create_time_ordered_uuid() -> str`

Create an uuid that is ordered by time.

**Returns:** `str`

