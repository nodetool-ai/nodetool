# nodetool.api.auth

## AuthRequest

- **token** (`str`)

## OAuthAuthorizeRequest

- **provider** (`OAuthProvider`)
- **state** (`str`)
- **authorization_response** (`str`)
- **redirect_uri** (`str`)

## OAuthLoginRequest

- **redirect_uri** (`str`)
- **provider** (`OAuthProvider`)

## OAuthLoginResponse

- **url** (`str`)
- **state** (`str`)

## OAuthProvider

## TokenRequest

- **token** (`str`)

## TokenResponse

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

