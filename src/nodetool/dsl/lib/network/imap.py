from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConfigureIMAP(GraphNode):
    """
    Creates an IMAP configuration for email operations.
    email, imap, config

    Use cases:
    - Set up email access credentials
    - Enable programmatic email access
    """

    host: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='IMAP server hostname (e.g. imap.gmail.com)')
    port: int | GraphNode | tuple[GraphNode, str] = Field(default=993, description='IMAP server port')
    username: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Email account username')
    password: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Email account password')
    use_ssl: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use SSL/TLS connection')

    @classmethod
    def get_node_type(cls): return "lib.network.imap.ConfigureIMAP"



class EmailFields(GraphNode):
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

    email: Email | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Email object to decompose')

    @classmethod
    def get_node_type(cls): return "lib.network.imap.EmailFields"



class IMAPSearch(GraphNode):
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

    connection: IMAPConnection | GraphNode | tuple[GraphNode, str] = Field(default=IMAPConnection(type='imap_connection', host='', port=993, username='', password='', use_ssl=True), description='IMAP connection details')
    search_criteria: EmailSearchCriteria | GraphNode | tuple[GraphNode, str] = Field(default=EmailSearchCriteria(type='email_search_criteria', from_address=None, to_address=None, subject=None, body=None, cc=None, bcc=None, date_condition=None, flags=[], keywords=[], folder=None, text=None), description='Search criteria')
    max_results: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Maximum number of emails to return')

    @classmethod
    def get_node_type(cls): return "lib.network.imap.IMAPSearch"


