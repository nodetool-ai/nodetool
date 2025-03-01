# nodetool.models.base_model

### DBField

**Args:**
- **hash_key (bool) (default: False)**
- **kwargs (Any)**

### DBIndex

Decorator to define an index on a model.


**Args:**

- **columns**: List of column names to include in the index
- **unique**: Whether the index should enforce uniqueness
- **name**: Optional custom name for the index. If not provided, one will be generated.
**Args:**
- **columns (list[str])**
- **unique (bool) (default: False)**
- **name (str | None) (default: None)**

## DBModel

**Fields:**

### before_save

**Args:**

### delete

**Args:**

### partition_value

Get the value of the hash key.
**Args:**

**Returns:** str

### reload

Reload the model instance from the DB.
**Args:**

### save

Save a model instance and return the instance.
**Args:**

### update

Update the model instance and save it.
**Args:**
- **kwargs**


### create_time_ordered_uuid

Create an uuid that is ordered by time.
