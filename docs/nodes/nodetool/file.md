# nodetool.nodes.nodetool.file

## AbsolutePath

Return the absolute path of a file or directory.

Use cases:
- Convert relative paths to absolute
- Get full system path
- Resolve path references

**Tags:** files, path, absolute

**Fields:**
- **path**: Path to convert to absolute (str)


## Basename

Get the base name component of a file path.

Use cases:
- Extract filename from full path
- Get file name without directory
- Process file names independently

**Tags:** files, path, basename

**Fields:**
- **path**: File path to get basename from (str)
- **remove_extension**: Remove file extension from basename (bool)


## CopyFile

Copy a file from source to destination path.

Use cases:
- Create file backups
- Duplicate files for processing
- Copy files to new locations

**Tags:** files, copy, manage

**Fields:**
- **source_path**: Source file path (FilePath)
- **destination_path**: Destination file path (FilePath)


## CreateDirectory

Create a new directory at specified path.

Use cases:
- Set up directory structure for file organization
- Create output directories for processed files

**Tags:** files, directory, create

**Fields:**
- **path**: Directory path to create (FilePath)
- **exist_ok**: Don't error if directory already exists (bool)


## Dirname

Get the directory name component of a file path.

Use cases:
- Extract directory path from full path
- Get parent directory
- Process directory paths

**Tags:** files, path, dirname

**Fields:**
- **path**: File path to get dirname from (str)


## FileExists

Check if a file or directory exists at the specified path.

Use cases:
- Validate file presence before processing
- Implement conditional logic based on file existence

**Tags:** files, check, exists

**Fields:**
- **path**: Path to check for existence (FilePath)


## FileNameMatch

Match a filename against a pattern using Unix shell-style wildcards.

Use cases:
- Filter files by name pattern
- Validate file naming conventions
- Match file extensions

**Tags:** files, pattern, match, filter

**Fields:**
- **filename**: Filename to check (str)
- **pattern**: Pattern to match against (e.g. *.txt, data_*.csv) (str)
- **case_sensitive**: Whether the pattern matching should be case-sensitive (bool)


## FilterFileNames

Filter a list of filenames using Unix shell-style wildcards.

Use cases:
- Filter multiple files by pattern
- Batch process files matching criteria
- Select files by extension

**Tags:** files, pattern, filter, list

**Fields:**
- **filenames**: list of filenames to filter (list[str])
- **pattern**: Pattern to filter by (e.g. *.txt, data_*.csv) (str)
- **case_sensitive**: Whether the pattern matching should be case-sensitive (bool)


## GetFileInfo

Get information about a file like size, modification time, etc.

Use cases:
- Filter files based on attributes
- Monitor file changes
- Generate file reports

**Tags:** files, metadata, info

**Fields:**
- **path**: Path to file (FilePath)


## GetPathInfo

Gets information about a path.

Use cases:
- Extract path components
- Parse file paths

**Tags:** path, info, metadata

**Fields:**
- **path**: Path to analyze (str)


## JoinPaths

Joins path components.

Use cases:
- Build file paths
- Create cross-platform paths

**Tags:** path, join, combine

**Fields:**
- **paths**: Path components to join (list[str])


## ListFiles

list files in a directory matching a pattern.

Use cases:
- Get files for batch processing
- Filter files by extension or pattern

**Tags:** files, list, directory

**Fields:**
- **directory**: Directory to scan (FilePath)
- **pattern**: File pattern to match (e.g. *.txt) (str)
- **recursive**: Search subdirectories (bool)


## LoadAudio

Read an audio file from disk.

Use cases:
- Load audio for processing
- Import sound files for editing
- Read audio assets for a workflow

**Tags:** audio, input, load, file

**Fields:**
- **path**: Path to the audio file to read (FilePath)


## LoadBytes

Read raw bytes from a file on disk.

Use cases:
- Load binary data for processing
- Read binary files for a workflow

**Tags:** files, bytes, read, input, load, file

**Fields:**
- **path**: Path to the file to read (FilePath)


## LoadCSV

Read a CSV file from disk.

**Tags:** files, csv, read, input, load, file

**Fields:**
- **path**: Path to the CSV file to read (FilePath)


