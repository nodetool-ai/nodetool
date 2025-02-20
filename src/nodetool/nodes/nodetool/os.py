import csv
import os
import shutil
import glob
from datetime import datetime
import pandas as pd
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    Datetime,
    DocumentRef,
    FilePath,
    ImageRef,
    AudioRef,
    VideoRef,
    DataframeRef,
    FolderPath,
)

from enum import Enum
import tempfile
from typing import List, Optional
import os
import shutil
from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
import subprocess


class GetEnvironmentVariable(BaseNode):
    """
    Gets an environment variable value.
    environment, variable, system

    Use cases:
    - Access configuration
    - Get system settings
    """

    name: str = Field(default="", description="Environment variable name")
    default: Optional[str] = Field(
        default=None, description="Default value if not found"
    )

    async def process(self, context: ProcessingContext) -> Optional[str]:
        return os.environ.get(self.name, self.default)


class SetEnvironmentVariable(BaseNode):
    """
    Sets an environment variable.
    environment, variable, system

    Use cases:
    - Configure runtime settings
    - Set up process environment
    """

    name: str = Field(default="", description="Environment variable name")
    value: str = Field(default="", description="Environment variable value")

    async def process(self, context: ProcessingContext) -> None:
        os.environ[self.name] = self.value
        return None


