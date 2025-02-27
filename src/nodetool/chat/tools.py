"""
Tools module providing various utility tools for interacting with files, services and APIs.

This module contains a collection of Tool classes that provide different functionalities:

File Operations:
- ReadFileTool: Read contents of files
- WriteFileTool: Write/append content to files  
- ListDirectoryTool: List directory contents
- SearchFileTool: Search files for text patterns
- ExtractPDFTextTool: Extract text from PDFs
- ExtractPDFTablesTool: Extract tables from PDFs
- ConvertPDFToMarkdownTool: Convert PDFs to markdown

Web & Browser:
- BrowserTool: Control web browser automation
- ScreenshotTool: Take browser screenshots

Search & Database:
- ChromaTextSearchTool: Semantic search in ChromaDB
- ChromaHybridSearchTool: Combined semantic/keyword search
- SemanticDocSearchTool: Search documentation semantically
- KeywordDocSearchTool: Search documentation by keywords

Email (Gmail):
- SearchEmailTool: Search Gmail messages
- ArchiveEmailTool: Archive Gmail messages
- AddLabelTool: Add labels to Gmail messages

Apple Notes:
- CreateAppleNoteTool: Create notes in Apple Notes
- ReadAppleNotesTool: Read from Apple Notes

System:
- ExecuteShellTool: Run shell commands
- ProcessNodeTool: Process workflow nodes
- TestTool: Tool for integration testing
- FindNodeTool: Find nodes in node library

Each tool inherits from the base Tool class and implements:
- input_schema: JSON schema defining the tool's parameters
- process(): Async method to execute the tool's functionality

Tools are used by AI agents to perform operations and integrate with various services.
"""

from datetime import datetime, timedelta
from nodetool.workflows.base_node import (
    BaseNode,
    get_node_class,
    get_registered_node_classes,
)
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any, List, Dict
import os
from chromadb.api.types import IncludeEnum
import pymupdf
import pymupdf4llm
import imaplib
import email
from email.header import decode_header


WORKFLOW_PREFIX = "workflow__"


def sanitize_node_name(node_name: str) -> str:
    """
    Sanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The sanitized node name.
    """
    segments = node_name.split(".")
    if len(node_name) > 50:
        return segments[0] + "__" + segments[-1]
    else:
        return "__".join(node_name.split("."))


class Tool:
    name: str
    description: str
    input_schema: Any

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    def tool_param(self):
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        return params


class ProcessNodeTool(Tool):
    node_name: str
    node_type: type[BaseNode]

    def __init__(self, node_name: str):
        super().__init__(
            name=sanitize_node_name(node_name),
            description=f"Process node {node_name}",
        )
        self.node_name = node_name
        node_type = get_node_class(self.node_name)
        if node_type is None:
            raise ValueError(f"Node {self.node_name} does not exist")
        self.node_type = node_type
        self.input_schema = self.node_type.get_json_schema()

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        node = self.node_type(id="")

        for key, value in params.items():
            node.assign_property(key, value)

        res = await node.process(context)
        out = await node.convert_output(context, res)
        return out


