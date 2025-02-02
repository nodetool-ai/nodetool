# nodetool.nodes.lib.network.imap

## ConfigureIMAP

Creates an IMAP configuration for email operations.

Use cases:
- Set up email access credentials
- Enable programmatic email access

**Tags:** email, imap, config

**Fields:**
- **host**: IMAP server hostname (e.g. imap.gmail.com) (str)
- **port**: IMAP server port (int)
- **username**: Email account username (str)
- **password**: Email account password (str)
- **use_ssl**: Whether to use SSL/TLS connection (bool)


## EmailFields

Decomposes an email into its individual components.

Takes an Email object and returns its individual fields:
- id: Message ID
- subject: Email subject
- sender: Sender address
- date: Datetime of email
- body: Email body content

**Tags:** email, decompose, extract

**Fields:**
- **email**: Email object to decompose (Email)


## IMAPSearch

Searches IMAP using IMAP-specific search operators.

Returns emails with following fields:
- id: Message ID
- subject: Email subject
- from: Sender address
- date: Datetime of email
- body: Email body content

Use cases:
- Search for emails based on specific criteria
- Retrieve emails from a specific sender
- Filter emails by subject, sender, or date

**Tags:** email, imap, search

**Fields:**
- **connection**: IMAP connection details (IMAPConnection)
- **search_criteria**: Search criteria (EmailSearchCriteria)
- **max_results**: Maximum number of emails to return (int)


### build_imap_query

Converts EmailSearchCriteria to IMAP search string.


**Args:**

- **criteria**: Search criteria to convert


**Returns:**

IMAP search query string
**Args:**
- **criteria (EmailSearchCriteria)**

**Returns:** str

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

Fetches email details for the given message IDs in batches.


**Args:**

- **imap**: IMAP connection object
- **message_ids**: List of email message IDs to fetch
- **batch_size**: Number of emails to fetch in each batch


**Returns:**

List of Email objects
**Args:**
- **imap**
- **message_ids (typing.List[str])**
- **batch_size (int) (default: 100)**

**Returns:** typing.List[nodetool.metadata.types.Email]

### get_email_body

Extracts the body content from an email message.


**Args:**

- **email_message**: Email message object to process


**Returns:**

String containing the email body content, preferring plain text over HTML.
Returns empty string if no content could be extracted.
**Args:**
- **email_message**

**Returns:** str

### search_emails

Searches emails using IMAP search criteria.


**Args:**

- **connection**: IMAP connection details
- **criteria**: Search criteria to use
- **max_results**: Maximum number of results to return


**Returns:**

List of matching emails


**Raises:**

- **ValueError**: If search fails
**Args:**
- **connection (IMAPConnection)**
- **criteria (EmailSearchCriteria)**
- **max_results (int) (default: 50)**

**Returns:** typing.List[nodetool.metadata.types.Email]

