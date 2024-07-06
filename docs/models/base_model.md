# nodetool.models.base_model

#### `DBField`

**Parameters:**

- `hash_key` (bool) (default: `False`)
- `kwargs` (Any)

## DBModel


#### `before_save`

**Parameters:**


#### `delete`

**Parameters:**


#### `partition_value`

Get the value of the hash key.

**Parameters:**


**Returns:** `str`

#### `reload`

Reload the model instance from the DB.

**Parameters:**


#### `save`

Save a model instance to DynamoDB and return the instance.

**Parameters:**


#### `update`

Update the model instance and save it to DynamoDB.

**Parameters:**

- `kwargs`

#### `create_time_ordered_uuid`

Create an uuid that is ordered by time.

**Returns:** `str`