class TestTool(Tool):
    def __init__(self):
        super().__init__(name="test", description="A test tool for integration testing")
        self.input_schema = {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Test message to echo back",
                },
                "delay": {
                    "type": "number",
                    "description": "Optional delay in seconds",
                    "default": 0,
                },
            },
            "required": ["message"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        if params.get("delay", 0) > 0:
            import asyncio

            await asyncio.sleep(params["delay"])
        return {
            "echo": params["message"],
            "timestamp": datetime.now().isoformat(),
        }


class ReadFileTool(Tool):
    def __init__(self):
        super().__init__(
            name="read_file",
            description="Read the contents of a file at the specified path",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read",
                },
                "max_length": {
                    "type": "integer",
                    "description": "Maximum number of characters to read (optional)",
                    "default": 100000,
                },
            },
            "required": ["path"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            path = os.path.expanduser(params["path"])  # Resolve ~ to home directory
            with open(path, "r", encoding="utf-8") as f:
                content = f.read(params.get("max_length"))
                return {
                    "content": content,
                    "truncated": len(content) >= params.get("max_length", 100000),
                }
        except Exception as e:
            return {"error": str(e)}


class WriteFileTool(Tool):
    def __init__(self):
        super().__init__(
            name="write_file",
            description="Write content to a file at the specified path",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path where the file should be written",
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file",
                },
                "mode": {
                    "type": "string",
                    "description": "Write mode: 'w' for overwrite, 'a' for append",
                    "enum": ["w", "a"],
                    "default": "w",
                },
            },
            "required": ["path", "content"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            path = os.path.expanduser(params["path"])  # Resolve ~ to home directory
            with open(path, params.get("mode", "w"), encoding="utf-8") as f:
                f.write(params["content"])
            return {"success": True, "path": path}
        except Exception as e:
            return {"error": str(e)}


class ListDirectoryTool(Tool):
    def __init__(self):
        super().__init__(
            name="list_directory",
            description="List files and directories at the specified path",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path to list",
                },
            },
            "required": ["path"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            from pathlib import Path

            path = Path(
                os.path.expanduser(params["path"])
            )  # Resolve ~ to home directory

            if not path.is_dir():
                return {"error": f"'{params['path']}' is not a directory"}

            files = list(path.iterdir())

            return {
                "files": [str(Path(f).relative_to(path)) for f in files],
                "count": len(files),
            }
        except Exception as e:
            return {"error": str(e)}


class ExecuteShellTool(Tool):
    def __init__(self):
        super().__init__(
            name="execute_shell",
            description="Execute a shell command and return its output (use with caution)",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute",
                },
                "timeout": {
                    "type": "integer",
                    "description": "Maximum execution time in seconds",
                    "default": 30,
                },
                "working_dir": {
                    "type": "string",
                    "description": "Working directory for command execution",
                    "default": ".",
                },
            },
            "required": ["command"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            import asyncio
            import os
            from pathlib import Path

            working_dir = Path(params.get("working_dir", ".")).absolute()
            process = await asyncio.create_subprocess_shell(
                params["command"],
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=params.get("timeout", 30)
                )
                return {
                    "success": process.returncode == 0,
                    "return_code": process.returncode,
                    "stdout": stdout.decode().strip(),
                    "stderr": stderr.decode().strip(),
                }
            except asyncio.TimeoutError:
                process.kill()
                return {
                    "error": f"Command timed out after {params.get('timeout', 30)} seconds"
                }
        except Exception as e:
            return {"error": str(e)}


class BrowserTool(Tool):
    def __init__(self):
        super().__init__(
            name="browser_control",
            description="Control a web browser to navigate and interact with web pages",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform: 'navigate', 'click', 'type', 'quit'",
                    "enum": ["navigate", "click", "type", "quit"],
                },
                "url": {
                    "type": "string",
                    "description": "URL to navigate to (for 'navigate' action)",
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector for the target element (for 'click', 'type' actions)",
                },
                "text": {
                    "type": "string",
                    "description": "Text to type (for 'type' action)",
                },
            },
            "required": ["action"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            from selenium import webdriver
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC

            action = params["action"]

            # Handle quit action separately
            if action == "quit":
                driver = context.get("selenium_driver")
                if driver:
                    driver.quit()
                    context.set("selenium_driver", None)
                return {"success": True, "action": "quit"}

            # Get or create browser instance from context
            driver = context.get("selenium_driver")
            if driver is None:
                options = webdriver.ChromeOptions()
                options.add_argument("--headless=new")  # Enable headless mode
                options.add_argument("--no-sandbox")
                options.add_argument("--disable-dev-shm-usage")
                driver = webdriver.Chrome(options=options)
                context.set("selenium_driver", driver)

            if action == "navigate":
                if "url" not in params:
                    return {"error": "URL is required for navigate action"}
                driver.get(params["url"])
                body = driver.find_element(By.TAG_NAME, "body")
                return {"success": True, "url": params["url"], "body": body.text}

            elif action in ["click", "type", "get_text"]:
                if "selector" not in params:
                    return {"error": "Selector is required for element actions"}

                try:
                    # Wait for element to be present
                    wait = WebDriverWait(driver, 10)
                    elements = wait.until(
                        EC.presence_of_all_elements_located(
                            (By.CSS_SELECTOR, params["selector"])
                        )
                    )

                    if not elements:
                        return {
                            "error": f"No elements found matching selector: {params['selector']}"
                        }

                    if action == "click":
                        elements[0].click()
                        return {"success": True, "action": "click"}
                    elif action == "type":
                        if "text" not in params:
                            return {"error": "Text is required for type action"}
                        elements[0].clear()
                        elements[0].send_keys(params["text"])
                        return {"success": True, "action": "type"}
                    elif action == "get_text":
                        return {
                            "text": [element.text for element in elements],
                            "count": len(elements),
                        }
                except Exception as e:
                    return {"error": f"Error interacting with element: {str(e)}"}

            return {"error": "Invalid action specified"}

        except Exception as e:
            return {"error": str(e)}


class ScreenshotTool(Tool):
    def __init__(self):
        super().__init__(
            name="take_screenshot",
            description="Take a screenshot of the current browser window or a specific element",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": "Optional CSS selector for capturing a specific element",
                },
                "path": {
                    "type": "string",
                    "description": "Path where to save the screenshot",
                    "default": "screenshot.png",
                },
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        from selenium.webdriver.common.by import By

        try:
            driver = context.get("selenium_driver")
            if driver is None:
                return {"error": "No browser session available"}

            path = params.get("path", "screenshot.png")

            if "selector" in params:
                element = driver.find_element(By.CSS_SELECTOR, params["selector"])
                element.screenshot(path)
            else:
                driver.save_screenshot(path)

            return {"success": True, "path": path}

        except Exception as e:
            return {"error": str(e)}


class SearchFileTool(Tool):
    def __init__(self):
        super().__init__(
            name="search_file",
            description="Search for text patterns in files using grep-like functionality",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to search in (file or directory)",
                },
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for",
                },
                "recursive": {
                    "type": "boolean",
                    "description": "Search recursively in subdirectories",
                    "default": False,
                },
                "case_sensitive": {
                    "type": "boolean",
                    "description": "Whether to perform case-sensitive search",
                    "default": False,
                },
                "file_extensions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of file extensions to search (e.g., ['.txt', '.py']). Empty means all files.",
                    "default": [
                        ".txt",
                        ".py",
                        ".md",
                        ".json",
                        ".yaml",
                        ".yml",
                        ".ini",
                        ".cfg",
                    ],
                },
            },
            "required": ["path", "pattern"],
        }

    def is_binary(self, file_path):
        """Check if a file is binary by reading its first few bytes"""
        try:
            with open(file_path, "rb") as f:
                chunk = f.read(1024)
                return b"\0" in chunk  # Binary files typically contain null bytes
        except Exception:
            return True

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            import re
            from pathlib import Path

            path = Path(os.path.expanduser(params["path"]))
            pattern = params["pattern"]
            if not params.get("case_sensitive", False):
                pattern = re.compile(pattern, re.IGNORECASE)
            else:
                pattern = re.compile(pattern)

            allowed_extensions = params.get(
                "file_extensions",
                [".txt", ".py", ".md", ".json", ".yaml", ".yml", ".ini", ".cfg"],
            )
            results = []

            def search_file(file_path):
                matches = []
                # Skip binary files and check file extension if specified
                if (
                    allowed_extensions and file_path.suffix not in allowed_extensions
                ) or self.is_binary(file_path):
                    return matches

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        for i, line in enumerate(f, 1):
                            if pattern.search(line):
                                matches.append(
                                    {
                                        "line_number": i,
                                        "line": line.strip(),
                                        "file": str(file_path),
                                    }
                                )
                except UnicodeDecodeError:
                    # Skip files that can't be decoded as UTF-8
                    pass
                except Exception as e:
                    matches.append(
                        {
                            "file": str(file_path),
                            "error": f"Error reading file: {str(e)}",
                        }
                    )
                return matches

            if path.is_file():
                results.extend(search_file(path))
            elif path.is_dir():
                if params.get("recursive", False):
                    for file_path in path.rglob("*"):
                        if file_path.is_file():
                            results.extend(search_file(file_path))
                else:
                    for file_path in path.glob("*"):
                        if file_path.is_file():
                            results.extend(search_file(file_path))

            return {
                "matches": results,
                "count": len(results),
                "searched_path": str(path),
            }
        except Exception as e:
            return {"error": str(e)}


