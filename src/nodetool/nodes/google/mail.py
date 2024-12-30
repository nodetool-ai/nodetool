from typing import List, Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import IMAPConnection
import imaplib
import email
from email.header import decode_header


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


def fetch_emails(imap, message_ids: List[str]) -> List[dict]:
    emails = []
    for message_id in message_ids:
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

        emails.append(
            {
                "id": message_id,
                "subject": subject,
                "from": from_addr,
                "date": email_message["Date"],
                "body": get_email_body(email_message),
            }
        )

    return emails


def get_email_body(email_message) -> str:
    if email_message.is_multipart():
        for part in email_message.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload is not None:
                    return decode_bytes_with_fallback(payload)
        return ""

    payload = email_message.get_payload(decode=True)
    return decode_bytes_with_fallback(payload) if payload is not None else ""


class GmailSearch(BaseNode):
    """
    Searches Gmail using Gmail-specific search operators.
    email, gmail, search

    Examples of Gmail search operators:
    - from:sender@example.com
    - to:recipient@example.com
    - subject:hello
    - has:attachment
    - newer_than:2d
    - older_than:1y
    - label:important
    """

    email_address: str = Field(default="", description="Gmail address to connect to")
    search_query: str = Field(
        default="",
        description="Gmail search query using Gmail search operators: from:sender@example.com to:recipient@example.com subject:hello has:attachment newer_than:2d older_than:1y label:important",
    )
    max_results: int = Field(
        default=50,
        description="Maximum number of emails to return",
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(self.email_address, app_password)

        imap = imaplib.IMAP4_SSL(connection.host, connection.port)
        try:
            imap.login(connection.username, connection.password)
            imap.select("INBOX")

            result, data = imap.search(
                None, f'X-GM-RAW "{self.search_query}"' if self.search_query else "ALL"
            )
            if result != "OK":
                raise ValueError(f"Search failed: {result}")

            message_ids = data[0].decode().split()[: self.max_results]
            return fetch_emails(imap, message_ids)
        finally:
            imap.logout()


class GmailLabel(BaseNode):
    """
    Searches Gmail for emails with specific labels.
    email, gmail, label
    """

    email_address: str = Field(default="", description="Gmail address to connect to")
    label: str = Field(
        default="INBOX",
        description="Gmail label to search (e.g., INBOX, SENT, DRAFT, SPAM)",
    )
    unread_only: bool = Field(
        default=False,
        description="Only return unread emails",
    )
    max_results: int = Field(
        default=50,
        description="Maximum number of emails to return",
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(self.email_address, app_password)

        imap = imaplib.IMAP4_SSL(connection.host, connection.port)
        try:
            imap.login(connection.username, connection.password)
            imap.select("INBOX")

            criteria = f'X-GM-RAW "in:{self.label}"'
            if self.unread_only:
                criteria = f"{criteria} UNSEEN"

            result, data = imap.search(None, criteria)
            if result != "OK":
                raise ValueError(f"Search failed: {result}")

            message_ids = data[0].decode().split()[: self.max_results]
            return fetch_emails(imap, message_ids)
        finally:
            imap.logout()


class MoveToArchive(BaseNode):
    """
    Moves specified emails to Gmail archive.
    email, gmail, archive
    """

    email_address: str = Field(default="", description="Gmail address to connect to")
    message_ids: List[str] = Field(
        default_factory=list,
        description="List of message IDs to archive",
    )

    async def process(self, context: ProcessingContext) -> List[str]:
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(self.email_address, app_password)

        imap = imaplib.IMAP4_SSL(connection.host, connection.port)
        try:
            imap.login(connection.username, connection.password)
            imap.select("INBOX")

            # Moving to archive in Gmail is done by removing the INBOX label
            for message_id in self.message_ids:
                result = imap.store(message_id, "-X-GM-LABELS", "\\Inbox")
                if result[0] != "OK":
                    raise ValueError(
                        f"Failed to archive message {message_id}: {result}"
                    )

            return self.message_ids
        finally:
            imap.logout()
