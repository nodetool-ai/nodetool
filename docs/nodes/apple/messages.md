# nodetool.nodes.apple.messages

## ReadMessages

Read recent messages from macOS Messages.app via AppleScript

Use cases:
- Monitor conversations
- Process incoming messages in workflows
- Extract message content for automation

**Tags:** messages, imessage, automation, macos, communication

**Fields:**
- **contact**: Optional contact name/number to filter messages (empty for all recent) (str)
- **limit**: Maximum number of recent messages to retrieve (int)


## SendMessage

Send messages using macOS Messages.app via AppleScript

Use cases:
- Send automated notifications via iMessage
- Integrate messaging into workflows
- Send workflow results to yourself or others

**Tags:** messages, imessage, automation, macos, communication

**Fields:**
- **recipient**: Phone number, email, or contact name to send message to (str)
- **text**: Message content to send (str)