class ChromaTextSearchTool(Tool):
    def __init__(self):
        super().__init__(
            name="chroma_text_search",
            description="Search all ChromaDB collections for similar text using semantic search",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The text to search for",
                },
                "n_results": {
                    "type": "integer",
                    "description": "Number of results to return",
                    "default": 10,
                },
            },
            "required": ["text"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> dict[str, str]:
        try:
            from nodetool.common.chroma_client import (
                get_all_collections,
            )

            collections = get_all_collections()
            combined = []

            for collection in collections:
                result = collection.query(
                    query_texts=[params["text"]],
                    n_results=params.get("n_results", 5),
                )

                # Sort results by ID for consistency
                if result["documents"] is None:
                    continue
                combined.extend(
                    list(
                        zip(
                            result["ids"][0],
                            result["documents"][0],
                        )
                    )
                )

            combined.sort(key=lambda x: str(x[0]))

            return dict(combined)

        except Exception as e:
            import traceback

            traceback.print_exc()
            return {"error": str(e)}


class ChromaHybridSearchTool(Tool):
    def __init__(self):
        super().__init__(
            name="chroma_hybrid_search",
            description="Search all ChromaDB collections using both semantic and keyword-based search",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The text to search for",
                },
                "n_results": {
                    "type": "integer",
                    "description": "Number of results to return per collection",
                    "default": 5,
                },
                "k_constant": {
                    "type": "number",
                    "description": "Constant for reciprocal rank fusion",
                    "default": 60.0,
                },
                "min_keyword_length": {
                    "type": "integer",
                    "description": "Minimum length for keyword tokens",
                    "default": 3,
                },
            },
            "required": ["text"],
        }

    def _get_keyword_query(self, text: str, min_length: int) -> dict:
        import re

        pattern = r"[ ,.!?\-_=|]+"
        query_tokens = [
            token.strip()
            for token in re.split(pattern, text.lower())
            if len(token.strip()) >= min_length
        ]

        if not query_tokens:
            return {}

        if len(query_tokens) > 1:
            return {"$or": [{"$contains": token} for token in query_tokens]}
        return {"$contains": query_tokens[0]}

    async def process(self, context: ProcessingContext, params: dict) -> dict[str, str]:
        try:
            from nodetool.common.chroma_client import get_all_collections

            if not params["text"].strip():
                return {"error": "Search text cannot be empty"}

            collections = get_all_collections()
            n_results = params.get("n_results", 5)
            k_constant = params.get("k_constant", 60.0)
            min_keyword_length = params.get("min_keyword_length", 3)

            all_results = []

            for collection in collections:
                # Semantic search
                semantic_results = collection.query(
                    query_texts=[params["text"]],
                    n_results=n_results * 2,
                    include=[IncludeEnum.documents],
                )

                # Keyword search
                keyword_query = self._get_keyword_query(
                    params["text"], min_keyword_length
                )
                if keyword_query:
                    keyword_results = collection.query(
                        query_texts=[params["text"]],
                        n_results=n_results * 2,
                        where_document=keyword_query,
                        include=[IncludeEnum.documents],
                    )
                else:
                    keyword_results = semantic_results

                # Combine results using reciprocal rank fusion
                combined_scores = {}

                if semantic_results["documents"]:
                    # Process semantic results
                    for rank, (id_, doc) in enumerate(
                        zip(
                            semantic_results["ids"][0],
                            semantic_results["documents"][0],
                        )
                    ):
                        score = 1 / (rank + k_constant)
                        combined_scores[id_] = {"doc": doc, "score": score}

                if keyword_results["documents"]:
                    # Process keyword results
                    for rank, (id_, doc) in enumerate(
                        zip(
                            keyword_results["ids"][0],
                            keyword_results["documents"][0],
                        )
                    ):
                        score = 1 / (rank + k_constant)
                        if id_ in combined_scores:
                            combined_scores[id_]["score"] += score
                        else:
                            combined_scores[id_] = {"doc": doc, "score": score}

                # Add top results from this collection
                sorted_results = sorted(
                    combined_scores.items(), key=lambda x: x[1]["score"], reverse=True
                )[:n_results]
                all_results.extend(sorted_results)

            # Sort all results and take top n
            final_results = sorted(
                all_results, key=lambda x: x[1]["score"], reverse=True
            )[:n_results]

            # Convert to simple id->document dictionary
            return {str(id_): item["doc"] for id_, item in final_results}

        except Exception as e:
            return {"error": str(e)}