class GetSystemInfo(BaseNode):
    """
    Gets system information.
    system, info, platform

    Use cases:
    - Check system compatibility
    - Platform-specific logic
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> dict:
        return {
            "name": os.name,
            "current_dir": os.getcwd(),
            "cpu_count": os.cpu_count(),
            "path_separator": os.sep,
            "line_separator": os.linesep,
            "username": os.getlogin(),
        }


class FileExists(BaseNode):
    """
    Check if a file or directory exists at the specified path.
    files, check, exists

    Use cases:
    - Validate file presence before processing
    - Implement conditional logic based on file existence
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(
        default=FilePath(), description="Path to check for existence"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if not self.path or not self.path.path:
            raise ValueError("'path' field cannot be empty")
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.exists(expanded_path)


class ListFiles(BaseNode):
    """
    list files in a directory matching a pattern.
    files, list, directory

    Use cases:
    - Get files for batch processing
    - Filter files by extension or pattern
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    directory: FilePath = Field(
        default=FilePath(path="~"), description="Directory to scan"
    )
    pattern: str = Field(default="*", description="File pattern to match (e.g. *.txt)")
    recursive: bool = Field(default=False, description="Search subdirectories")

    async def process(self, context: ProcessingContext) -> list[FilePath]:
        if not self.directory.path:
            raise ValueError("directory cannot be empty")
        expanded_directory = os.path.expanduser(self.directory.path)

        if self.recursive:
            pattern = os.path.join(expanded_directory, "**", self.pattern)
            paths = glob.glob(pattern, recursive=True)
        else:
            pattern = os.path.join(expanded_directory, self.pattern)
            paths = glob.glob(pattern)

        return [FilePath(path=p) for p in paths]


class CopyFile(BaseNode):
    """
    Copy a file from source to destination path.
    files, copy, manage

    Use cases:
    - Create file backups
    - Duplicate files for processing
    - Copy files to new locations
    """

    source_path: FilePath = Field(default=FilePath(), description="Source file path")
    destination_path: FilePath = Field(
        default=FilePath(), description="Destination file path"
    )

    async def process(self, context: ProcessingContext):
        if not self.source_path or not self.source_path.path:
            raise ValueError("'source_path' field cannot be empty")
        if not self.destination_path or not self.destination_path.path:
            raise ValueError("'destination_path' field cannot be empty")
        expanded_source = os.path.expanduser(self.source_path.path)
        expanded_dest = os.path.expanduser(self.destination_path.path)

        shutil.copy2(expanded_source, expanded_dest)


class MoveFile(BaseNode):
    """
    Move a file from source to destination path.
    files, move, manage

    Use cases:
    - Organize files into directories
    - Process and archive files
    - Relocate completed files
    """

    source_path: FilePath = Field(default=FilePath(), description="Source file path")
    destination_path: FilePath = Field(
        default=FilePath(), description="Destination file path"
    )

    async def process(self, context: ProcessingContext):
        expanded_source = os.path.expanduser(self.source_path.path)
        expanded_dest = os.path.expanduser(self.destination_path.path)

        shutil.move(expanded_source, expanded_dest)


class CreateDirectory(BaseNode):
    """
    Create a new directory at specified path.
    files, directory, create

    Use cases:
    - Set up directory structure for file organization
    - Create output directories for processed files
    """

    path: FilePath = Field(default=FilePath(), description="Directory path to create")
    exist_ok: bool = Field(
        default=True, description="Don't error if directory already exists"
    )

    async def process(self, context: ProcessingContext):
        expanded_path = os.path.expanduser(self.path.path)
        os.makedirs(expanded_path, exist_ok=self.exist_ok)


class GetFileSize(BaseNode):
    """
    Get file size in bytes.
    files, metadata, size
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> int:
        expanded_path = os.path.expanduser(self.path.path)
        stats = os.stat(expanded_path)
        return stats.st_size


class CreatedTime(BaseNode):
    """
    Get file creation timestamp.
    files, metadata, created, time
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> Datetime:
        expanded_path = os.path.expanduser(self.path.path)
        stats = os.stat(expanded_path)
        return Datetime.from_datetime(datetime.fromtimestamp(stats.st_ctime))


class ModifiedTime(BaseNode):
    """
    Get file last modified timestamp.
    files, metadata, modified, time
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> Datetime:
        expanded_path = os.path.expanduser(self.path.path)
        stats = os.stat(expanded_path)
        return Datetime.from_datetime(datetime.fromtimestamp(stats.st_mtime))


class AccessedTime(BaseNode):
    """
    Get file last accessed timestamp.
    files, metadata, accessed, time
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> Datetime:
        expanded_path = os.path.expanduser(self.path.path)
        stats = os.stat(expanded_path)
        return Datetime.from_datetime(datetime.fromtimestamp(stats.st_atime))


class IsFile(BaseNode):
    """
    Check if path is a file.
    files, metadata, type
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to check")

    async def process(self, context: ProcessingContext) -> bool:
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.isfile(expanded_path)


class IsDirectory(BaseNode):
    """
    Check if path is a directory.
    files, metadata, type
    """

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    path: FilePath = Field(default=FilePath(), description="Path to check")

    async def process(self, context: ProcessingContext) -> bool:
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.isdir(expanded_path)


class FileExtension(BaseNode):
    """
    Get file extension.
    files, metadata, extension
    """

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> str:
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.splitext(expanded_path)[1]


class FileName(BaseNode):
    """
    Get file name without path.
    files, metadata, name
    """

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> str:
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.basename(expanded_path)


class GetDirectory(BaseNode):
    """
    Get directory containing the file.
    files, metadata, directory
    """

    path: FilePath = Field(default=FilePath(), description="Path to file")

    async def process(self, context: ProcessingContext) -> str:
        expanded_path = os.path.expanduser(self.path.path)
        return os.path.dirname(expanded_path)


class LoadDocumentFile(BaseNode):
    """
    Read a document from disk.
    files, document, read, input, load, file
    """

    path: FilePath = Field(
        default=FilePath(), description="Path to the document to read"
    )

    async def process(self, context: ProcessingContext) -> DocumentRef:
        if not self.path.path:
            raise ValueError("path cannot be empty")
        expanded_path = os.path.expanduser(self.path.path)
        return DocumentRef(uri="file://" + expanded_path)


class SaveDocumentFile(BaseNode):
    """
    Write a document to disk.
    files, document, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    document: DocumentRef = Field(
        default=DocumentRef(), description="The document to save"
    )
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="Name of the file to save. Supports strftime format codes.",
    )

    async def process(self, context: ProcessingContext):
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        data = await context.asset_to_bytes(self.document)
        with open(expanded_path, "wb") as f:
            f.write(data)


class LoadCSVFile(BaseNode):
    """
    Read a CSV file from disk.
    files, csv, read, input, load, file
    """

    path: FilePath = Field(
        default=FilePath(), description="Path to the CSV file to read"
    )

    async def process(self, context: ProcessingContext) -> list[dict]:
        if not self.path.path:
            raise ValueError("path cannot be empty")
        expanded_path = os.path.expanduser(self.path.path)
        with open(expanded_path, "r") as f:
            reader = csv.DictReader(f)
            return [row for row in reader]


class SaveCSVFile(BaseNode):
    """
    Write a list of dictionaries to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    data: list[dict] = Field(
        default=[], description="list of dictionaries to write to CSV"
    )
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="Name of the CSV file to save. Supports strftime format codes.",
    )

    async def process(self, context: ProcessingContext):
        if not self.data:
            raise ValueError("'data' field cannot be empty")
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        with open(expanded_path, "w") as f:
            writer = csv.DictWriter(f, fieldnames=self.data[0].keys())
            writer.writeheader()
            for row in self.data:
                writer.writerow(row)


