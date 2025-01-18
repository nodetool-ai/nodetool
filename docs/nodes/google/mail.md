# nodetool.nodes.google.mail

## DateFilter

An enumeration.

## EmailSearchCriteriaNode

Comprehensive Email search criteria using IMAP search operators.

**Tags:** email, gmail, search

**Fields:**
- **from_address**: Sender's email address to search for.
        - Case-insensitive
        - Partial matches work (e.g., "@company.com")
        - Use quotes for addresses with spaces
        - Multiple addresses can be combined with OR operator
         (str)
- **to_address**: Recipient's email address to search for.
        - Case-insensitive
        - Partial matches work (e.g., "@company.com")
        - Use quotes for addresses with spaces
        - Includes primary recipients only (not CC/BCC)
         (str)
- **subject**: Text to search for in email subject.
        - Case-insensitive
        - Partial word matches work
        - Use quotes for phrases with spaces
        - Special characters should be escaped
         (str)
- **body**: Text to search for in email body.
        - Case-insensitive
        - Searches message body only
        - Use quotes for phrases with spaces
        - HTML and plain text content are searched
         (str)
- **date_filter**: Date filter to search for. (DateFilter)
- **flags**: Email status flag to search for.
        - SEEN/UNSEEN: Read/unread messages
        - ANSWERED/UNANSWERED: Replied/unreplied messages
        - FLAGGED/UNFLAGGED: Starred/unstarred messages
         (EmailFlag)
- **keywords**: Custom keywords or labels to search for.
        - Case-sensitive
        - Gmail labels are treated as keywords
        - Custom labels are used as-is
         (str)
- **folder**: Email folder to search in. (GmailFolder)
- **text**: General text to search for anywhere in the email.
        - Searches all text fields (subject, body, addresses)
        - Case-insensitive
        - Partial matches work
        - Use quotes for phrases with spaces
        - Most flexible but slower than specific field searches
         (str)


## GmailFolder

An enumeration.

## GmailSearch

Searches Gmail using Gmail-specific search operators.

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

**Tags:** email, gmail, search

**Fields:**
- **email_address**: Gmail address to connect to (str)
- **search_criteria**: Search criteria (EmailSearchCriteria)
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

