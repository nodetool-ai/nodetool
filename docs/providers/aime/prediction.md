# nodetool.providers.aime.prediction

### fetch_auth_key

Fetch authentication key from AIME API.
**Args:**
- **model (str)**
- **user (str)**
- **key (str)**

**Returns:** str

### run_aime

**Args:**
- **prediction (Prediction)**
- **env (dict)**

**Returns:** typing.AsyncGenerator[nodetool.types.prediction.PredictionResult, NoneType]