class SaveCSVDataframeFile(BaseNode):
    """
    Write a pandas DataFrame to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="DataFrame to write to CSV"
    )
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="Name of the CSV file to save. Supports strftime format codes.",
    )

    async def process(self, context: ProcessingContext):
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        df = pd.DataFrame(self.dataframe.data, columns=self.dataframe.columns)
        df.to_csv(expanded_path, index=False)


class LoadBytesFile(BaseNode):
    """
    Read raw bytes from a file on disk.
    files, bytes, read, input, load, file

    Use cases:
    - Load binary data for processing
    - Read binary files for a workflow
    """

    path: FilePath = Field(default=FilePath(), description="Path to the file to read")

    async def process(self, context: ProcessingContext) -> bytes:
        if not self.path.path:
            raise ValueError("path cannot be empty")
        expanded_path = os.path.expanduser(self.path.path)
        with open(expanded_path, "rb") as f:
            return f.read()


class SaveBytesFile(BaseNode):
    """
    Write raw bytes to a file on disk.
    files, bytes, save, output

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    data: bytes = Field(default=None, description="The bytes to write to file")
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="Name of the file to save. Supports strftime format codes.",
    )

    async def process(self, context: ProcessingContext):
        if not self.data:
            raise ValueError("data cannot be empty")
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        os.makedirs(os.path.dirname(expanded_path), exist_ok=True)
        with open(expanded_path, "wb") as f:
            f.write(self.data)


class LoadImageFile(BaseNode):
    """
    Read an image file from disk.
    image, input, load, file

    Use cases:
    - Load images for processing
    - Import photos for editing
    - Read image assets for a workflow
    """

    path: FilePath = Field(
        default=FilePath(), description="Path to the image file to read"
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if not self.path.path:
            raise ValueError("path cannot be empty")

        expanded_path = os.path.expanduser(self.path.path)
        if not os.path.exists(expanded_path):
            raise ValueError(f"Image file not found: {expanded_path}")

        with open(expanded_path, "rb") as f:
            image_data = f.read()

        image = await context.image_from_bytes(image_data)
        image.uri = "file://" + expanded_path
        return image


class SaveImageFile(BaseNode):
    """
    Write an image to disk.
    image, output, save, file

    Use cases:
    - Save processed images
    - Export edited photos
    - Archive image results
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to save")
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="""
        The name of the image file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)

        expanded_path = os.path.join(expanded_folder, filename)
        os.makedirs(os.path.dirname(expanded_path), exist_ok=True)

        image = await context.image_to_pil(self.image)
        image.save(expanded_path)
        return ImageRef(uri="file://" + expanded_path, data=image.tobytes())


