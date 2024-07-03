# nodetool.api.auth

## AuthRequest

**Inherits from:** BaseModel

- **token** (`str`)

## OAuthAuthorizeRequest

**Inherits from:** BaseModel

- **provider** (`OAuthProvider`)
- **state** (`str`)
- **authorization_response** (`str`)
- **redirect_uri** (`str`)

## OAuthLoginRequest

**Inherits from:** BaseModel

- **redirect_uri** (`str`)
- **provider** (`OAuthProvider`)

## OAuthLoginResponse

**Inherits from:** BaseModel

- **url** (`str`)
- **state** (`str`)

## OAuthProvider

**Inherits from:** str, Enum

## TokenRequest

**Inherits from:** BaseModel

- **token** (`str`)

## TokenResponse

**Inherits from:** BaseModel

- **valid** (`bool`)

#### `get_user_email`

**Parameters:**

- `client` (OAuth2Session)
- `provider` (OAuthProvider)

**Returns:** `str`

#### `oauth_callback`

**Parameters:**

- `auth` (OAuthAuthorizeRequest)

**Returns:** `User`

#### `oauth_login`

**Parameters:**

- `login` (OAuthLoginRequest)

**Returns:** `OAuthLoginResponse`

#### `verify`

**Parameters:**

- `auth` (AuthRequest)

**Returns:** `TokenResponse`