## LoadDocument

Read a document from disk.

**Tags:** files, document, read, input, load, file

**Fields:**
- **path**: Path to the document to read (FilePath)


## LoadImage

Read an image file from disk.

Use cases:
- Load images for processing
- Import photos for editing
- Read image assets for a workflow

**Tags:** image, input, load, file

**Fields:**
- **path**: Path to the image file to read (FilePath)


## LoadVideo

Read a video file from disk.

Use cases:
- Load videos for processing
- Import video files for editing
- Read video assets for a workflow

**Tags:** video, input, load, file

**Fields:**
- **path**: Path to the video file to read (str)


## MoveFile

Move a file from source to destination path.

Use cases:
- Organize files into directories
- Process and archive files
- Relocate completed files

**Tags:** files, move, manage

**Fields:**
- **source_path**: Source file path (FilePath)
- **destination_path**: Destination file path (FilePath)


## NormalizePath

Normalizes a path.

Use cases:
- Standardize paths
- Remove redundant separators

**Tags:** path, normalize, clean

**Fields:**
- **path**: Path to normalize (str)


## PathToString

Convert a FilePath object to a string.

Use cases:
- Get raw string path from FilePath object
- Convert FilePath for string operations
- Extract path string for external use

**Tags:** files, path, string, convert

**Fields:**
- **file_path**: FilePath object to convert to string (FilePath)


## RelativePath

Return a relative path to a target from a start directory.

Use cases:
- Create relative path references
- Generate portable paths
- Compare file locations

**Tags:** files, path, relative

**Fields:**
- **target_path**: Target path to convert to relative (str)
- **start_path**: Start path for relative conversion (str)


## SaveAudio

Write an audio file to disk.

Use cases:
- Save processed audio
- Export edited sound files
- Archive audio results

**Tags:** audio, output, save, file

**Fields:**
- **audio**: The audio to save (AudioRef)
- **path**: Output file path (FilePath)


## SaveBytes

Write raw bytes to a file on disk.

**Tags:** files, bytes, save, output

**Fields:**
- **data**: The bytes to write to file (bytes)
- **path**: Output file path (FilePath)


## SaveCSV

Write a list of dictionaries to a CSV file.

**Tags:** files, csv, write, output, save, file

**Fields:**
- **data**: list of dictionaries to write to CSV (list[dict])
- **path**: Path to the CSV file to write (FilePath)


## SaveCSVDataframe

Write a pandas DataFrame to a CSV file.

**Tags:** files, csv, write, output, save, file

**Fields:**
- **dataframe**: DataFrame to write to CSV (DataframeRef)
- **path**: Path to the CSV file to write (FilePath)


## SaveDocument

Write a document to disk.

**Tags:** files, document, write, output, save, file

**Fields:**
- **document**: The document to save (DocumentRef)
- **path**: Path to the document to write (FilePath)


## SaveImage

Write an image to disk.

Use cases:
- Save processed images
- Export edited photos
- Archive image results

**Tags:** image, output, save, file

**Fields:**
- **image**: The image to save (ImageRef)
- **path**: Output file path (FilePath)


## SaveVideo

Write a video file to disk.

Use cases:
- Save processed videos
- Export edited video files
- Archive video results

**Tags:** video, output, save, file

**Fields:**
- **video**: The video to save (VideoRef)
- **path**: Output file path. Defaults to output.mp4 in current directory (FilePath)


## SplitExtension

Split a path into root and extension components.

Use cases:
- Extract file extension
- Process filename without extension
- Handle file types

**Tags:** files, path, extension, split

**Fields:**
- **path**: Path to split (str)


## SplitPath

Split a path into directory and file components.

Use cases:
- Separate directory from filename
- Process path components separately
- Extract path parts

**Tags:** files, path, split

**Fields:**
- **path**: Path to split (str)


- [nodetool.nodes.nodetool.file.docx](file/docx.md)
- [nodetool.nodes.nodetool.file.excel](file/excel.md)
- [nodetool.nodes.nodetool.file.markdown](file/markdown.md)
- [nodetool.nodes.nodetool.file.pandoc](file/pandoc.md)
- [nodetool.nodes.nodetool.file.pdf](file/pdf.md)
