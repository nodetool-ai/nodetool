# nodetool.api.auth

## AuthRequest

**Fields:**
- **token** (str)


## OAuthAuthorizeRequest

**Fields:**
- **provider** (OAuthProvider)
- **state** (str)
- **authorization_response** (str)
- **redirect_uri** (str)


## OAuthLoginRequest

**Fields:**
- **redirect_uri** (str)
- **provider** (OAuthProvider)


## OAuthLoginResponse

**Fields:**
- **url** (str)
- **state** (str)


## OAuthProvider

An enumeration.

## TokenRequest

**Fields:**
- **token** (str)


## TokenResponse

**Fields:**
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