class ExtractPDFTextTool(Tool):
    def __init__(self):
        super().__init__(
            name="extract_pdf_text",
            description="Extract plain text from a PDF document",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the PDF file",
                },
                "start_page": {
                    "type": "integer",
                    "description": "First page to extract (0-based index)",
                    "default": 0,
                },
                "end_page": {
                    "type": "integer",
                    "description": "Last page to extract (-1 for last page)",
                    "default": -1,
                },
            },
            "required": ["path"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            path = os.path.expanduser(params["path"])
            doc = pymupdf.open(path)

            end = params.get("end_page", -1)
            if end == -1:
                end = doc.page_count - 1

            text = ""
            for page_num in range(params.get("start_page", 0), end + 1):
                page = doc[page_num]
                text += page.get_text()  # type: ignore

            return {"text": text}
        except Exception as e:
            return {"error": str(e)}


class ExtractPDFTablesTool(Tool):
    def __init__(self):
        super().__init__(
            name="extract_pdf_tables", description="Extract tables from a PDF document"
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the PDF file",
                },
                "start_page": {
                    "type": "integer",
                    "description": "First page to extract (0-based index)",
                    "default": 0,
                },
                "end_page": {
                    "type": "integer",
                    "description": "Last page to extract (-1 for last page)",
                    "default": -1,
                },
            },
            "required": ["path"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            path = os.path.expanduser(params["path"])
            doc = pymupdf.open(path)

            end = params.get("end_page", -1)
            if end == -1:
                end = doc.page_count - 1

            all_tables = []
            for page_num in range(params.get("start_page", 0), end + 1):
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
                            "external": (
                                table.header.external if table.header else False
                            ),
                        },
                        "content": table.extract(),
                    }
                    all_tables.append(table_data)

            return {"tables": all_tables}
        except Exception as e:
            return {"error": str(e)}


