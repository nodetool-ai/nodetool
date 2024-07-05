# nodetool.providers.replicate.prediction

#### `get_model_status`

Get the status of a model on Replicate

**Parameters:**

- `owner` (str)
- `name` (str)

**Returns:** `str`

#### `run_replicate`

Run the model on Replicate API

**Parameters:**

- `prediction` (Prediction)
- `params` (dict)

**Returns:** `typing.AsyncGenerator[nodetool.types.prediction.Prediction | nodetool.types.prediction.PredictionResult, NoneType]`

