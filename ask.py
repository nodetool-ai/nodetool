import sys
import anthropic
import dotenv
import argparse

from nodetool.common.environment import Environment
from nodetool.common.get_files import get_content

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate text using Anthropic model")

    parser.add_argument(
        "prompt", type=str, help="The system prompt for generating text"
    )
    parser.add_argument(
        "files", nargs="+", type=str, help="The files to include for generating text"
    )

    args = parser.parse_args()

    system_prompt = args.prompt
    files = args.files

    print(files)

    combined = get_content(files)

    print("Number of characters in the combined content:", len(combined))

    client = Environment.get_anthropic_client()
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
