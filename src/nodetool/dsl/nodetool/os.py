from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AbsolutePath(GraphNode):
    """
    Return the absolute path of a file or directory.
    files, path, absolute

    Use cases:
    - Convert relative paths to absolute
    - Get full system path
    - Resolve path references
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to convert to absolute')

    @classmethod
    def get_node_type(cls): return "nodetool.os.AbsolutePath"



class AccessedTime(GraphNode):
    """
    Get file last accessed timestamp.
    files, metadata, accessed, time
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.AccessedTime"



class Basename(GraphNode):
    """
    Get the base name component of a file path.
    files, path, basename

    Use cases:
    - Extract filename from full path
    - Get file name without directory
    - Process file names independently
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='File path to get basename from')
    remove_extension: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Remove file extension from basename')

    @classmethod
    def get_node_type(cls): return "nodetool.os.Basename"



class CopyFile(GraphNode):
    """
    Copy a file from source to destination path.
    files, copy, manage

    Use cases:
    - Create file backups
    - Duplicate files for processing
    - Copy files to new locations
    """

    source_path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Source file path')
    destination_path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Destination file path')

    @classmethod
    def get_node_type(cls): return "nodetool.os.CopyFile"



class CreateDirectory(GraphNode):
    """
    Create a new directory at specified path.
    files, directory, create

    Use cases:
    - Set up directory structure for file organization
    - Create output directories for processed files
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Directory path to create')
    exist_ok: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description="Don't error if directory already exists")

    @classmethod
    def get_node_type(cls): return "nodetool.os.CreateDirectory"



class CreatedTime(GraphNode):
    """
    Get file creation timestamp.
    files, metadata, created, time
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.CreatedTime"



class Dirname(GraphNode):
    """
    Get the directory name component of a file path.
    files, path, dirname

    Use cases:
    - Extract directory path from full path
    - Get parent directory
    - Process directory paths
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='File path to get dirname from')

    @classmethod
    def get_node_type(cls): return "nodetool.os.Dirname"



class FileExists(GraphNode):
    """
    Check if a file or directory exists at the specified path.
    files, check, exists

    Use cases:
    - Validate file presence before processing
    - Implement conditional logic based on file existence
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to check for existence')

    @classmethod
    def get_node_type(cls): return "nodetool.os.FileExists"



class FileExtension(GraphNode):
    """
    Get file extension.
    files, metadata, extension
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.FileExtension"



class FileName(GraphNode):
    """
    Get file name without path.
    files, metadata, name
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.FileName"



class FileNameMatch(GraphNode):
    """
    Match a filename against a pattern using Unix shell-style wildcards.
    files, pattern, match, filter

    Use cases:
    - Filter files by name pattern
    - Validate file naming conventions
    - Match file extensions
    """

    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Filename to check')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='*', description='Pattern to match against (e.g. *.txt, data_*.csv)')
    case_sensitive: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether the pattern matching should be case-sensitive')

    @classmethod
    def get_node_type(cls): return "nodetool.os.FileNameMatch"



class FilterFileNames(GraphNode):
    """
    Filter a list of filenames using Unix shell-style wildcards.
    files, pattern, filter, list

    Use cases:
    - Filter multiple files by pattern
    - Batch process files matching criteria
    - Select files by extension
    """

    filenames: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='list of filenames to filter')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='*', description='Pattern to filter by (e.g. *.txt, data_*.csv)')
    case_sensitive: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether the pattern matching should be case-sensitive')

    @classmethod
    def get_node_type(cls): return "nodetool.os.FilterFileNames"



class GetDirectory(GraphNode):
    """
    Get directory containing the file.
    files, metadata, directory
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.GetDirectory"



