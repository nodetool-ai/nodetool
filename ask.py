import sys
import anthropic
import os
import dotenv
import argparse

"""
This script generates code using the Anthropic model.
It takes a system prompt and a list of files as input.
The content of the files is used to generate the code.

Usage:
    python ask.py "<system_prompt>" <file1> <file2> ...

Examples:
    python ask.py "Generate code to implement a TextField component" web/src/components/
    python ask.py "Generate code to implement a task api" src/api/

The system prompt should be a short description of the code you want to generate.

The files should be the paths to the files you want to include in the generation.

The generated code will be printed to the console.

Note: You need to have the `ANTHROPIC_API_KEY` environment variable set.
"""

dotenv.load_dotenv()


def get_files(
    path: str, extensions: list[str] = [".py", ".js", ".ts", ".jsx", ".tsx", ".md"]
):
    """
    Recursively retrieves all files with specified extensions in the given path.

    Args:
        path (str): The path to search for files.
        extensions (list[str], optional): List of file extensions to include.

    Returns:
        list[str]: A list of file paths matching the specified extensions.
    """
    ext = os.path.splitext(path)[1]
    if os.path.isfile(path) and ext in extensions:
        return [path]
    files = []
    if os.path.isdir(path):
        for file in os.listdir(path):
            files += get_files(os.path.join(path, file), extensions)
    return files


def get_content(
    paths: list[str],
    extensions: list[str] = [".py", ".js", ".ts", ".jsx", ".tsx", ".md"],
):
    """
    Retrieves the content of files with specified extensions in the given paths.

    Args:
        paths (list[str]): A list of paths to search for files.
        extensions (list[str], optional): A list of file extensions to include. Defaults to [".py"].

    Returns:
        str: The concatenated content of all the files found.
    """
    content = ""
    for path in paths:
        for file in get_files(path, extensions):
            content += "\n\n"
            content += f"## {file}\n\n"
            with open(file, "r", encoding="utf-8") as f:
                content += f.read()
    return content


parser = argparse.ArgumentParser(description="Generate text using Anthropic model")

parser.add_argument("prompt", type=str, help="The system prompt for generating text")
parser.add_argument(
    "files", nargs="+", type=str, help="The files to include for generating text"
)

args = parser.parse_args()

system_prompt = args.prompt
files = args.files

print(files)

combined = get_content(files)

print("Number of characters in the combined content:", len(combined))

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-5-sonnet-20240620",
    max_tokens=4000,
    temperature=1.0,
    system=system_prompt,
    messages=[
        {
            "role": "user",
            "content": [{"type": "text", "text": combined}],
        },
    ],
)

for m in message.content:
    if isinstance(m, anthropic.types.text_block.TextBlock):
        print(m.text)
    else:
        print(m.to_json())
