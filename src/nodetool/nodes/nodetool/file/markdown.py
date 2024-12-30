import re
from typing import Any, List, Dict, Optional
from pydantic import Field
from nodetool.metadata.types import ColumnDef, DataframeRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ExtractLinks(BaseNode):
    """
    Extracts all links from markdown text.
    markdown, links, extraction

    Use cases:
    - Extract references and citations from academic documents
    - Build link graphs from markdown documentation
    - Analyze external resources referenced in markdown files
    """

    markdown: str = Field(default="", description="The markdown text to analyze")
    include_titles: bool = Field(
        default=True, description="Whether to include link titles in output"
    )

    async def process(self, context: ProcessingContext) -> List[Dict[str, str]]:
        # Match both [text](url) and bare <url> formats
        link_pattern = r"\[([^\]]+)\]\(([^)]+)\)|<([^>]+)>"
        links = []

        for match in re.finditer(link_pattern, self.markdown):
            if match.group(1) and match.group(2):  # [text](url) format
                links.append(
                    {
                        "url": match.group(2),
                        "title": match.group(1) if self.include_titles else "",
                    }
                )
            elif match.group(3):  # <url> format
                links.append({"url": match.group(3), "title": ""})

        return links


class ExtractHeaders(BaseNode):
    """
    Extracts headers and creates a document structure/outline.
    markdown, headers, structure

    Use cases:
    - Generate table of contents
    - Analyze document structure
    - Extract main topics from documents
    """

    markdown: str = Field(default="", description="The markdown text to analyze")
    max_level: int = Field(
        default=6, ge=1, le=6, description="Maximum header level to extract (1-6)"
    )

    async def process(self, context: ProcessingContext) -> List[Dict[str, Any]]:
        header_pattern = r"^(#{1,6})\s+(.+)$"
        headers = []

        for line in self.markdown.split("\n"):
            match = re.match(header_pattern, line)
            if match:
                level = len(match.group(1))
                if level <= self.max_level:
                    headers.append(
                        {
                            "level": level,
                            "text": match.group(2).strip(),
                            "index": len(headers),
                        }
                    )

        return headers


class ExtractBulletLists(BaseNode):
    """
    Extracts bulleted lists from markdown.
    markdown, lists, bullets, extraction

    Use cases:
    - Extract unordered list items
    - Analyze bullet point structures
    - Convert bullet lists to structured data
    """

    markdown: str = Field(default="", description="The markdown text to analyze")

    async def process(self, context: ProcessingContext) -> List[Dict[str, Any]]:
        bullet_pattern = r"^\s*[-*+]\s+(.+)$"
        lists = []
        current_list = []

        for line in self.markdown.split("\n"):
            bullet_match = re.match(bullet_pattern, line)

            if bullet_match:
                current_list.append({"text": bullet_match.group(1).strip()})
            elif current_list:
                lists.append(current_list)
                current_list = []

        if current_list:
            lists.append(current_list)

        return lists


class ExtractNumberedLists(BaseNode):
    """
    Extracts numbered lists from markdown.
    markdown, lists, numbered, extraction

    Use cases:
    - Extract ordered list items
    - Analyze enumerated structures
    - Convert numbered lists to structured data
    """

    markdown: str = Field(default="", description="The markdown text to analyze")

    async def process(self, context: ProcessingContext) -> List[str]:
        numbered_pattern = r"^\s*\d+\.\s+(.+)$"
        lists = []
        current_list = []

        for line in self.markdown.split("\n"):
            numbered_match = re.match(numbered_pattern, line)

            if numbered_match:
                current_list.append(numbered_match.group(1).strip())
            elif current_list:
                lists.append(current_list)
                current_list = []

        if current_list:
            lists.append(current_list)

        return lists


class ExtractCodeBlocks(BaseNode):
    """
    Extracts code blocks and their languages from markdown.
    markdown, code, extraction

    Use cases:
    - Extract code samples for analysis
    - Collect programming examples
    - Analyze code snippets in documentation
    """

    markdown: str = Field(default="", description="The markdown text to analyze")

    async def process(self, context: ProcessingContext) -> List[dict[str, str]]:
        code_block_pattern = r"```(\w*)\n(.*?)\n```"
        blocks = []

        for match in re.finditer(code_block_pattern, self.markdown, re.DOTALL):
            language = match.group(1) or "text"
            blocks.append({"language": language, "code": match.group(2).strip()})

        return blocks


class ExtractTables(BaseNode):
    """
    Extracts tables from markdown and converts them to structured data.
    markdown, tables, data

    Use cases:
    - Extract tabular data from markdown
    - Convert markdown tables to structured formats
    - Analyze tabulated information
    """

    markdown: str = Field(default="", description="The markdown text to analyze")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        # Split content into lines
        lines = self.markdown.split("\n")
        current_table = []

        # Find first table in markdown
        for line in lines:
            if "|" in line:
                cells = [cell.strip() for cell in line.split("|")[1:-1]]
                if cells:
                    current_table.append(cells)
            elif current_table:
                break

        # Process table into DataframeRef format
        if len(current_table) > 2:  # Must have headers and separator
            headers = current_table[0]
            data = current_table[2:]  # Skip separator row

            # Create column definitions
            columns = [ColumnDef(name=header, data_type="string") for header in headers]

            return DataframeRef(type="dataframe", columns=columns, data=data)

        # Return empty dataframe if no valid table found
        return DataframeRef(type="dataframe", columns=[], data=[])