class GetEnvironmentVariable(GraphNode):
    """
    Gets an environment variable value.
    environment, variable, system

    Use cases:
    - Access configuration
    - Get system settings
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Environment variable name')
    default: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Default value if not found')

    @classmethod
    def get_node_type(cls): return "nodetool.os.GetEnvironmentVariable"



class GetFileSize(GraphNode):
    """
    Get file size in bytes.
    files, metadata, size
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.GetFileSize"



class GetPathInfo(GraphNode):
    """
    Gets information about a path.
    path, info, metadata

    Use cases:
    - Extract path components
    - Parse file paths
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to analyze')

    @classmethod
    def get_node_type(cls): return "nodetool.os.GetPathInfo"



class GetSystemInfo(GraphNode):
    """
    Gets system information.
    system, info, platform

    Use cases:
    - Check system compatibility
    - Platform-specific logic
    """


    @classmethod
    def get_node_type(cls): return "nodetool.os.GetSystemInfo"



class IsDirectory(GraphNode):
    """
    Check if path is a directory.
    files, metadata, type
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to check')

    @classmethod
    def get_node_type(cls): return "nodetool.os.IsDirectory"



class IsFile(GraphNode):
    """
    Check if path is a file.
    files, metadata, type
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to check')

    @classmethod
    def get_node_type(cls): return "nodetool.os.IsFile"



class JoinPaths(GraphNode):
    """
    Joins path components.
    path, join, combine

    Use cases:
    - Build file paths
    - Create cross-platform paths
    """

    paths: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='Path components to join')

    @classmethod
    def get_node_type(cls): return "nodetool.os.JoinPaths"



class ListFiles(GraphNode):
    """
    list files in a directory matching a pattern.
    files, list, directory

    Use cases:
    - Get files for batch processing
    - Filter files by extension or pattern
    """

    directory: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path='~'), description='Directory to scan')
    pattern: str | GraphNode | tuple[GraphNode, str] = Field(default='*', description='File pattern to match (e.g. *.txt)')
    recursive: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Search subdirectories')

    @classmethod
    def get_node_type(cls): return "nodetool.os.ListFiles"



class LoadAudioFile(GraphNode):
    """
    Read an audio file from disk.
    audio, input, load, file

    Use cases:
    - Load audio for processing
    - Import sound files for editing
    - Read audio assets for a workflow
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to the audio file to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadAudioFile"



class LoadBytesFile(GraphNode):
    """
    Read raw bytes from a file on disk.
    files, bytes, read, input, load, file

    Use cases:
    - Load binary data for processing
    - Read binary files for a workflow
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to the file to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadBytesFile"



class LoadCSVFile(GraphNode):
    """
    Read a CSV file from disk.
    files, csv, read, input, load, file
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to the CSV file to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadCSVFile"



class LoadDocumentFile(GraphNode):
    """
    Read a document from disk.
    files, document, read, input, load, file
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to the document to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadDocumentFile"



class LoadImageFile(GraphNode):
    """
    Read an image file from disk.
    image, input, load, file

    Use cases:
    - Load images for processing
    - Import photos for editing
    - Read image assets for a workflow
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to the image file to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadImageFile"



class LoadVideoFile(GraphNode):
    """
    Read a video file from disk.
    video, input, load, file

    Use cases:
    - Load videos for processing
    - Import video files for editing
    - Read video assets for a workflow
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to the video file to read')

    @classmethod
    def get_node_type(cls): return "nodetool.os.LoadVideoFile"



class ModifiedTime(GraphNode):
    """
    Get file last modified timestamp.
    files, metadata, modified, time
    """

    path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Path to file')

    @classmethod
    def get_node_type(cls): return "nodetool.os.ModifiedTime"



class MoveFile(GraphNode):
    """
    Move a file from source to destination path.
    files, move, manage

    Use cases:
    - Organize files into directories
    - Process and archive files
    - Relocate completed files
    """

    source_path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Source file path')
    destination_path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='Destination file path')

    @classmethod
    def get_node_type(cls): return "nodetool.os.MoveFile"



class NormalizePath(GraphNode):
    """
    Normalizes a path.
    path, normalize, clean

    Use cases:
    - Standardize paths
    - Remove redundant separators
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to normalize')

    @classmethod
    def get_node_type(cls): return "nodetool.os.NormalizePath"



