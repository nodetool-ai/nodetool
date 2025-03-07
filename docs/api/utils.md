# nodetool.api.utils

### abort

Abort the current request with the given status code and detail.
**Args:**
- **status_code (int)**
- **detail (typing.Optional[str]) (default: None)**

**Returns:** None

### current_user

**Args:**
- **authorization (typing.Optional[str]) (default: annotation=Union[str, NoneType] required=False default=None alias='authorization' json_schema_extra={})**
- **auth_cookie (typing.Optional[str]) (default: annotation=Union[str, NoneType] required=False default=None alias='auth_cookie' json_schema_extra={})**

**Returns:** User

### get_local_user

In local mode, we only need to create a single user.
This single user has the ID 1.