class LoadAudioFile(BaseNode):
    """
    Read an audio file from disk.
    audio, input, load, file

    Use cases:
    - Load audio for processing
    - Import sound files for editing
    - Read audio assets for a workflow
    """

    path: FilePath = Field(
        default=FilePath(), description="Path to the audio file to read"
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if not self.path.path:
            raise ValueError("path cannot be empty")
        expanded_path = os.path.expanduser(self.path.path)
        if not os.path.exists(expanded_path):
            raise ValueError(f"Audio file not found: {expanded_path}")

        with open(expanded_path, "rb") as f:
            audio_data = f.read()

        audio = await context.audio_from_bytes(audio_data)
        audio.uri = "file://" + expanded_path
        return audio


class SaveAudioFile(BaseNode):
    """
    Write an audio file to disk.
    audio, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    audio: AudioRef = Field(default=AudioRef(), description="The audio to save")
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="""
        Name of the file to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        os.makedirs(os.path.dirname(expanded_path), exist_ok=True)

        audio_io = await context.asset_to_io(self.audio)
        audio_data = audio_io.read()
        with open(expanded_path, "wb") as f:
            f.write(audio_data)
        return AudioRef(uri="file://" + expanded_path, data=audio_data)


class LoadVideoFile(BaseNode):
    """
    Read a video file from disk.
    video, input, load, file

    Use cases:
    - Load videos for processing
    - Import video files for editing
    - Read video assets for a workflow
    """

    path: str = Field(default="", description="Path to the video file to read")

    async def process(self, context: ProcessingContext) -> VideoRef:
        expanded_path = os.path.expanduser(self.path)
        if not os.path.exists(expanded_path):
            raise ValueError(f"Video file not found: {expanded_path}")

        with open(expanded_path, "rb") as f:
            video_data = f.read()
            video = await context.video_from_bytes(video_data)
            video.uri = "file://" + expanded_path
            return video


class SaveVideoFile(BaseNode):
    """
    Write a video file to disk.
    video, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    video: VideoRef = Field(default=VideoRef(), description="The video to save")
    folder: FolderPath = Field(
        default=FolderPath(), description="Folder where the file will be saved"
    )
    filename: str = Field(
        default="",
        description="""
        Name of the file to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    async def process(self, context: ProcessingContext) -> VideoRef:
        if not self.folder.path:
            raise ValueError("folder cannot be empty")
        if not self.filename:
            raise ValueError("filename cannot be empty")

        expanded_folder = os.path.expanduser(self.folder.path)
        if not os.path.exists(expanded_folder):
            raise ValueError(f"Folder does not exist: {expanded_folder}")

        filename = datetime.now().strftime(self.filename)
        expanded_path = os.path.join(expanded_folder, filename)
        os.makedirs(os.path.dirname(expanded_path), exist_ok=True)

        video_io = await context.asset_to_io(self.video)
        video_data = video_io.read()

        with open(expanded_path, "wb") as f:
            f.write(video_data)

        return VideoRef(uri="file://" + expanded_path, data=video_data)


class FileNameMatch(BaseNode):
    """
    Match a filename against a pattern using Unix shell-style wildcards.
    files, pattern, match, filter

    Use cases:
    - Filter files by name pattern
    - Validate file naming conventions
    - Match file extensions
    """

    filename: str = Field(default="", description="Filename to check")
    pattern: str = Field(
        default="*", description="Pattern to match against (e.g. *.txt, data_*.csv)"
    )
    case_sensitive: bool = Field(
        default=True,
        description="Whether the pattern matching should be case-sensitive",
    )

    async def process(self, context: ProcessingContext) -> bool:
        import fnmatch

        if self.case_sensitive:
            return fnmatch.fnmatch(self.filename, self.pattern)
        return fnmatch.fnmatchcase(self.filename, self.pattern)


class FilterFileNames(BaseNode):
    """
    Filter a list of filenames using Unix shell-style wildcards.
    files, pattern, filter, list

    Use cases:
    - Filter multiple files by pattern
    - Batch process files matching criteria
    - Select files by extension
    """

    filenames: list[str] = Field(default=[], description="list of filenames to filter")
    pattern: str = Field(
        default="*", description="Pattern to filter by (e.g. *.txt, data_*.csv)"
    )
    case_sensitive: bool = Field(
        default=True,
        description="Whether the pattern matching should be case-sensitive",
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        import fnmatch

        if self.case_sensitive:
            return fnmatch.filter(self.filenames, self.pattern)
        return [
            name
            for name in self.filenames
            if fnmatch.fnmatchcase(name.lower(), self.pattern.lower())
        ]


class Basename(BaseNode):
    """
    Get the base name component of a file path.
    files, path, basename

    Use cases:
    - Extract filename from full path
    - Get file name without directory
    - Process file names independently
    """

    path: str = Field(default="", description="File path to get basename from")
    remove_extension: bool = Field(
        default=False, description="Remove file extension from basename"
    )

    async def process(self, context: ProcessingContext) -> str:
        if self.path.strip() == "":
            raise ValueError("path is empty")
        expanded_path = os.path.expanduser(self.path)
        basename = os.path.basename(expanded_path)
        if self.remove_extension:
            return os.path.splitext(basename)[0]
        return basename


class Dirname(BaseNode):
    """
    Get the directory name component of a file path.
    files, path, dirname

    Use cases:
    - Extract directory path from full path
    - Get parent directory
    - Process directory paths
    """

    path: str = Field(default="", description="File path to get dirname from")

    async def process(self, context: ProcessingContext) -> str:
        expanded_path = os.path.expanduser(self.path)
        return os.path.dirname(expanded_path)


class JoinPaths(BaseNode):
    """
    Joins path components.
    path, join, combine

    Use cases:
    - Build file paths
    - Create cross-platform paths
    """

    paths: list[str] = Field(default=[], description="Path components to join")

    async def process(self, context: ProcessingContext) -> FilePath:
        return FilePath(path=os.path.join(*self.paths))


class NormalizePath(BaseNode):
    """
    Normalizes a path.
    path, normalize, clean

    Use cases:
    - Standardize paths
    - Remove redundant separators
    """

    path: str = Field(default="", description="Path to normalize")

    async def process(self, context: ProcessingContext) -> FilePath:
        return FilePath(path=os.path.normpath(self.path))


class GetPathInfo(BaseNode):
    """
    Gets information about a path.
    path, info, metadata

    Use cases:
    - Extract path components
    - Parse file paths
    """

    path: str = Field(default="", description="Path to analyze")

    async def process(self, context: ProcessingContext) -> dict:
        return {
            "dirname": os.path.dirname(self.path),
            "basename": os.path.basename(self.path),
            "extension": os.path.splitext(self.path)[1],
            "absolute": os.path.abspath(self.path),
            "exists": os.path.exists(self.path),
            "is_file": os.path.isfile(self.path),
            "is_dir": os.path.isdir(self.path),
            "is_symlink": os.path.islink(self.path),
        }


class AbsolutePath(BaseNode):
    """
    Return the absolute path of a file or directory.
    files, path, absolute

    Use cases:
    - Convert relative paths to absolute
    - Get full system path
    - Resolve path references
    """

    path: str = Field(default="", description="Path to convert to absolute")

    async def process(self, context: ProcessingContext) -> FilePath:
        expanded_path = os.path.expanduser(self.path)
        return FilePath(path=os.path.abspath(expanded_path))


class SplitPath(BaseNode):
    """
    Split a path into directory and file components.
    files, path, split

    Use cases:
    - Separate directory from filename
    - Process path components separately
    - Extract path parts
    """

    path: str = Field(default="", description="Path to split")

    async def process(self, context: ProcessingContext) -> dict:
        expanded_path = os.path.expanduser(self.path)
        dirname, basename = os.path.split(expanded_path)
        return {"dirname": dirname, "basename": basename}


class SplitExtension(BaseNode):
    """
    Split a path into root and extension components.
    files, path, extension, split

    Use cases:
    - Extract file extension
    - Process filename without extension
    - Handle file types
    """

    path: str = Field(default="", description="Path to split")

    async def process(self, context: ProcessingContext) -> dict:
        expanded_path = os.path.expanduser(self.path)
        root, ext = os.path.splitext(expanded_path)
        return {"root": root, "extension": ext}


class RelativePath(BaseNode):
    """
    Return a relative path to a target from a start directory.
    files, path, relative

    Use cases:
    - Create relative path references
    - Generate portable paths
    - Compare file locations
    """

    target_path: str = Field(
        default="", description="Target path to convert to relative"
    )
    start_path: str = Field(
        default=".", description="Start path for relative conversion"
    )

    async def process(self, context: ProcessingContext) -> FilePath:
        expanded_target = os.path.expanduser(self.target_path)
        expanded_start = os.path.expanduser(self.start_path)
        return FilePath(path=os.path.relpath(expanded_target, expanded_start))


class PathToString(BaseNode):
    """
    Convert a FilePath object to a string.
    files, path, string, convert

    Use cases:
    - Get raw string path from FilePath object
    - Convert FilePath for string operations
    - Extract path string for external use
    """

    file_path: FilePath = Field(
        default=FilePath(), description="FilePath object to convert to string"
    )

    async def process(self, context: ProcessingContext) -> str:
        if not self.file_path:
            raise ValueError("file_path cannot be empty")
        return self.file_path.path


class ShowNotification(BaseNode):
    """
    Shows a system notification.
    notification, system, alert

    Use cases:
    - Alert user of completed tasks
    - Show process status
    - Display important messages
    """

    title: str = Field(default="", description="Title of the notification")
    message: str = Field(default="", description="Content of the notification")
    timeout: int = Field(
        default=10,
        description="How long the notification should stay visible (in seconds)",
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> None:
        if not self.title:
            raise ValueError("title cannot be empty")
        if not self.message:
            raise ValueError("message cannot be empty")

        if os.name == "posix" and "darwin" in os.uname().sysname.lower():  # macOS
            # Escape single quotes in the title and message
            escaped_title = self.title.replace("'", "'\"'\"'")
            escaped_message = self.message.replace("'", "'\"'\"'")

            cmd = [
                "osascript",
                "-e",
                f'display notification "{escaped_message}" with title "{escaped_title}"',
            ]

            try:
                subprocess.run(cmd, check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                raise RuntimeError(f"Failed to show notification: {e.stderr.decode()}")

        else:  # Windows and Linux
            from plyer import notification

            notification.notify(
                title=self.title, message=self.message, timeout=self.timeout
            )  # type: ignore
