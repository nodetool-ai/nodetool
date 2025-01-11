from typing import List, Optional
from pydantic import Field
from nodetool.nodes.nodetool.text import convert_html_to_text
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import IMAPConnection
import imaplib
import email
from email.header import decode_header
from typing import List
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Email
from nodetool.metadata.types import EmailSearchCriteria
from typing import List, Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Datetime, Email, IMAPConnection
import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime


def create_gmail_connection(email_address: str, app_password: str) -> IMAPConnection:
    """
    Creates a Gmail connection configuration.

    Args:
        email_address: Gmail address to connect to
        app_password: Google App Password for authentication

    Returns:
        IMAPConnection configured for Gmail

    Raises:
        ValueError: If email_address or app_password is empty
    """
    if not email_address:
        raise ValueError("Email address is required")
    if not app_password:
        raise ValueError("App password is required")

    return IMAPConnection(
        host="imap.gmail.com",
        port=993,
        username=email_address,
        password=app_password,
        use_ssl=True,
    )


def decode_bytes_with_fallback(
    byte_string: bytes, encodings=("utf-8", "latin-1", "ascii")
) -> str:
    """
    Attempts to decode bytes using multiple encodings with fallback to empty string.

    Args:
        byte_string: The bytes to decode
        encodings: Tuple of encodings to try in order

    Returns:
        Decoded string or empty string if all decodings fail
    """
    if not isinstance(byte_string, bytes):
        return str(byte_string)

    for encoding in encodings:
        try:
            return byte_string.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def fetch_emails(imap, message_ids: List[str], batch_size: int = 100) -> List[Email]:
    """
    Fetches email details for the given message IDs in batches.

    Args:
        imap: IMAP connection object
        message_ids: List of email message IDs to fetch
        batch_size: Number of emails to fetch in each batch

    Returns:
        List of Email objects
    """
    emails = []

    # Process message_ids in batches
    for i in range(0, len(message_ids), batch_size):
        batch = message_ids[i : i + batch_size]

        # Fetch batch of messages
        for message_id in batch:
            result, data = imap.fetch(message_id, "(RFC822)")
            if result != "OK" or not data[0] or not isinstance(data[0], tuple):
                continue

            email_body = data[0][1]
            email_message = email.message_from_bytes(email_body)

            subject = decode_header(email_message["Subject"])[0][0]
            subject = (
                decode_bytes_with_fallback(subject)
                if isinstance(subject, bytes)
                else str(subject)
            )

            from_addr = decode_header(email_message["From"])[0][0]
            from_addr = (
                decode_bytes_with_fallback(from_addr)
                if isinstance(from_addr, bytes)
                else str(from_addr)
            )

            date_str = email_message["Date"]
            date = parsedate_to_datetime(date_str) if date_str else None

            emails.append(
                Email(
                    id=message_id,
                    subject=subject,
                    sender=from_addr,
                    date=(Datetime.from_datetime(date) if date else Datetime()),
                    body=get_email_body(email_message),
                )
            )

    return emails


def get_email_body(email_message) -> str:
    """
    Extracts the body content from an email message.

    Args:
        email_message: Email message object to process

    Returns:
        String containing the email body content, preferring plain text over HTML.
        Returns empty string if no content could be extracted.
    """
    if email_message.is_multipart():
        # First try to get text/plain
        text_plain = None
        text_html = None

        for part in email_message.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain":
                payload = part.get_payload(decode=True)
                if payload is not None:
                    text_plain = decode_bytes_with_fallback(payload)
            elif content_type == "text/html":
                payload = part.get_payload(decode=True)
                if payload is not None:
                    text_html = decode_bytes_with_fallback(payload)
                    text_html = convert_html_to_text(text_html)

        # Return text/plain if available, otherwise text/html, or empty string
        return text_plain or text_html or ""

    # For non-multipart messages
    payload = email_message.get_payload(decode=True)
    text = decode_bytes_with_fallback(payload) if payload is not None else ""
    return convert_html_to_text(text)


def build_imap_query(criteria: EmailSearchCriteria) -> str:
    """
    Converts EmailSearchCriteria to IMAP search string.

    Args:
        criteria: Search criteria to convert

    Returns:
        IMAP search query string
    """

    query_parts = []

    if criteria.from_address:
        query_parts.append(f'FROM "{criteria.from_address}"')

    if criteria.to_address:
        query_parts.append(f'TO "{criteria.to_address}"')

    if criteria.subject:
        query_parts.append(f'SUBJECT "{criteria.subject}"')

    if criteria.body:
        query_parts.append(f'BODY "{criteria.body}"')

    if criteria.date_condition:
        date_str = criteria.date_condition.date.to_datetime().strftime("%d-%b-%Y")
        query_parts.append(f'{criteria.date_condition.criteria.value} "{date_str}"')

    for flag in criteria.flags:
        query_parts.append(flag.value)

    for keyword in criteria.keywords:
        query_parts.append(f'KEYWORD "{keyword}"')

    if criteria.text:
        query_parts.append(f'TEXT "{criteria.text}"')

    if not query_parts:
        query_parts.append("ALL")

    return " ".join(query_parts)


def search_emails(
    connection: IMAPConnection, criteria: EmailSearchCriteria, max_results: int = 50
) -> List[Email]:
    """
    Searches emails using IMAP search criteria.

    Args:
        connection: IMAP connection details
        criteria: Search criteria to use
        max_results: Maximum number of results to return

    Returns:
        List of matching emails

    Raises:
        ValueError: If search fails
    """
    imap = imaplib.IMAP4_SSL(connection.host, connection.port)
    try:
        imap.login(connection.username, connection.password)

        # Select folder if specified, otherwise use INBOX
        folder = criteria.folder or "INBOX"
        imap.select(folder)

        query = build_imap_query(criteria)
        result, data = imap.search(None, query)

        if result != "OK":
            raise ValueError(f"Search failed: {result}")

        message_ids = data[0].decode().split()
        message_ids.reverse()  # Newest first
        message_ids = message_ids[:max_results]

        return fetch_emails(imap, message_ids)
    finally:
        imap.logout()


class EmailFields(BaseNode):
    """
    Decomposes an email into its individual components.
    email, decompose, extract

    Takes an Email object and returns its individual fields:
    - id: Message ID
    - subject: Email subject
    - sender: Sender address
    - date: Datetime of email
    - body: Email body content
    """

    email: Email = Field(default=None, description="Email object to decompose")

    @classmethod
    def return_type(cls):
        return {
            "id": str,
            "subject": str,
            "sender": str,
            "date": Datetime,
            "body": str,
        }

    async def process(self, context: ProcessingContext):
        if not self.email:
            raise ValueError("Email is required")

        return {
            "id": self.email.id,
            "subject": self.email.subject,
            "sender": self.email.sender,
            "date": self.email.date,
            "body": self.email.body,
        }


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


class IMAPSearch(BaseNode):
    """
    Searches IMAP using IMAP-specific search operators.
    email, imap, search

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
    """

    connection: IMAPConnection = Field(
        default=IMAPConnection(), description="IMAP connection details"
    )
    search_criteria: EmailSearchCriteria = Field(
        default=EmailSearchCriteria(), description="Search criteria"
    )
    max_results: int = Field(
        default=50,
        description="Maximum number of emails to return",
    )

    async def process(self, context: ProcessingContext) -> list[Email]:
        return search_emails(self.connection, self.search_criteria, self.max_results)
