import io
from io import BytesIO
import pdfplumber
from typing import List, Optional, Any
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DocumentRef, ImageRef


class ExtractText(BaseNode):
    """
    Extract text content from a PDF file.
    pdf, text, extract

    Use cases:
    - Convert PDF documents to plain text
    - Extract content for analysis
    - Enable text search in PDF documents
    """

    pdf: DocumentRef = Field(
        default=DocumentRef(), description="The PDF file to extract text from"
    )
    start_page: int = Field(
        default=0, description="The start page to extract. 0-based indexing"
    )
    end_page: int = Field(
        default=4, description="The end page to extract. -1 for all pages"
    )

    async def process(self, context: ProcessingContext) -> str:
        if self.pdf.data is None:
            raise ValueError("pdf is not connected")

        pdf_data = await context.asset_to_bytes(self.pdf)
        text = []

        with pdfplumber.open(BytesIO(pdf_data)) as pdf:
            page_range = range(
                self.start_page,
                len(pdf.pages) if self.end_page == -1 else self.end_page,
            )
            for i in page_range:
                if i < 0 or i >= len(pdf.pages):
                    continue
                page = pdf.pages[i]
                text.append(page.extract_text(x_tolerance=2, y_tolerance=2))

        return "\n\n".join(text)


class ExtractImages(BaseNode):
    """
    Extract images from a PDF file.
    pdf, image, extract

    Use cases:
    - Extract embedded images from PDF documents
    - Save PDF images as separate files
    - Process PDF images for analysis
    """

    pdf: DocumentRef = Field(description="The PDF file to extract images from")
    start_page: int = Field(default=0, description="The start page to extract")
    end_page: int = Field(default=4, description="The end page to extract")

    async def process(self, context: ProcessingContext) -> List[ImageRef]:
        pdf_data = await context.asset_to_bytes(self.pdf)
        images = []

        with pdfplumber.open(BytesIO(pdf_data)) as pdf:
            page_range = range(
                self.start_page,
                len(pdf.pages) if self.end_page == -1 else self.end_page,
            )
            for i in page_range:
                if i < 0 or i >= len(pdf.pages):
                    continue
                page = pdf.pages[i]
                for image in page.images:
                    image_bytes = io.BytesIO(image["stream"].get_data())
                    images.append(
                        await context.image_from_bytes(image_bytes.getvalue())
                    )

        return images


class GetPageCount(BaseNode):
    """
    Get the total number of pages in a PDF file.
    pdf, pages, count

    Use cases:
    - Check document length
    - Plan batch processing
    """

    pdf: DocumentRef = Field(description="The PDF file to analyze")

    async def process(self, context: ProcessingContext) -> int:
        pdf_data = await context.asset_to_bytes(self.pdf)
        with pdfplumber.open(BytesIO(pdf_data)) as pdf:
            return len(pdf.pages)


class ExtractPageMetadata(BaseNode):
    """
    Extract metadata from PDF pages like dimensions, rotation, etc.
    pdf, metadata, pages

    Use cases:
    - Analyze page layouts
    - Get page dimensions
    - Check page orientations
    """

    pdf: DocumentRef = Field(description="The PDF file to analyze")
    start_page: int = Field(
        default=0, description="The start page to extract. 0-based indexing"
    )
    end_page: int = Field(
        default=4, description="The end page to extract. -1 for all pages"
    )

    async def process(self, context: ProcessingContext) -> List[dict]:
        pdf_data = await context.asset_to_bytes(self.pdf)
        metadata = []

        with pdfplumber.open(BytesIO(pdf_data)) as pdf:
            page_range = range(
                self.start_page,
                len(pdf.pages) if self.end_page == -1 else self.end_page,
            )
            for i in page_range:
                if i < 0 or i >= len(pdf.pages):
                    continue
                page = pdf.pages[i]
                metadata.append(
                    {
                        "page_number": i + 1,
                        "width": page.width,
                        "height": page.height,
                        "rotation": page.rotation,
                        "bbox": page.bbox,
                    }
                )

        return metadata
