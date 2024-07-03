# nodetool.api.prediction

#### `create`

**Parameters:**

- `req` (PredictionCreateRequest)
- `user` (User) (default: `Depends(current_user)`)

#### `get`

**Parameters:**

- `id` (str)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Prediction`

#### `index`

Returns all assets for a given user or workflow.

**Parameters:**

- `cursor` (typing.Optional[str]) (default: `None`)
- `page_size` (typing.Optional[int]) (default: `None`)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `PredictionList`

#### `run_prediction`

Run the prediction for a given model.

**Parameters:**

- `req` (PredictionCreateRequest)
- `user_id` (str)

**Returns:** `typing.AsyncGenerator[nodetool.types.prediction.Prediction | nodetool.types.prediction.PredictionResult, NoneType]`

