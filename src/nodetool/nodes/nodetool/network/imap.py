from typing import List, Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import IMAPConnection
import imaplib
import email
from email.header import decode_header


class ConfigureIMAP(BaseNode):
    """
    Creates an IMAP configuration for email operations.
    email, imap, config

    Use cases:
    - Set up email access credentials
    - Enable programmatic email access
    """

    host: str = Field(
        default="", description="IMAP server hostname (e.g. imap.gmail.com)"
    )
    port: int = Field(default=993, description="IMAP server port")
    username: str = Field(default="", description="Email account username")
    password: str = Field(default="", description="Email account password")
    use_ssl: bool = Field(default=True, description="Whether to use SSL/TLS connection")

    async def process(self, context: ProcessingContext) -> IMAPConnection:
        config = IMAPConnection(
            host=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            use_ssl=self.use_ssl,
        )

        if not config.is_configured():
            raise ValueError("IMAP configuration is incomplete")

        return config


class ConfigureGmail(BaseNode):
    """
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
    """

    email_address: str = Field(default="", description="Email address to connect to")

    async def process(self, context: ProcessingContext) -> IMAPConnection:
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        if not self.email_address:
            raise ValueError("Email address is required")

        return IMAPConnection(
            host="imap.gmail.com",
            port=993,
            username=self.email_address,
            password=app_password,
            use_ssl=True,
        )


class SearchEmails(BaseNode):
    """
    Searches for emails matching specified criteria.
    email, imap, search
    """

    connection_config: IMAPConnection = Field(
        default=IMAPConnection(), description="IMAP connection configuration"
    )
    criteria: str = Field(
        default="ALL",
        description="IMAP search criteria (e.g. 'UNSEEN', 'FROM user@example.com')",
    )

    async def process(self, context: ProcessingContext) -> List[str]:
        # Create connection only when needed
        if self.connection_config.use_ssl:
            imap = imaplib.IMAP4_SSL(
                self.connection_config.host, self.connection_config.port
            )
        else:
            imap = imaplib.IMAP4(
                self.connection_config.host, self.connection_config.port
            )

        try:
            imap.login(self.connection_config.username, self.connection_config.password)

            # Select INBOX by default
            imap.select("INBOX")

            result, data = imap.search(None, self.criteria)
            if result != "OK":
                raise ValueError(f"Search failed: {result}")

            return data[0].decode().split()
        finally:
            imap.logout()


class FetchEmails(BaseNode):
    """
    Fetches multiple email contents by message IDs.
    email, imap, fetch
    """

    connection_config: IMAPConnection = Field(
        default=IMAPConnection(), description="IMAP connection configuration"
    )
    message_ids: List[str] = Field(
        default_factory=list, description="List of Message IDs to fetch"
    )

    async def process(self, context: ProcessingContext) -> List[dict]:
        if not self.message_ids:
            return []

        # Create connection only when needed
        if self.connection_config.use_ssl:
            imap = imaplib.IMAP4_SSL(
                self.connection_config.host, self.connection_config.port
            )
        else:
            imap = imaplib.IMAP4(
                self.connection_config.host, self.connection_config.port
            )

        try:
            imap.login(self.connection_config.username, self.connection_config.password)
            imap.select("INBOX")

            emails = []
            for message_id in self.message_ids:
                result, data = imap.fetch(message_id, "(RFC822)")
                if result != "OK":
                    continue  # Skip failed messages instead of raising error

                if not data[0] or not isinstance(data[0], tuple) or len(data[0]) != 2:
                    continue

                email_body = data[0][1]
                email_message = email.message_from_bytes(email_body)

                subject = decode_header(email_message["Subject"])[0][0]
                if isinstance(subject, bytes):
                    subject = subject.decode()

                from_addr = decode_header(email_message["From"])[0][0]
                if isinstance(from_addr, bytes):
                    from_addr = from_addr.decode()

                emails.append(
                    {
                        "id": message_id,
                        "subject": subject,
                        "from": from_addr,
                        "date": email_message["Date"],
                        "body": self._get_email_body(email_message),
                    }
                )

            return emails
        finally:
            imap.logout()

    def _get_email_body(self, email_message) -> str:
        if email_message.is_multipart():
            # Handle multipart messages
            for part in email_message.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload is not None:
                        return payload.decode()
            return ""  # Return empty string if no text/plain part found

        # Handle single part messages
        payload = email_message.get_payload(decode=True)
        if payload is not None:
            return payload.decode()
        return ""  # Return empty string if payload is None