class ConvertPDFToMarkdownTool(Tool):
    def __init__(self):
        super().__init__(
            name="convert_pdf_to_markdown", description="Convert PDF to Markdown format"
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the PDF file",
                },
                "start_page": {
                    "type": "integer",
                    "description": "First page to extract (0-based index)",
                    "default": 0,
                },
                "end_page": {
                    "type": "integer",
                    "description": "Last page to extract (-1 for last page)",
                    "default": -1,
                },
            },
            "required": ["path"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            path = os.path.expanduser(params["path"])
            doc = pymupdf.open(path)

            md_text = pymupdf4llm.to_markdown(doc)

            # If page range is specified, split and extract relevant pages
            start_page = params.get("start_page", 0)
            end_page = params.get("end_page", -1)
            if start_page != 0 or end_page != -1:
                pages = md_text.split("\f")  # Split by form feed character
                end = end_page if end_page != -1 else len(pages) - 1
                md_text = "\f".join(pages[start_page : end + 1])

            return {"markdown": md_text}
        except Exception as e:
            return {"error": str(e)}


def create_gmail_connection(
    context: ProcessingContext,
) -> tuple[imaplib.IMAP4_SSL, str, str]:
    """Helper function to create Gmail IMAP connection"""
    email_address = context.environment.get("GOOGLE_MAIL_USER")
    app_password = context.environment.get("GOOGLE_APP_PASSWORD")

    if not email_address:
        raise ValueError("GOOGLE_MAIL_USER is not set")
    if not app_password:
        raise ValueError("GOOGLE_APP_PASSWORD is not set")

    imap = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    imap.login(email_address, app_password)

    return imap, email_address, app_password


def parse_email_message(msg_data: tuple) -> Dict[str, Any]:
    """Helper function to parse email message data"""
    email_body = email.message_from_bytes(msg_data[0][1])

    # Decode subject
    subject = decode_header(email_body["subject"])[0]
    if isinstance(subject[0], bytes):
        # Try to decode with the specified charset, fall back to alternatives if that fails
        charset = subject[1] or "utf-8"
        try:
            subject_text = subject[0].decode(charset)
        except UnicodeDecodeError:
            try:
                subject_text = subject[0].decode("latin1")
            except UnicodeDecodeError:
                subject_text = subject[0].decode("utf-8", errors="replace")
    else:
        subject_text = str(subject[0])

    # Get body content
    body = ""
    try:
        if email_body.is_multipart():
            for part in email_body.walk():
                if part.get_content_type() == "text/plain":
                    body = part.get_payload(decode=True)
                    break
        else:
            body = email_body.get_payload(decode=True)

        # Try UTF-8 first
        body = body.decode("utf-8")  # type: ignore
    except UnicodeDecodeError:
        body = body.decode("latin1")  # type: ignore
    except Exception:
        body = body.decode("utf-8", errors="replace")  # type: ignore

    return {
        "id": msg_data[0][0].decode(),
        "subject": subject_text,
        "from_address": email_body["from"],
        "to_address": email_body["to"],
        "date": email_body["date"],
        "body": body[:500] + "..." if len(body) > 500 else body,
    }


class SearchEmailTool(Tool):
    def __init__(self):
        super().__init__(
            name="search_email",
            description="Search Gmail using various criteria like sender, subject, date, etc.",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "Text to search for in email subject",
                },
                "since_hours_ago": {
                    "type": "integer",
                    "description": "Number of hours ago to search for",
                    "default": 6,
                },
                "text": {
                    "type": "string",
                    "description": "General text to search for anywhere in the email",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of emails to return",
                    "default": 50,
                },
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            imap, _, _ = create_gmail_connection(context)

            try:
                # Select folder
                imap.select("INBOX")

                # Build search criteria using Gmail's search syntax
                search_criteria = []

                if params.get("subject"):
                    search_criteria.append(f'SUBJECT "{params["subject"]}"')
                if params.get("text"):
                    search_criteria.append(f'BODY "{params["text"]}"')

                # Add date filter
                since_date = (
                    datetime.now()
                    - timedelta(hours=int(params.get("since_hours_ago", 6)))
                ).strftime("%d-%b-%Y")
                search_criteria.append(f"SINCE {since_date}")

                # Combine search criteria
                search_string = " ".join(search_criteria) if search_criteria else "ALL"

                # Perform search with UTF-8 encoding
                _, message_numbers = imap.uid("search", None, search_string)  # type: ignore

                if not message_numbers or not message_numbers[0]:
                    return {
                        "results": [],
                        "count": 0,
                        "message": "No emails found matching the criteria",
                    }

                email_ids = message_numbers[0].split()

                # Reverse the order to get newest first
                email_ids = list(reversed(email_ids))

                # Limit results
                max_results = min(len(email_ids), int(params.get("max_results") or 50))
                results = []

                for i in range(max_results):
                    _, msg_data = imap.uid("fetch", email_ids[i], "(RFC822)")  # type: ignore
                    results.append(parse_email_message(msg_data))  # type: ignore

                return {"results": results, "count": len(results)}

            finally:
                imap.logout()

        except Exception as e:
            import traceback

            traceback.print_exc()
            return {"error": str(e)}


class ArchiveEmailTool(Tool):
    def __init__(self):
        super().__init__(
            name="archive_email",
            description="Move specified emails to Gmail archive",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "message_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of message IDs to archive",
                },
            },
            "required": ["message_ids"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            imap, _, _ = create_gmail_connection(context)

            try:
                imap.select("INBOX")

                archived_ids = []
                for message_id in params["message_ids"]:
                    # Moving to archive in Gmail is done by removing the INBOX label
                    result = imap.store(message_id, "-X-GM-LABELS", "\\Inbox")
                    if result[0] == "OK":
                        archived_ids.append(message_id)

                return {
                    "success": True,
                    "archived_messages": archived_ids,
                }

            finally:
                imap.logout()

        except Exception as e:
            return {"error": str(e)}


class AddLabelTool(Tool):
    def __init__(self):
        super().__init__(
            name="add_label",
            description="Add a label to a Gmail message",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "message_id": {
                    "type": "string",
                    "description": "Message ID to label",
                },
                "label": {
                    "type": "string",
                    "description": "Label to add to the message",
                },
            },
            "required": ["message_id", "label"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            imap, _, _ = create_gmail_connection(context)

            try:
                imap.select("INBOX")

                result = imap.store(
                    params["message_id"], "+X-GM-LABELS", params["label"]
                )

                return {
                    "success": result[0] == "OK",
                    "message_id": params["message_id"],
                    "label": params["label"],
                }

            finally:
                imap.logout()

        except Exception as e:
            return {"error": str(e)}


class CreateAppleNoteTool(Tool):
    def __init__(self):
        super().__init__(
            name="create_apple_note",
            description="Create a new note in Apple Notes on macOS",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the note",
                },
                "body": {
                    "type": "string",
                    "description": "Content of the note",
                },
                "folder": {
                    "type": "string",
                    "description": "Notes folder to save to (defaults to 'Notes')",
                    "default": "Notes",
                },
            },
            "required": ["title", "body"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        from nodetool.nodes.apple.notes import CreateNote, ReadNotes

        try:
            create_note = CreateNote(
                title=params["title"],
                body=params["body"],
                folder=params.get("folder", "Notes"),
            )
            await create_note.process(context)
            return {
                "success": True,
                "message": f"Note '{params['title']}' created in folder '{params.get('folder', 'Notes')}'",
            }
        except Exception as e:
            return {"error": str(e)}


class ReadAppleNotesTool(Tool):
    def __init__(self):
        super().__init__(
            name="read_apple_notes",
            description="Read notes from Apple Notes on macOS",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "note_limit": {
                    "type": "integer",
                    "description": "Maximum number of notes to read (0 for unlimited)",
                    "default": 10,
                },
                "note_limit_per_folder": {
                    "type": "integer",
                    "description": "Maximum notes per folder (0 for unlimited)",
                    "default": 10,
                },
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            from nodetool.nodes.apple.notes import ReadNotes

            read_notes = ReadNotes(
                note_limit=params.get("note_limit", 10),
                note_limit_per_folder=params.get("note_limit_per_folder", 10),
            )
            notes = await read_notes.process(context)
            return {
                "notes": notes,
                "count": len(notes),
            }
        except Exception as e:
            return {"error": str(e)}


node_classes = get_registered_node_classes()


class FindNodeTool(Tool):
    def __init__(self):
        super().__init__(
            name="find_node",
            description="Find a node in the node library",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "node_name": {
                    "type": "string",
                    "description": "Name of the node to find",
                },
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> dict:
        query = params["node_name"]
        for node_class in node_classes:
            if query in node_class.__name__:
                return {
                    "node_class": node_class,
                    "description": node_class.get_description(),
                    "node_type": node_class.get_node_type(),
                    "properties": node_class.properties(),
                }

        return {"error": "Node not found"}


class SemanticDocSearchTool(Tool):
    def __init__(self):
        super().__init__(
            name="semantic_doc_search",
            description="Search documentation using semantic similarity",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The text to search for in the documentation",
                },
            },
            "required": ["query"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            from nodetool.chat.help import semantic_search_documentation

            results = semantic_search_documentation(params["query"])
            return {
                "results": [
                    {
                        "id": result.id,
                        "content": result.content,
                        "metadata": result.metadata,
                    }
                    for result in results
                ]
            }
        except Exception as e:
            return {"error": str(e)}


class KeywordDocSearchTool(Tool):
    def __init__(self):
        super().__init__(
            name="keyword_doc_search",
            description="Search documentation using keyword matching",
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The text to search for in the documentation",
                },
            },
            "required": ["query"],
        }

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        try:
            from nodetool.chat.help import keyword_search_documentation

            results = keyword_search_documentation(params["query"])
            return {
                "results": [
                    {
                        "id": result.id,
                        "content": result.content,
                        "metadata": result.metadata,
                    }
                    for result in results
                ]
            }
        except Exception as e:
            return {"error": str(e)}
