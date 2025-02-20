from io import BytesIO
from typing import List, Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DocumentRef
import pymupdf
import pymupdf4llm


class ExtractText(BaseNode):
    """
    Extract plain text from a PDF document using PyMuPDF.
    pdf, text, extract

    Use cases:
    - Extract raw text content from PDFs
    - Convert PDF documents to plain text
    - Prepare text for further processing
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(), description="The PDF document to extract text from"
    )
    start_page: int = Field(
        default=0, description="First page to extract (0-based index)"
    )
    end_page: int = Field(
        default=-1, description="Last page to extract (-1 for last page)"
    )

    async def process(self, context: ProcessingContext) -> str:
        pdf_data = await context.asset_to_bytes(self.pdf)
        doc = pymupdf.open(stream=pdf_data, filetype="pdf")

        end = self.end_page if self.end_page != -1 else doc.page_count - 1
        text = ""
        for page_num in range(self.start_page, end + 1):
            page = doc[page_num]
            text += page.get_text()  # type: ignore

        return text


class ExtractTextBlocks(BaseNode):
    """
    Extract text blocks with their bounding boxes from a PDF.
    pdf, text, blocks, layout

    Use cases:
    - Analyze text layout and structure
    - Extract text while preserving block-level formatting
    - Get text position information
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(),
        description="The PDF document to extract text blocks from",
    )
    start_page: int = Field(
        default=0, description="First page to extract (0-based index)"
    )
    end_page: int = Field(
        default=-1, description="Last page to extract (-1 for last page)"
    )

    async def process(self, context: ProcessingContext) -> List[dict]:
        pdf_data = await context.asset_to_bytes(self.pdf)
        doc = pymupdf.open(stream=pdf_data, filetype="pdf")

        end = self.end_page if self.end_page != -1 else doc.page_count - 1
        blocks = []
        for page_num in range(self.start_page, end + 1):
            page = doc[page_num]
            blocks.extend(page.get_text("blocks"))  # type: ignore

        return blocks


class ExtractTextWithStyle(BaseNode):
    """
    Extract text with style information (font, size, color) from a PDF.
    pdf, text, style, formatting

    Use cases:
    - Preserve text formatting during extraction
    - Analyze document styling
    - Extract text with font information
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(),
        description="The PDF document to extract styled text from",
    )
    start_page: int = Field(
        default=0, description="First page to extract (0-based index)"
    )
    end_page: int = Field(
        default=-1, description="Last page to extract (-1 for last page)"
    )

    async def process(self, context: ProcessingContext) -> List[dict]:
        pdf_data = await context.asset_to_bytes(self.pdf)
        doc = pymupdf.open(stream=pdf_data, filetype="pdf")

        end = self.end_page if self.end_page != -1 else doc.page_count - 1
        styled_text = []
        for page_num in range(self.start_page, end + 1):
            page = doc[page_num]
            dict_list = page.get_text("dict")  # type: ignore

            for block in dict_list["blocks"]:
                if "lines" in block:
                    for line in block["lines"]:
                        for span in line["spans"]:
                            styled_text.append(
                                {
                                    "text": span["text"],
                                    "font": span["font"],
                                    "size": span["size"],
                                    "color": span["color"],
                                    "bbox": {
                                        "x0": span["bbox"][0],
                                        "y0": span["bbox"][1],
                                        "x1": span["bbox"][2],
                                        "y1": span["bbox"][3],
                                    },
                                }
                            )

        return styled_text


class ExtractTables(BaseNode):
    """
    Extract tables from a PDF document using PyMuPDF.
    pdf, tables, extract, structured

    Use cases:
    - Extract tabular data from PDFs
    - Convert PDF tables to structured formats
    - Analyze table layouts and content
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(),
        description="The PDF document to extract tables from",
    )
    start_page: int = Field(
        default=0, description="First page to extract (0-based index)"
    )
    end_page: int = Field(
        default=-1, description="Last page to extract (-1 for last page)"
    )

    async def process(self, context: ProcessingContext) -> List[dict]:
        pdf_data = await context.asset_to_bytes(self.pdf)
        doc = pymupdf.open(stream=pdf_data, filetype="pdf")

        end = self.end_page if self.end_page != -1 else doc.page_count - 1
        all_tables = []

        for page_num in range(self.start_page, end + 1):
            page = doc[page_num]
            tables = page.find_tables()  # type: ignore

            for table in tables:
                table_data = {
                    "page": page_num,
                    "bbox": {
                        "x0": table.bbox[0],
                        "y0": table.bbox[1],
                        "x1": table.bbox[2],
                        "y1": table.bbox[3],
                    },
                    "rows": table.row_count,
                    "columns": table.col_count,
                    "header": {
                        "names": table.header.names if table.header else [],
                        "external": table.header.external if table.header else False,
                    },
                    "content": table.extract(),
                }
                all_tables.append(table_data)

        return all_tables


class ExtractMarkdown(BaseNode):
    """
    Convert PDF to Markdown format using pymupdf4llm.
    pdf, markdown, convert

    Use cases:
    - Convert PDF documents to markdown format
    - Preserve document structure in markdown
    - Create editable markdown from PDFs
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(),
        description="The PDF document to convert to markdown",
    )
    start_page: int = Field(
        default=0, description="First page to extract (0-based index)"
    )
    end_page: int = Field(
        default=-1, description="Last page to extract (-1 for last page)"
    )

    async def process(self, context: ProcessingContext) -> str:

        pdf_data = await context.asset_to_bytes(self.pdf)

        doc = pymupdf.open(stream=pdf_data, filetype="pdf")

        md_text = pymupdf4llm.to_markdown(doc)

        # If page range is specified, split and extract relevant pages
        if self.start_page != 0 or self.end_page != -1:
            pages = md_text.split("\f")  # Split by form feed character
            end = self.end_page if self.end_page != -1 else len(pages) - 1
            md_text = "\f".join(pages[self.start_page : end + 1])

        return md_text
