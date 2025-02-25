from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
from pydantic import Field
from nodetool.nodes.lib.network.imap import search_emails
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    DateCriteria,
    DateSearchCondition,
    Datetime,
    Email,
    EmailFlag,
    EmailSearchCriteria,
    IMAPConnection,
)
import imaplib


KEYWORD_SEPARATOR_REGEX = r"\s+|,|;"


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


class GmailSearch(BaseNode):
    """
    Searches Gmail using Gmail-specific search operators.
    email, gmail, search

    Use cases:
    - Search for emails based on specific criteria
    - Retrieve emails from a specific sender
    - Filter emails by subject, sender, or date
    """

    class DateFilter(Enum):
        SINCE_ONE_HOUR = "SINCE_ONE_HOUR"
        SINCE_ONE_DAY = "SINCE_ONE_DAY"
        SINCE_ONE_WEEK = "SINCE_ONE_WEEK"
        SINCE_ONE_MONTH = "SINCE_ONE_MONTH"
        SINCE_ONE_YEAR = "SINCE_ONE_YEAR"

    class GmailFolder(Enum):
        INBOX = "INBOX"
        SENT_MAIL = "[Gmail]/Sent Mail"
        DRAFTS = "[Gmail]/Drafts"
        SPAM = "[Gmail]/Spam"
        TRASH = "[Gmail]/Trash"

    from_address: str = Field(
        default="",
        description="Sender's email address to search for",
    )
    to_address: str = Field(
        default="",
        description="Recipient's email address to search for",
    )
    subject: str = Field(
        default="",
        description="Text to search for in email subject",
    )
    body: str = Field(
        default="",
        description="Text to search for in email body",
    )
    date_filter: DateFilter = Field(
        default=DateFilter.SINCE_ONE_DAY,
        description="Date filter to search for",
    )
    keywords: str = Field(
        default="",
        description="Custom keywords or labels to search for",
    )
    folder: GmailFolder = Field(
        default=GmailFolder.INBOX,
        description="Email folder to search in",
    )
    text: str = Field(
        default="",
        description="General text to search for anywhere in the email",
    )
    max_results: int = Field(
        default=50,
        description="Maximum number of emails to return",
    )

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["subject", "body", "date_filter", "max_results"]

    async def process(self, context: ProcessingContext) -> list[Email]:
        email_address = context.environment.get("GOOGLE_MAIL_USER")
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not email_address:
            raise ValueError("GOOGLE_MAIL_USER is not set")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        search_criteria = EmailSearchCriteria(
            from_address=(
                self.from_address.strip() if self.from_address.strip() else None
            ),
            to_address=self.to_address.strip() if self.to_address.strip() else None,
            subject=self.subject.strip() if self.subject.strip() else None,
            body=self.body.strip() if self.body.strip() else None,
            date_condition=get_date_condition(self.date_filter),
            keywords=(
                [
                    k.strip()
                    for k in self.keywords.split(KEYWORD_SEPARATOR_REGEX)
                    if k.strip()
                ]
                if self.keywords and self.keywords.strip()
                else []
            ),
            folder=self.folder.value if self.folder else None,
            text=self.text.strip() if self.text and self.text.strip() else None,
        )

        connection = create_gmail_connection(email_address, app_password)
        return search_emails(connection, search_criteria, self.max_results)


class MoveToArchive(BaseNode):
    """
    Moves specified emails to Gmail archive.
    email, gmail, archive
    """

    message_ids: List[str] = Field(
        default=[],
        description="List of message IDs to archive",
    )

    async def process(self, context: ProcessingContext) -> List[str]:
        email_address = context.environment.get("GOOGLE_MAIL_USER")
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not email_address:
            raise ValueError("GOOGLE_MAIL_USER is not set")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(email_address, app_password)

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


class AddLabel(BaseNode):
    """
    Adds a label to a Gmail message.
    email, gmail, label
    """

    email: Email = Field(
        default=Email(),
        description="Email message to label",
    )

    label: str = Field(
        default="",
        description="Label to add to the message",
    )

    async def process(self, context: ProcessingContext) -> Email:
        email_address = context.environment.get("GOOGLE_MAIL_USER")
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not email_address:
            raise ValueError("GOOGLE_MAIL_USER is not set")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(email_address, app_password)

        imap = imaplib.IMAP4_SSL(connection.host, connection.port)
        try:
            imap.login(connection.username, connection.password)
            imap.select("INBOX")

            result = imap.store(self.email.id, "+X-GM-LABELS", self.label)
            if result[0] != "OK":
                raise ValueError(
                    f"Failed to add label {self.label} to message {self.email.id}: {result}"
                )

            return self.email
        finally:
            imap.logout()


def get_date_condition(date_filter: GmailSearch.DateFilter) -> DateSearchCondition:
    """
    Creates a DateSearchCondition based on the specified DateFilter.

    Args:
        date_filter: The DateFilter enum value to convert

    Returns:
        DateSearchCondition configured for the specified filter
    """
    date_deltas = {
        GmailSearch.DateFilter.SINCE_ONE_HOUR: timedelta(hours=1),
        GmailSearch.DateFilter.SINCE_ONE_DAY: timedelta(days=1),
        GmailSearch.DateFilter.SINCE_ONE_WEEK: timedelta(weeks=1),
        GmailSearch.DateFilter.SINCE_ONE_MONTH: timedelta(days=30),
        GmailSearch.DateFilter.SINCE_ONE_YEAR: timedelta(days=365),
    }

    delta = date_deltas[date_filter]
    return DateSearchCondition(
        criteria=DateCriteria.SINCE,
        date=Datetime.from_datetime(datetime.now() - delta),
    )
