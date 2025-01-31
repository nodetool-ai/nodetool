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

    search_criteria: EmailSearchCriteria = Field(
        default=EmailSearchCriteria(), description="Search criteria"
    )
    max_results: int = Field(
        default=50,
        description="Maximum number of emails to return",
    )

    async def process(self, context: ProcessingContext) -> list[Email]:
        email_address = context.environment.get("GOOGLE_MAIL_USER")
        app_password = context.environment.get("GOOGLE_APP_PASSWORD")
        if not email_address:
            raise ValueError("GOOGLE_MAIL_USER is not set")
        if not app_password:
            raise ValueError("GOOGLE_APP_PASSWORD is not set")

        connection = create_gmail_connection(email_address, app_password)

        return search_emails(connection, self.search_criteria, self.max_results)


class MoveToArchive(BaseNode):
    """
    Moves specified emails to Gmail archive.
    email, gmail, archive
    """

    message_ids: List[str] = Field(
        default_factory=list,
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


KEYWORD_SEPARATOR_REGEX = r"\s+|,|;"


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


class EmailSearchCriteriaNode(BaseNode):
    """
    Comprehensive Email search criteria using IMAP search operators.
    email, gmail, search
    """

    from_address: str = Field(
        default="",
        description="""Sender's email address to search for.
        - Case-insensitive
        - Partial matches work (e.g., "@company.com")
        - Use quotes for addresses with spaces
        - Multiple addresses can be combined with OR operator
        """,
    )

    to_address: str = Field(
        default="",
        description="""Recipient's email address to search for.
        - Case-insensitive
        - Partial matches work (e.g., "@company.com")
        - Use quotes for addresses with spaces
        - Includes primary recipients only (not CC/BCC)
        """,
    )

    subject: str = Field(
        default="",
        description="""Text to search for in email subject.
        - Case-insensitive
        - Partial word matches work
        - Use quotes for phrases with spaces
        - Special characters should be escaped
        """,
    )

    body: str = Field(
        default="",
        description="""Text to search for in email body.
        - Case-insensitive
        - Searches message body only
        - Use quotes for phrases with spaces
        - HTML and plain text content are searched
        """,
    )

    date_filter: DateFilter = Field(
        default=DateFilter.SINCE_ONE_DAY,
        description="""Date filter to search for.""",
    )

    flags: EmailFlag = Field(
        default_factory=list,
        description="""Email status flag to search for.
        - SEEN/UNSEEN: Read/unread messages
        - ANSWERED/UNANSWERED: Replied/unreplied messages
        - FLAGGED/UNFLAGGED: Starred/unstarred messages
        """,
    )

    keywords: str = Field(
        default="",
        description="""Custom keywords or labels to search for.
        - Case-sensitive
        - Gmail labels are treated as keywords
        - Custom labels are used as-is
        """,
    )
    folder: GmailFolder = Field(
        default=GmailFolder.INBOX,
        description="""Email folder to search in.""",
    )

    text: str = Field(
        default=None,
        description="""General text to search for anywhere in the email.
        - Searches all text fields (subject, body, addresses)
        - Case-insensitive
        - Partial matches work
        - Use quotes for phrases with spaces
        - Most flexible but slower than specific field searches
        """,
    )

    async def process(self, context: ProcessingContext) -> EmailSearchCriteria:
        if self.date_filter == DateFilter.SINCE_ONE_HOUR:
            date_condition = DateSearchCondition(
                criteria=DateCriteria.SINCE,
                date=Datetime.from_datetime(datetime.now() - timedelta(hours=1)),
            )
        elif self.date_filter == DateFilter.SINCE_ONE_DAY:
            date_condition = DateSearchCondition(
                criteria=DateCriteria.SINCE,
                date=Datetime.from_datetime(datetime.now() - timedelta(days=1)),
            )
        elif self.date_filter == DateFilter.SINCE_ONE_WEEK:
            date_condition = DateSearchCondition(
                criteria=DateCriteria.SINCE,
                date=Datetime.from_datetime(datetime.now() - timedelta(weeks=1)),
            )
        elif self.date_filter == DateFilter.SINCE_ONE_MONTH:
            date_condition = DateSearchCondition(
                criteria=DateCriteria.SINCE,
                date=Datetime.from_datetime(datetime.now() - timedelta(days=30)),
            )
        elif self.date_filter == DateFilter.SINCE_ONE_YEAR:
            date_condition = DateSearchCondition(
                criteria=DateCriteria.SINCE,
                date=Datetime.from_datetime(datetime.now() - timedelta(days=365)),
            )

        return EmailSearchCriteria(
            from_address=(
                self.from_address.strip() if self.from_address.strip() else None
            ),
            to_address=(self.to_address.strip() if self.to_address.strip() else None),
            subject=(self.subject.strip() if self.subject.strip() else None),
            body=(self.body.strip() if self.body.strip() else None),
            date_condition=date_condition,
            flags=[self.flags] if self.flags else [],
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
