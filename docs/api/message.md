# nodetool.api.message

## HelpRequest

**Fields:**
- **messages** (list[nodetool.metadata.types.Message])


### create

**Args:**
- **req (MessageCreateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Message

### ensure_alternating_roles

**Args:**
- **messages**

### get

**Args:**
- **message_id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Message

### help

**Args:**
- **req (HelpRequest)**

**Returns:** list[nodetool.metadata.types.Message]

### index

**Args:**
- **thread_id (str)**
- **reverse (bool) (default: False)**
- **user (User) (default: Depends(current_user))**
- **cursor (typing.Optional[str]) (default: None)**
- **limit (int) (default: 100)**

**Returns:** MessageList

