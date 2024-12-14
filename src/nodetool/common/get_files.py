import os


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
