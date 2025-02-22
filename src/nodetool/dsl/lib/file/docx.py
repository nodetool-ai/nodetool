from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddHeading(GraphNode):
    """
    Adds a heading to the document
    document, docx, heading, format
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to add the heading to')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The heading text')
    level: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Heading level (1-9)')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.AddHeading"



class AddImage(GraphNode):
    """
    Adds an image to the document
    document, docx, image, format
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to add the image to')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to add')
    width: float | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image width in inches')
    height: float | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image height in inches')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.AddImage"



class AddPageBreak(GraphNode):
    """
    Adds a page break to the document
    document, docx, format, layout
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to add the page break to')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.AddPageBreak"


import nodetool.nodes.lib.file.docx

class AddParagraph(GraphNode):
    """
    Adds a paragraph of text to the document
    document, docx, text, format
    """

    ParagraphAlignment: typing.ClassVar[type] = nodetool.nodes.lib.file.docx.AddParagraph.ParagraphAlignment
    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to add the paragraph to')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The paragraph text')
    alignment: nodetool.nodes.lib.file.docx.AddParagraph.ParagraphAlignment = Field(default=ParagraphAlignment.LEFT, description='Text alignment')
    bold: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Make text bold')
    italic: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Make text italic')
    font_size: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Font size in points')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.AddParagraph"



class AddTable(GraphNode):
    """
    Adds a table to the document
    document, docx, table, format
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to add the table to')
    rows: int | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Number of rows')
    cols: int | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Number of columns')
    data: List | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Table data as nested lists')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.AddTable"



class CreateDocument(GraphNode):
    """
    Creates a new Word document
    document, docx, file, create
    """


    @classmethod
    def get_node_type(cls): return "lib.file.docx.CreateDocument"



class LoadWordDocument(GraphNode):
    """
    Loads a Word document from disk
    document, docx, file, load, input
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to the document to load')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.LoadWordDocument"



class SaveDocument(GraphNode):
    """
    Writes the document to a file
    document, docx, file, save, output
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to write')
    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='The folder to write the document to.')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n        The filename to write the document to.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.SaveDocument"



class SetDocumentProperties(GraphNode):
    """
    Sets document metadata properties
    document, docx, metadata, properties
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to modify')
    title: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document title')
    author: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document author')
    subject: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document subject')
    keywords: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Document keywords')

    @classmethod
    def get_node_type(cls): return "lib.file.docx.SetDocumentProperties"


