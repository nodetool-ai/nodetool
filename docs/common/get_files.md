# nodetool.common.get_files

### get_content

Retrieves the content of files with specified extensions in the given paths.


**Args:**

- **paths (list[str])**: A list of paths to search for files.
- **extensions (list[str], optional)**: A list of file extensions to include. Defaults to [".py"].


**Returns:**

- **str**: The concatenated content of all the files found.
**Args:**
- **paths (list[str])**
- **extensions (list[str]) (default: ['.py', '.js', '.ts', '.jsx', '.tsx', '.md'])**

### get_files

Recursively retrieves all files with specified extensions in the given path.


**Args:**

- **path (str)**: The path to search for files.
- **extensions (list[str], optional)**: List of file extensions to include.


**Returns:**

- **list[str]**: A list of file paths matching the specified extensions.
**Args:**
- **path (str)**
- **extensions (list[str]) (default: ['.py', '.js', '.ts', '.jsx', '.tsx', '.md'])**

