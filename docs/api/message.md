# nodetool.api.message

### create

**Args:**
- **req (MessageCreateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Message

### get

**Args:**
- **message_id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Message

### help

**Args:**
- **req (MessageCreateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** list

### index

**Args:**
- **thread_id (str)**
- **reverse (bool) (default: False)**
- **user (User) (default: Depends(current_user))**
- **cursor (typing.Optional[str]) (default: None)**
- **limit (int) (default: 100)**

**Returns:** MessageList

