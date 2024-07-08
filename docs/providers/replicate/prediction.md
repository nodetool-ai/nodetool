# nodetool.providers.replicate.prediction

### get_model_status

Get the status of a model on Replicate
**Args:**
- **owner (str)**
- **name (str)**

**Returns:** str

### run_replicate

Run the model on Replicate API
**Args:**
- **prediction (Prediction)**
- **params (dict)**

**Returns:** typing.AsyncGenerator[nodetool.types.prediction.Prediction | nodetool.types.prediction.PredictionResult, NoneType]

