from enum import Enum
from typing import Literal
from pydantic import Field
from nodetool.metadata.types import FilePath
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import pypandoc
import os


class InputFormat(Enum):
    BIBLATEX = "biblatex"
    BIBTEX = "bibtex"
    BITS = "bits"
    COMMONMARK = "commonmark"
    COMMONMARK_X = "commonmark_x"
    CREOLE = "creole"
    CSLJSON = "csljson"
    CSV = "csv"
    DJOT = "djot"
    DOCBOOK = "docbook"
    DOCX = "docx"
    DOKUWIKI = "dokuwiki"
    ENDNOTEXML = "endnotexml"
    EPUB = "epub"
    FB2 = "fb2"
    GFM = "gfm"
    HADDOCK = "haddock"
    HTML = "html"
    IPYNB = "ipynb"
    JATS = "jats"
    JIRA = "jira"
    JSON = "json"
    LATEX = "latex"
    MAN = "man"
    MARKDOWN = "markdown"
    MARKDOWN_GITHUB = "markdown_github"
    MARKDOWN_MMD = "markdown_mmd"
    MARKDOWN_PHPEXTRA = "markdown_phpextra"
    MARKDOWN_STRICT = "markdown_strict"
    MDOC = "mdoc"
    MEDIAWIKI = "mediawiki"
    MUSE = "muse"
    NATIVE = "native"
    ODT = "odt"
    OPML = "opml"
    ORG = "org"
    RIS = "ris"
    RST = "rst"
    RTF = "rtf"
    T2T = "t2t"
    TEXTILE = "textile"
    TIKIWIKI = "tikiwiki"
    TSV = "tsv"
    TWIKI = "twiki"
    TYPST = "typst"
    VIMWIKI = "vimwiki"


class OutputFormat(Enum):
    """Pandoc output-only formats"""

    ASCIIDOC = "asciidoc"
    ASCIIDOCTOR = "asciidoctor"
    BEAMER = "beamer"
    CONTEXT = "context"
    DOCBOOK4 = "docbook4"
    DOCBOOK5 = "docbook5"
    DOCX = "docx"
    EPUB2 = "epub2"
    EPUB3 = "epub3"
    PDF = "pdf"
    PLAIN = "plain"
    PPTX = "pptx"
    SLIDEOUS = "slideous"
    SLIDY = "slidy"
    DZSLIDES = "dzslides"
    REVEALJS = "revealjs"
    S5 = "s5"
    TEI = "tei"
    TEXINFO = "texinfo"
    ZIMWIKI = "zimwiki"


class ConvertFile(BaseNode):
    """
    Converts between different document formats using pandoc.
    convert, document, format, pandoc

    Use cases:
    - Convert between various document formats (Markdown, HTML, LaTeX, etc.)
    - Generate documentation in different formats
    - Create publication-ready documents
    """

    input_path: FilePath = Field(
        default=FilePath(), description="Path to the input file"
    )
    input_format: InputFormat = Field(
        default=InputFormat.MARKDOWN, description="Input format"
    )
    output_format: OutputFormat = Field(
        default=OutputFormat.PDF, description="Output format"
    )
    extra_args: list[str] = Field(
        default_factory=list, description="Additional pandoc arguments"
    )

    async def process(self, context: ProcessingContext) -> str:
        assert self.input_path.path, "Input path is not set"
        expanded_path = os.path.expanduser(self.input_path.path)
        if not os.path.exists(expanded_path):
            raise ValueError(f"Input file not found: {expanded_path}")

        return pypandoc.convert_file(
            expanded_path,
            self.output_format.value,
            format=self.input_format.value,
            extra_args=self.extra_args,
        )


class ConvertText(BaseNode):
    """
    Converts text content between different document formats using pandoc.
    convert, text, format, pandoc

    Use cases:
    - Convert text content between various formats (Markdown, HTML, LaTeX, etc.)
    - Transform content without saving to disk
    - Process text snippets in different formats
    """

    content: str = Field(description="Text content to convert")
    input_format: InputFormat = Field(description="Input format")
    output_format: OutputFormat = Field(description="Output format")
    extra_args: list[str] = Field(
        default_factory=list, description="Additional pandoc arguments"
    )

    async def process(self, context: ProcessingContext) -> str:
        return pypandoc.convert_text(
            self.content,
            self.output_format.value,
            format=self.input_format.value,
            extra_args=self.extra_args,
        )
