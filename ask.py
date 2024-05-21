import sys
import anthropic
import os
import dotenv

dotenv.load_dotenv()


def get_files(path: str, extensions: list[str] = [".py"]):
    """
    Recursively retrieves all files with specified extensions in the given path.

    Args:
        path (str): The path to search for files.
        extensions (list[str], optional): List of file extensions to include. Defaults to [".py"].

    Returns:
        list[str]: A list of file paths matching the specified extensions.
    """
    if os.path.isfile(path) and os.path.splitext(path)[1] in extensions:
        return [path]
    files = []
    if os.path.isdir(path):
        for file in os.listdir(path):
            files += get_files(os.path.join(path, file), extensions)
    return files


def get_content(paths: list[str], extensions: list[str] = [".py"]):
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


system_prompt = sys.argv[1]
files = sys.argv[2:]
combined = get_content(files)

print(system_prompt)

print("Number of characters in the combined content:", len(combined))

client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=4000,
    temperature=0.7,
    system=system_prompt,
    messages=[
        {
            "role": "user",
            "content": [{"type": "text", "text": combined}],
        },
    ],
)

for m in message.content:
    print(m.text)
