# nodetool.api.auth

## AuthRequest

- **token** (str)

## OAuthAuthorizeRequest

- **provider** (OAuthProvider)
- **state** (str)
- **authorization_response** (str)
- **redirect_uri** (str)

## OAuthLoginRequest

- **redirect_uri** (str)
- **provider** (OAuthProvider)

## OAuthLoginResponse

- **url** (str)
- **state** (str)

## OAuthProvider

An enumeration.

## TokenRequest

- **token** (str)

## TokenResponse

- **valid** (bool)

### get_user_email

**Args:**
- **client (OAuth2Session)**
- **provider (OAuthProvider)**

**Returns:** str

### oauth_callback

**Args:**
- **auth (OAuthAuthorizeRequest)**

**Returns:** User

### oauth_login

**Args:**
- **login (OAuthLoginRequest)**

**Returns:** OAuthLoginResponse

### verify

**Args:**
- **auth (AuthRequest)**

**Returns:** TokenResponse

