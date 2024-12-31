# nodetool.nodes.nodetool.network.imap

## ConfigureGmail

Configures an IMAP connection for Gmail.
GOOGLE_APP_PASSWORD must be confgured in settings.

To get Gmail credentials:
1. Go to your Google Account settings (https://myaccount.google.com)
2. Navigate to Security > 2-Step Verification
3. Scroll to the bottom and click on "App passwords"
4. Select "Mail" and your device
5. Click "Generate"
6. Use the 16-character password generated as your IMAP password

Note: You must have 2-Step Verification enabled to create app passwords.
For Gmail, use these settings:
- Host: imap.gmail.com
- Port: 993
- Username: Your full Gmail address
- Password: The app password generated above
- Use SSL: True

**Tags:** 

**Fields:**
- **email_address**: Email address to connect to (str)


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


## FetchEmails

Fetches multiple email contents by message IDs.

**Tags:** email, imap, fetch

**Fields:**
- **connection_config**: IMAP connection configuration (IMAPConnection)
- **message_ids**: List of Message IDs to fetch (typing.List[str])


## SearchEmails

Searches for emails matching specified criteria.

**Tags:** email, imap, search

**Fields:**
- **connection_config**: IMAP connection configuration (IMAPConnection)
- **criteria**: IMAP search criteria (e.g. 'UNSEEN', 'FROM user@example.com') (str)


