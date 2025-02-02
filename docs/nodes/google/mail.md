# nodetool.nodes.google.mail

## AddLabel

Adds a label to a Gmail message.

**Tags:** email, gmail, label

**Fields:**
- **email**: Email message to label (Email)
- **label**: Label to add to the message (str)


## DateFilter

## GmailFolder

## GmailSearch

Searches Gmail using Gmail-specific search operators.

Use cases:
- Search for emails based on specific criteria
- Retrieve emails from a specific sender
- Filter emails by subject, sender, or date

**Tags:** email, gmail, search

**Fields:**
- **from_address**: Sender's email address to search for (str)
- **to_address**: Recipient's email address to search for (str)
- **subject**: Text to search for in email subject (str)
- **body**: Text to search for in email body (str)
- **date_filter**: Date filter to search for (DateFilter)
- **flags**: Email status flags to search for (EmailFlag)
- **keywords**: Custom keywords or labels to search for (str)
- **folder**: Email folder to search in (GmailFolder)
- **text**: General text to search for anywhere in the email (str)
- **max_results**: Maximum number of emails to return (int)


## MoveToArchive

Moves specified emails to Gmail archive.

**Tags:** email, gmail, archive

**Fields:**
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

### get_date_condition

Creates a DateSearchCondition based on the specified DateFilter.


**Args:**

- **date_filter**: The DateFilter enum value to convert


**Returns:**

DateSearchCondition configured for the specified filter
**Args:**
- **date_filter (DateFilter)**

**Returns:** DateSearchCondition

