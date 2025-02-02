# nodetool.types.prediction

## Prediction

A prediction made by a remote model.

**Fields:**
- **type** (typing.Literal['prediction'])
- **id** (str)
- **user_id** (str)
- **node_id** (str)
- **workflow_id** (str | None)
- **provider** (str | None)
- **model** (str | None)
- **version** (str | None)
- **node_type** (str | None)
- **status** (str)
- **params** (dict[str, typing.Any])
- **data** (typing.Any | None)
- **cost** (float | None)
- **logs** (str | None)
- **error** (str | None)
- **duration** (float | None)
- **created_at** (str | None)
- **started_at** (str | None)
- **completed_at** (str | None)


## PredictionCreateRequest

The request body for creating a prediction.

**Fields:**
- **provider** (Provider)
- **model** (str)
- **node_id** (str)
- **params** (dict[str, typing.Any])
- **version** (str | None)
- **workflow_id** (str | None)


## PredictionList

**Fields:**
- **next** (str | None)
- **predictions** (typing.List[nodetool.types.prediction.Prediction])


## PredictionResult

**Fields:**
- **type** (typing.Literal['prediction_result'])
- **prediction** (Prediction)
- **encoding** (typing.Union[typing.Literal['json'], typing.Literal['base64']])
- **content** (Any)

### decode_content

**Args:**

**Returns:** Any

### from_result

**Args:**
- **prediction (Prediction)**
- **content (Any)**