class PathToString(GraphNode):
    """
    Convert a FilePath object to a string.
    files, path, string, convert

    Use cases:
    - Get raw string path from FilePath object
    - Convert FilePath for string operations
    - Extract path string for external use
    """

    file_path: FilePath | GraphNode | tuple[GraphNode, str] = Field(default=FilePath(type='file_path', path=''), description='FilePath object to convert to string')

    @classmethod
    def get_node_type(cls): return "nodetool.os.PathToString"



class RelativePath(GraphNode):
    """
    Return a relative path to a target from a start directory.
    files, path, relative

    Use cases:
    - Create relative path references
    - Generate portable paths
    - Compare file locations
    """

    target_path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Target path to convert to relative')
    start_path: str | GraphNode | tuple[GraphNode, str] = Field(default='.', description='Start path for relative conversion')

    @classmethod
    def get_node_type(cls): return "nodetool.os.RelativePath"



class SaveAudioFile(GraphNode):
    """
    Write an audio file to disk.
    audio, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio to save')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveAudioFile"



class SaveBytesFile(GraphNode):
    """
    Write raw bytes to a file on disk.
    files, bytes, save, output

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    data: bytes | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The bytes to write to file')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Name of the file to save. Supports strftime format codes.')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveBytesFile"



class SaveCSVDataframeFile(GraphNode):
    """
    Write a pandas DataFrame to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='DataFrame to write to CSV')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Name of the CSV file to save. Supports strftime format codes.')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveCSVDataframeFile"



class SaveCSVFile(GraphNode):
    """
    Write a list of dictionaries to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    data: list[dict] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='list of dictionaries to write to CSV')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Name of the CSV file to save. Supports strftime format codes.')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveCSVFile"



class SaveDocumentFile(GraphNode):
    """
    Write a document to disk.
    files, document, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    document: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description='The document to save')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Name of the file to save. Supports strftime format codes.')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveDocumentFile"



class SaveImageFile(GraphNode):
    """
    Write an image to disk.
    image, output, save, file

    Use cases:
    - Save processed images
    - Export edited photos
    - Archive image results
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to save')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n        The name of the image file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveImageFile"



class SaveVideoFile(GraphNode):
    """
    Write a video file to disk.
    video, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second
    """

    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='The video to save')
    folder: FolderPath | GraphNode | tuple[GraphNode, str] = Field(default=FolderPath(type='folder_path', path=''), description='Folder where the file will be saved')
    filename: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SaveVideoFile"



class SetEnvironmentVariable(GraphNode):
    """
    Sets an environment variable.
    environment, variable, system

    Use cases:
    - Configure runtime settings
    - Set up process environment
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Environment variable name')
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Environment variable value')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SetEnvironmentVariable"



class ShowNotification(GraphNode):
    """
    Shows a system notification.
    notification, system, alert

    Use cases:
    - Alert user of completed tasks
    - Show process status
    - Display important messages
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Title of the notification')
    message: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Content of the notification')
    timeout: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='How long the notification should stay visible (in seconds)')

    @classmethod
    def get_node_type(cls): return "nodetool.os.ShowNotification"



class SplitExtension(GraphNode):
    """
    Split a path into root and extension components.
    files, path, extension, split

    Use cases:
    - Extract file extension
    - Process filename without extension
    - Handle file types
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to split')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SplitExtension"



class SplitPath(GraphNode):
    """
    Split a path into directory and file components.
    files, path, split

    Use cases:
    - Separate directory from filename
    - Process path components separately
    - Extract path parts
    """

    path: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Path to split')

    @classmethod
    def get_node_type(cls): return "nodetool.os.SplitPath"


