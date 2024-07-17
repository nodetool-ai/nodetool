# nodetool.api.prediction

### create

**Args:**
- **req (PredictionCreateRequest)**
- **user (User) (default: Depends(current_user))**

### get

**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Prediction

### index

Returns all assets for a given user or workflow.
**Args:**
- **cursor (typing.Optional[str]) (default: None)**
- **page_size (typing.Optional[int]) (default: None)**
- **user (User) (default: Depends(current_user))**

**Returns:** PredictionList

