# nodetool.nodes.google.mail

## GmailLabel

Searches Gmail for emails with specific labels.

**Tags:** email, gmail, label

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **label**: Gmail label to search (e.g., INBOX, SENT, DRAFT, SPAM) (str)
- **unread_only**: Only return unread emails (bool)
- **max_results**: Maximum number of emails to return (int)


## GmailSearch

Searches Gmail using Gmail-specific search operators.

Examples of Gmail search operators:
- from:sender@example.com
- to:recipient@example.com
- subject:hello
- has:attachment
- newer_than:2d
- older_than:1y
- label:important

**Tags:** email, gmail, search

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **search_query**: Gmail search query using Gmail search operators: from:sender@example.com to:recipient@example.com subject:hello has:attachment newer_than:2d older_than:1y label:important (str)
- **max_results**: Maximum number of emails to return (int)


## MoveToArchive

Moves specified emails to Gmail archive.

**Tags:** email, gmail, archive

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **message_ids**: List of message IDs to archive (typing.List[str])


### create_gmail_connection

Creates a Gmail connection configuration.


**Args:**

- **email_address**: Gmail address to connect to
- **app_password**: Google App Password for authentication


**Returns:**

IMAPConnection configured for Gmail


**Raises:**

- **ValueError**: If email_address or app_password is empty
**Args:**
- **email_address (str)**
- **app_password (str)**

**Returns:** IMAPConnection

### decode_bytes_with_fallback

Attempts to decode bytes using multiple encodings with fallback to empty string.


**Args:**

- **byte_string**: The bytes to decode
- **encodings**: Tuple of encodings to try in order


**Returns:**

Decoded string or empty string if all decodings fail
**Args:**
- **byte_string (bytes)**
- **encodings (default: ('utf-8', 'latin-1', 'ascii'))**

**Returns:** str

### fetch_emails

**Args:**
- **imap**
- **message_ids (typing.List[str])**

**Returns:** typing.List[dict]

### get_email_body

**Args:**
- **email_message**

**Returns:** str

