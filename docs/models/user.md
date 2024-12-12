# nodetool.models.user

## User

**Fields:**
- **id** (str)
- **permissions** (dict[str, typing.Any] | None)
- **email** (str)
- **passcode** (str)
- **auth_token** (str | None)
- **verified_at** (datetime.datetime | None)
- **passcode_valid** (datetime)
- **token_valid** (datetime.datetime | None)
- **created_at** (datetime)
- **updated_at** (datetime)
- **deleted_at** (datetime.datetime | None)


### validate_email

Validate email format.


**Args:**

- **email**: Email address to validate


**Returns:**

- **bool**: True if email format is valid, False otherwise
**Args:**
- **email (str)**

**Returns:** bool

