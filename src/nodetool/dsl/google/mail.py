from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddLabel(GraphNode):
    """
    Adds a label to a Gmail message.
    email, gmail, label
    """

    email: Email | GraphNode | tuple[GraphNode, str] = Field(default=Email(type='email', id='', sender='', subject='', date=Datetime(type='datetime', year=0, month=0, day=0, hour=0, minute=0, second=0, microsecond=0, tzinfo='UTC', utc_offset=0), body=''), description='Email message to label')
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Label to add to the message')

    @classmethod
    def get_node_type(cls): return "google.mail.AddLabel"


import nodetool.nodes.google.mail
import nodetool.nodes.google.mail

class GmailSearch(GraphNode):
    """
    Searches Gmail using Gmail-specific search operators.
    email, gmail, search

    Use cases:
    - Search for emails based on specific criteria
    - Retrieve emails from a specific sender
    - Filter emails by subject, sender, or date
    """

    DateFilter: typing.ClassVar[type] = nodetool.nodes.google.mail.GmailSearch.DateFilter
    GmailFolder: typing.ClassVar[type] = nodetool.nodes.google.mail.GmailSearch.GmailFolder
    from_address: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Sender's email address to search for")
    to_address: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="Recipient's email address to search for")
    subject: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to search for in email subject')
    body: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to search for in email body')
    date_filter: nodetool.nodes.google.mail.GmailSearch.DateFilter = Field(default=DateFilter.SINCE_ONE_DAY, description='Date filter to search for')
    keywords: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Custom keywords or labels to search for')
    folder: nodetool.nodes.google.mail.GmailSearch.GmailFolder = Field(default=GmailFolder.INBOX, description='Email folder to search in')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='General text to search for anywhere in the email')
    max_results: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Maximum number of emails to return')

    @classmethod
    def get_node_type(cls): return "google.mail.GmailSearch"



class MoveToArchive(GraphNode):
    """
    Moves specified emails to Gmail archive.
    email, gmail, archive
    """

    message_ids: List | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of message IDs to archive')

    @classmethod
    def get_node_type(cls): return "google.mail.MoveToArchive"


