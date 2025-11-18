# Nodes Reference

NodeTool includes a comprehensive collection of base nodes from the [nodetool-base](https://github.com/nodetool-ai/nodetool-base) repository. These nodes provide fundamental building blocks for creating AI-powered workflows. The base nodes are organized into logical categories to help you quickly find the functionality you need.

Use the Node Menu (Space) to search any node listed here. Hover each node for quick documentation or open full node
docs in the inspector.

## Overview

The base nodes are organized into several namespaces:

- **[Audio](#audio)** - Audio processing and manipulation
- **[Base64](#base64)** - Base64 encoding and decoding
- **[Boolean](#boolean)** - Logical operations and comparisons
- **[Code](#code)** - Code evaluation and execution
- **[Compression](#compression)** - File compression operations
- **[Constants](#constants)** - Constant values and literals
- **[Control](#control)** - Flow control and branching
- **[Date](#date)** - Date and time operations
- **[Dictionary](#dictionary)** - Dictionary and key-value operations
- **[Group](#group)** - Grouping and iteration operations
- **[HTML](#html)** - HTML processing
- **[Image](#image)** - Image processing and manipulation
- **[Input](#input)** - User input collection
- **[JSON](#json)** - JSON parsing and manipulation
- **[List](#list)** - List operations and processing
- **[Math](#math)** - Mathematical operations
- **[OS](#os)** - Operating system and file operations
- **[Output](#output)** - Output and display operations
- **[Random](#random)** - Random number generation
- **[Text](#text)** - Text processing and manipulation
- **[Video](#video)** - Video processing and editing

## Audio

Audio nodes provide functionality for processing and manipulating audio files.

### SaveAudio

**Purpose**: Save audio files to the assets directory.

**Inputs**:
- `value` (Audio): The audio asset to save
- `name` (str): The name of the audio file

**Outputs**:
- `output` (Audio): The saved audio asset

**Usage**: Use this node to save audio files to the assets directory for later use in your workflows.

## Base64

Base64 nodes handle encoding and decoding of Base64 data.

### Decode

**Purpose**: Decode Base64 encoded data.

**Inputs**:
- `value` (str): The Base64 encoded string to decode

**Outputs**:
- `output` (str): The decoded data

### Encode

**Purpose**: Encode data to Base64 format.

**Inputs**:
- `value` (str): The data to encode

**Outputs**:
- `output` (str): The Base64 encoded string

## Boolean

Boolean nodes provide logical operations, comparisons, and flow control helpers.

### And

**Purpose**: Logical AND operation.

**Inputs**:
- `a` (bool): First boolean value
- `b` (bool): Second boolean value

**Outputs**:
- `output` (bool): Result of AND operation

### Or

**Purpose**: Logical OR operation.

**Inputs**:
- `a` (bool): First boolean value
- `b` (bool): Second boolean value

**Outputs**:
- `output` (bool): Result of OR operation

### Not

**Purpose**: Logical NOT operation.

**Inputs**:
- `value` (bool): Boolean value to negate

**Outputs**:
- `output` (bool): Negated boolean value

### Equal

**Purpose**: Check if two values are equal.

**Inputs**:
- `a` (any): First value
- `b` (any): Second value

**Outputs**:
- `output` (bool): True if values are equal

### GreaterThan

**Purpose**: Check if first value is greater than second.

**Inputs**:
- `a` (number): First value
- `b` (number): Second value

**Outputs**:
- `output` (bool): True if a > b

### LessThan

**Purpose**: Check if first value is less than second.

**Inputs**:
- `a` (number): First value
- `b` (number): Second value

**Outputs**:
- `output` (bool): True if a < b

## Code

Code nodes allow you to evaluate expressions or run small Python snippets (for development use).

### Evaluate

**Purpose**: Evaluate Python expressions safely.

**Inputs**:
- `expression` (str): The Python expression to evaluate
- `variables` (dict): Variables to use in the expression

**Outputs**:
- `output` (any): Result of the expression

**Usage**: Use this node to perform custom calculations or logic using Python expressions.

### Execute

**Purpose**: Execute Python code snippets.

**Inputs**:
- `code` (str): The Python code to execute
- `variables` (dict): Variables available to the code

**Outputs**:
- `output` (any): Result of the code execution

## Compression

Compression nodes handle file compression and decompression operations.

### Compress

**Purpose**: Compress data using various algorithms.

**Inputs**:
- `data` (bytes): Data to compress
- `algorithm` (str): Compression algorithm (gzip, bzip2, lzma)

**Outputs**:
- `output` (bytes): Compressed data

### Decompress

**Purpose**: Decompress compressed data.

**Inputs**:
- `data` (bytes): Compressed data
- `algorithm` (str): Compression algorithm used

**Outputs**:
- `output` (bytes): Decompressed data

## Constants

Constant nodes provide constant values like numbers, strings, and images.

### Float

**Purpose**: Provide a constant floating-point number.

**Inputs**:
- `value` (float): The constant value

**Outputs**:
- `output` (float): The constant value

### Int

**Purpose**: Provide a constant integer.

**Inputs**:
- `value` (int): The constant value

**Outputs**:
- `output` (int): The constant value

### String

**Purpose**: Provide a constant string.

**Inputs**:
- `value` (str): The constant string

**Outputs**:
- `output` (str): The constant string

### Boolean

**Purpose**: Provide a constant boolean value.

**Inputs**:
- `value` (bool): The constant boolean value

**Outputs**:
- `output` (bool): The constant boolean value

### Image

**Purpose**: Provide a constant image.

**Inputs**:
- `value` (Image): The constant image asset

**Outputs**:
- `output` (Image): The constant image asset

## Control

Control nodes provide basic branching and flow control.

### If

**Purpose**: Conditional branching based on a boolean condition.

**Inputs**:
- `condition` (bool): The condition to evaluate
- `true_value` (any): Value to output if condition is true
- `false_value` (any): Value to output if condition is false

**Outputs**:
- `output` (any): The selected value based on condition

**Usage**: Use this node to create conditional logic in your workflows.

## Date

Date nodes provide utilities for manipulating dates and times.

### Now

**Purpose**: Get the current date and time.

**Outputs**:
- `output` (datetime): Current date and time

### Format

**Purpose**: Format a date/time value as a string.

**Inputs**:
- `value` (datetime): The date/time to format
- `format` (str): Format string (e.g., "%Y-%m-%d %H:%M:%S")

**Outputs**:
- `output` (str): Formatted date/time string

### Parse

**Purpose**: Parse a date/time string.

**Inputs**:
- `value` (str): The date/time string to parse
- `format` (str): Format string to use for parsing

**Outputs**:
- `output` (datetime): Parsed date/time object

### Add

**Purpose**: Add time to a date/time value.

**Inputs**:
- `value` (datetime): The base date/time
- `days` (int): Days to add
- `hours` (int): Hours to add
- `minutes` (int): Minutes to add
- `seconds` (int): Seconds to add

**Outputs**:
- `output` (datetime): Modified date/time

## Dictionary

Dictionary nodes manipulate key/value data and dictionaries.

### Get

**Purpose**: Get a value from a dictionary by key.

**Inputs**:
- `dictionary` (dict): The dictionary to query
- `key` (str): The key to look up
- `default` (any): Default value if key not found

**Outputs**:
- `output` (any): The value associated with the key

### Set

**Purpose**: Set a value in a dictionary.

**Inputs**:
- `dictionary` (dict): The dictionary to modify
- `key` (str): The key to set
- `value` (any): The value to set

**Outputs**:
- `output` (dict): Modified dictionary

### Keys

**Purpose**: Get all keys from a dictionary.

**Inputs**:
- `dictionary` (dict): The dictionary to query

**Outputs**:
- `output` (list): List of all keys

### Values

**Purpose**: Get all values from a dictionary.

**Inputs**:
- `dictionary` (dict): The dictionary to query

**Outputs**:
- `output` (list): List of all values

### Merge

**Purpose**: Merge two dictionaries.

**Inputs**:
- `dict1` (dict): First dictionary
- `dict2` (dict): Second dictionary

**Outputs**:
- `output` (dict): Merged dictionary

## Group

Group nodes handle grouping operations such as looping over inputs.

### ForEach

**Purpose**: Apply an operation to each item in a list.

**Inputs**:
- `items` (list): List of items to process
- `operation` (node): Operation to apply to each item

**Outputs**:
- `output` (list): Results of applying operation to each item

**Usage**: Use this node to perform batch operations on lists of data.

## HTML

HTML nodes provide basic HTML processing capabilities.

### Parse

**Purpose**: Parse HTML content.

**Inputs**:
- `html` (str): HTML content to parse

**Outputs**:
- `output` (dict): Parsed HTML structure

## Image

Image nodes handle image manipulation including crop, resize, and save operations.

### Crop

**Purpose**: Crop an image to specified dimensions.

**Inputs**:
- `image` (Image): The image to crop
- `x` (int): X coordinate of crop area
- `y` (int): Y coordinate of crop area
- `width` (int): Width of crop area
- `height` (int): Height of crop area

**Outputs**:
- `output` (Image): Cropped image

### Resize

**Purpose**: Resize an image to specified dimensions.

**Inputs**:
- `image` (Image): The image to resize
- `width` (int): New width
- `height` (int): New height
- `mode` (str): Resize mode (stretch, fit, fill)

**Outputs**:
- `output` (Image): Resized image

### Save

**Purpose**: Save an image to the assets directory.

**Inputs**:
- `image` (Image): The image to save
- `name` (str): Name of the image file
- `format` (str): Image format (png, jpg, gif)

**Outputs**:
- `output` (Image): Saved image asset

### Rotate

**Purpose**: Rotate an image by specified degrees.

**Inputs**:
- `image` (Image): The image to rotate
- `degrees` (float): Rotation angle in degrees

**Outputs**:
- `output` (Image): Rotated image

## Input

Input nodes collect user input of various types.

### TextInput

**Purpose**: Collect text input from the user.

**Inputs**:
- `prompt` (str): Prompt text to display
- `default` (str): Default value

**Outputs**:
- `output` (str): User's text input

### NumberInput

**Purpose**: Collect numeric input from the user.

**Inputs**:
- `prompt` (str): Prompt text to display
- `default` (float): Default value
- `min` (float): Minimum allowed value
- `max` (float): Maximum allowed value

**Outputs**:
- `output` (float): User's numeric input

### BooleanInput

**Purpose**: Collect boolean input from the user.

**Inputs**:
- `prompt` (str): Prompt text to display
- `default` (bool): Default value

**Outputs**:
- `output` (bool): User's boolean input

### FileInput

**Purpose**: Allow user to select a file.

**Inputs**:
- `prompt` (str): Prompt text to display
- `file_types` (list): Allowed file types

**Outputs**:
- `output` (str): Path to selected file

### ImageInput

**Purpose**: Allow user to select an image.

**Inputs**:
- `prompt` (str): Prompt text to display

**Outputs**:
- `output` (Image): Selected image

## JSON

JSON nodes parse, query, and validate JSON data.

### Parse

**Purpose**: Parse JSON string into data structure.

**Inputs**:
- `json_string` (str): JSON string to parse

**Outputs**:
- `output` (any): Parsed JSON data

### Stringify

**Purpose**: Convert data to JSON string.

**Inputs**:
- `data` (any): Data to convert to JSON
- `indent` (int): Indentation level for pretty printing

**Outputs**:
- `output` (str): JSON string representation

### Query

**Purpose**: Query JSON data using JSONPath.

**Inputs**:
- `data` (any): JSON data to query
- `path` (str): JSONPath expression

**Outputs**:
- `output` (any): Query results

### Validate

**Purpose**: Validate JSON data against a schema.

**Inputs**:
- `data` (any): JSON data to validate
- `schema` (dict): JSON schema

**Outputs**:
- `valid` (bool): True if data is valid
- `errors` (list): List of validation errors

## List

List nodes provide extensive list processing utilities.

### Append

**Purpose**: Add an item to the end of a list.

**Inputs**:
- `list` (list): The list to modify
- `item` (any): Item to append

**Outputs**:
- `output` (list): Modified list

### Prepend

**Purpose**: Add an item to the beginning of a list.

**Inputs**:
- `list` (list): The list to modify
- `item` (any): Item to prepend

**Outputs**:
- `output` (list): Modified list

### Remove

**Purpose**: Remove an item from a list.

**Inputs**:
- `list` (list): The list to modify
- `item` (any): Item to remove

**Outputs**:
- `output` (list): Modified list

### Get

**Purpose**: Get an item from a list by index.

**Inputs**:
- `list` (list): The list to query
- `index` (int): Index of item to get

**Outputs**:
- `output` (any): Item at specified index

### Set

**Purpose**: Set an item in a list at a specific index.

**Inputs**:
- `list` (list): The list to modify
- `index` (int): Index to set
- `item` (any): Item to set

**Outputs**:
- `output` (list): Modified list

### Length

**Purpose**: Get the length of a list.

**Inputs**:
- `list` (list): The list to measure

**Outputs**:
- `output` (int): Length of the list

### Sort

**Purpose**: Sort a list.

**Inputs**:
- `list` (list): The list to sort
- `reverse` (bool): Sort in reverse order

**Outputs**:
- `output` (list): Sorted list

### Filter

**Purpose**: Filter a list based on a condition.

**Inputs**:
- `list` (list): The list to filter
- `condition` (str): Filter condition

**Outputs**:
- `output` (list): Filtered list

### Map

**Purpose**: Apply a function to each item in a list.

**Inputs**:
- `list` (list): The list to process
- `function` (str): Function to apply

**Outputs**:
- `output` (list): Transformed list

### Reduce

**Purpose**: Reduce a list to a single value.

**Inputs**:
- `list` (list): The list to reduce
- `function` (str): Reduction function
- `initial` (any): Initial value

**Outputs**:
- `output` (any): Reduced value

### Join

**Purpose**: Join list items into a string.

**Inputs**:
- `list` (list): The list to join
- `separator` (str): Separator string

**Outputs**:
- `output` (str): Joined string

### Split

**Purpose**: Split a string into a list.

**Inputs**:
- `string` (str): String to split
- `separator` (str): Separator string

**Outputs**:
- `output` (list): List of split strings

### Concat

**Purpose**: Concatenate multiple lists.

**Inputs**:
- `lists` (list): List of lists to concatenate

**Outputs**:
- `output` (list): Concatenated list

### Slice

**Purpose**: Extract a slice from a list.

**Inputs**:
- `list` (list): The list to slice
- `start` (int): Start index
- `end` (int): End index

**Outputs**:
- `output` (list): Sliced list

### Reverse

**Purpose**: Reverse a list.

**Inputs**:
- `list` (list): The list to reverse

**Outputs**:
- `output` (list): Reversed list

### Unique

**Purpose**: Remove duplicates from a list.

**Inputs**:
- `list` (list): The list to process

**Outputs**:
- `output` (list): List with duplicates removed

### Contains

**Purpose**: Check if a list contains an item.

**Inputs**:
- `list` (list): The list to check
- `item` (any): Item to search for

**Outputs**:
- `output` (bool): True if item is in list

### Index

**Purpose**: Find the index of an item in a list.

**Inputs**:
- `list` (list): The list to search
- `item` (any): Item to find

**Outputs**:
- `output` (int): Index of item (-1 if not found)

### Count

**Purpose**: Count occurrences of an item in a list.

**Inputs**:
- `list` (list): The list to search
- `item` (any): Item to count

**Outputs**:
- `output` (int): Number of occurrences

### Min

**Purpose**: Find the minimum value in a list.

**Inputs**:
- `list` (list): The list to process

**Outputs**:
- `output` (any): Minimum value

### Max

**Purpose**: Find the maximum value in a list.

**Inputs**:
- `list` (list): The list to process

**Outputs**:
- `output` (any): Maximum value

### Sum

**Purpose**: Calculate the sum of values in a list.

**Inputs**:
- `list` (list): The list to sum

**Outputs**:
- `output` (number): Sum of values

### Average

**Purpose**: Calculate the average of values in a list.

**Inputs**:
- `list` (list): The list to average

**Outputs**:
- `output` (number): Average value

## Math

Math nodes provide basic arithmetic and mathematical functions.

### Add

**Purpose**: Add two numbers.

**Inputs**:
- `a` (number): First number
- `b` (number): Second number

**Outputs**:
- `output` (number): Sum of a and b

### Subtract

**Purpose**: Subtract two numbers.

**Inputs**:
- `a` (number): First number
- `b` (number): Second number

**Outputs**:
- `output` (number): Difference (a - b)

### Multiply

**Purpose**: Multiply two numbers.

**Inputs**:
- `a` (number): First number
- `b` (number): Second number

**Outputs**:
- `output` (number): Product of a and b

### Divide

**Purpose**: Divide two numbers.

**Inputs**:
- `a` (number): Dividend
- `b` (number): Divisor

**Outputs**:
- `output` (number): Quotient (a / b)

### Power

**Purpose**: Raise a number to a power.

**Inputs**:
- `base` (number): Base number
- `exponent` (number): Exponent

**Outputs**:
- `output` (number): Result of base^exponent

### Sqrt

**Purpose**: Calculate the square root of a number.

**Inputs**:
- `value` (number): Number to calculate square root of

**Outputs**:
- `output` (number): Square root of value

### Abs

**Purpose**: Calculate the absolute value of a number.

**Inputs**:
- `value` (number): Number to get absolute value of

**Outputs**:
- `output` (number): Absolute value

### Round

**Purpose**: Round a number to specified decimal places.

**Inputs**:
- `value` (number): Number to round
- `decimals` (int): Number of decimal places

**Outputs**:
- `output` (number): Rounded number

### Floor

**Purpose**: Round down to the nearest integer.

**Inputs**:
- `value` (number): Number to floor

**Outputs**:
- `output` (int): Floored value

### Ceil

**Purpose**: Round up to the nearest integer.

**Inputs**:
- `value` (number): Number to ceil

**Outputs**:
- `output` (int): Ceiled value

### Sin

**Purpose**: Calculate the sine of an angle.

**Inputs**:
- `angle` (number): Angle in radians

**Outputs**:
- `output` (number): Sine of angle

### Cos

**Purpose**: Calculate the cosine of an angle.

**Inputs**:
- `angle` (number): Angle in radians

**Outputs**:
- `output` (number): Cosine of angle

### Tan

**Purpose**: Calculate the tangent of an angle.

**Inputs**:
- `angle` (number): Angle in radians

**Outputs**:
- `output` (number): Tangent of angle

### Log

**Purpose**: Calculate the natural logarithm.

**Inputs**:
- `value` (number): Number to calculate log of

**Outputs**:
- `output` (number): Natural logarithm

### Log10

**Purpose**: Calculate the base-10 logarithm.

**Inputs**:
- `value` (number): Number to calculate log10 of

**Outputs**:
- `output` (number): Base-10 logarithm

### Exp

**Purpose**: Calculate e raised to a power.

**Inputs**:
- `value` (number): Exponent

**Outputs**:
- `output` (number): e^value

### Min

**Purpose**: Find the minimum of two numbers.

**Inputs**:
- `a` (number): First number
- `b` (number): Second number

**Outputs**:
- `output` (number): Minimum value

### Max

**Purpose**: Find the maximum of two numbers.

**Inputs**:
- `a` (number): First number
- `b` (number): Second number

**Outputs**:
- `output` (number): Maximum value

### Random

**Purpose**: Generate a random number.

**Inputs**:
- `min` (number): Minimum value
- `max` (number): Maximum value

**Outputs**:
- `output` (number): Random number between min and max

## OS

OS nodes provide file system and path helpers.

### ReadFile

**Purpose**: Read the contents of a file.

**Inputs**:
- `path` (str): Path to the file to read

**Outputs**:
- `output` (str): File contents

### WriteFile

**Purpose**: Write contents to a file.

**Inputs**:
- `path` (str): Path to the file to write
- `contents` (str): Contents to write

**Outputs**:
- `output` (str): Path to the written file

### FileExists

**Purpose**: Check if a file exists.

**Inputs**:
- `path` (str): Path to check

**Outputs**:
- `output` (bool): True if file exists

### ListFiles

**Purpose**: List files in a directory.

**Inputs**:
- `directory` (str): Directory to list
- `pattern` (str): File pattern to match

**Outputs**:
- `output` (list): List of file paths

### CreateDirectory

**Purpose**: Create a directory.

**Inputs**:
- `path` (str): Path of directory to create

**Outputs**:
- `output` (str): Path to created directory

### DirectoryExists

**Purpose**: Check if a directory exists.

**Inputs**:
- `path` (str): Path to check

**Outputs**:
- `output` (bool): True if directory exists

### GetBasename

**Purpose**: Get the basename of a path.

**Inputs**:
- `path` (str): Path to process

**Outputs**:
- `output` (str): Basename of path

### GetDirname

**Purpose**: Get the directory name of a path.

**Inputs**:
- `path` (str): Path to process

**Outputs**:
- `output` (str): Directory name

### GetExtension

**Purpose**: Get the file extension.

**Inputs**:
- `path` (str): Path to process

**Outputs**:
- `output` (str): File extension

### JoinPath

**Purpose**: Join multiple path components.

**Inputs**:
- `paths` (list): List of path components

**Outputs**:
- `output` (str): Joined path

### GetFileSize

**Purpose**: Get the size of a file.

**Inputs**:
- `path` (str): Path to the file

**Outputs**:
- `output` (int): File size in bytes

### GetModifiedTime

**Purpose**: Get the last modified time of a file.

**Inputs**:
- `path` (str): Path to the file

**Outputs**:
- `output` (datetime): Last modified time

### CopyFile

**Purpose**: Copy a file to a new location.

**Inputs**:
- `source` (str): Source file path
- `destination` (str): Destination file path

**Outputs**:
- `output` (str): Path to copied file

### MoveFile

**Purpose**: Move a file to a new location.

**Inputs**:
- `source` (str): Source file path
- `destination` (str): Destination file path

**Outputs**:
- `output` (str): Path to moved file

### DeleteFile

**Purpose**: Delete a file.

**Inputs**:
- `path` (str): Path to the file to delete

**Outputs**:
- `output` (bool): True if file was deleted

### GetCurrentDirectory

**Purpose**: Get the current working directory.

**Outputs**:
- `output` (str): Current working directory

### SetCurrentDirectory

**Purpose**: Set the current working directory.

**Inputs**:
- `path` (str): Path to set as current directory

**Outputs**:
- `output` (str): New current directory

### GetHomeDirectory

**Purpose**: Get the user's home directory.

**Outputs**:
- `output` (str): User's home directory

### GetTempDirectory

**Purpose**: Get the system's temporary directory.

**Outputs**:
- `output` (str): System's temporary directory

### ExecuteCommand

**Purpose**: Execute a system command.

**Inputs**:
- `command` (str): Command to execute
- `args` (list): Command arguments

**Outputs**:
- `output` (str): Command output
- `error` (str): Error output
- `exit_code` (int): Exit code

### GetEnvironmentVariable

**Purpose**: Get an environment variable.

**Inputs**:
- `name` (str): Name of environment variable
- `default` (str): Default value if not found

**Outputs**:
- `output` (str): Environment variable value

### SetEnvironmentVariable

**Purpose**: Set an environment variable.

**Inputs**:
- `name` (str): Name of environment variable
- `value` (str): Value to set

**Outputs**:
- `output` (str): The set value

## Output

Output nodes return results to the user.

### TextOutput

**Purpose**: Display text output to the user.

**Inputs**:
- `text` (str): Text to display

**Outputs**:
- `output` (str): The displayed text

### ImageOutput

**Purpose**: Display an image to the user.

**Inputs**:
- `image` (Image): Image to display

**Outputs**:
- `output` (Image): The displayed image

### AudioOutput

**Purpose**: Display audio output to the user.

**Inputs**:
- `audio` (Audio): Audio to display

**Outputs**:
- `output` (Audio): The displayed audio

### VideoOutput

**Purpose**: Display video output to the user.

**Inputs**:
- `video` (Video): Video to display

**Outputs**:
- `output` (Video): The displayed video

### FileOutput

**Purpose**: Provide a file as output.

**Inputs**:
- `file` (str): Path to the file

**Outputs**:
- `output` (str): The output file path

### JSONOutput

**Purpose**: Display JSON data to the user.

**Inputs**:
- `data` (any): Data to display as JSON

**Outputs**:
- `output` (str): JSON representation of data

### TableOutput

**Purpose**: Display tabular data to the user.

**Inputs**:
- `data` (list): Table data
- `headers` (list): Column headers

**Outputs**:
- `output` (str): Formatted table

### ChartOutput

**Purpose**: Display chart data to the user.

**Inputs**:
- `data` (list): Chart data
- `chart_type` (str): Type of chart
- `title` (str): Chart title

**Outputs**:
- `output` (str): Chart representation

## Random

Random nodes provide random number generation capabilities.

### RandomFloat

**Purpose**: Generate a random floating-point number.

**Inputs**:
- `min` (float): Minimum value
- `max` (float): Maximum value

**Outputs**:
- `output` (float): Random float between min and max

### RandomInt

**Purpose**: Generate a random integer.

**Inputs**:
- `min` (int): Minimum value
- `max` (int): Maximum value

**Outputs**:
- `output` (int): Random integer between min and max

### RandomChoice

**Purpose**: Choose a random item from a list.

**Inputs**:
- `items` (list): List of items to choose from

**Outputs**:
- `output` (any): Randomly chosen item

### RandomString

**Purpose**: Generate a random string.

**Inputs**:
- `length` (int): Length of the string
- `characters` (str): Characters to choose from

**Outputs**:
- `output` (str): Random string

### RandomBoolean

**Purpose**: Generate a random boolean value.

**Outputs**:
- `output` (bool): Random boolean value

### Seed

**Purpose**: Set the random seed for reproducible results.

**Inputs**:
- `seed` (int): Seed value

**Outputs**:
- `output` (int): The set seed value

## Text

Text nodes provide comprehensive text processing capabilities with regex and templating support.

### Concat

**Purpose**: Concatenate multiple text strings.

**Inputs**:
- `strings` (list): List of strings to concatenate
- `separator` (str): Separator between strings

**Outputs**:
- `output` (str): Concatenated string

### Split

**Purpose**: Split a string into parts.

**Inputs**:
- `text` (str): Text to split
- `separator` (str): Separator string
- `max_splits` (int): Maximum number of splits

**Outputs**:
- `output` (list): List of split strings

### Replace

**Purpose**: Replace occurrences of a substring.

**Inputs**:
- `text` (str): Text to process
- `old` (str): Substring to replace
- `new` (str): Replacement string
- `count` (int): Maximum replacements

**Outputs**:
- `output` (str): Text with replacements

### RegexReplace

**Purpose**: Replace text using regular expressions.

**Inputs**:
- `text` (str): Text to process
- `pattern` (str): Regular expression pattern
- `replacement` (str): Replacement string
- `flags` (str): Regex flags

**Outputs**:
- `output` (str): Text with replacements

### RegexSearch

**Purpose**: Search for patterns using regular expressions.

**Inputs**:
- `text` (str): Text to search
- `pattern` (str): Regular expression pattern
- `flags` (str): Regex flags

**Outputs**:
- `match` (str): First match found
- `matches` (list): All matches found

### RegexMatch

**Purpose**: Test if text matches a regular expression.

**Inputs**:
- `text` (str): Text to test
- `pattern` (str): Regular expression pattern
- `flags` (str): Regex flags

**Outputs**:
- `output` (bool): True if text matches pattern

### Upper

**Purpose**: Convert text to uppercase.

**Inputs**:
- `text` (str): Text to convert

**Outputs**:
- `output` (str): Uppercase text

### Lower

**Purpose**: Convert text to lowercase.

**Inputs**:
- `text` (str): Text to convert

**Outputs**:
- `output` (str): Lowercase text

### Title

**Purpose**: Convert text to title case.

**Inputs**:
- `text` (str): Text to convert

**Outputs**:
- `output` (str): Title case text

### Strip

**Purpose**: Remove whitespace from the beginning and end of text.

**Inputs**:
- `text` (str): Text to strip
- `chars` (str): Characters to remove

**Outputs**:
- `output` (str): Stripped text

### Length

**Purpose**: Get the length of a string.

**Inputs**:
- `text` (str): Text to measure

**Outputs**:
- `output` (int): Length of text

### Substring

**Purpose**: Extract a substring from text.

**Inputs**:
- `text` (str): Source text
- `start` (int): Start position
- `length` (int): Length of substring

**Outputs**:
- `output` (str): Extracted substring

### Contains

**Purpose**: Check if text contains a substring.

**Inputs**:
- `text` (str): Text to search
- `substring` (str): Substring to find

**Outputs**:
- `output` (bool): True if substring is found

### StartsWith

**Purpose**: Check if text starts with a prefix.

**Inputs**:
- `text` (str): Text to check
- `prefix` (str): Prefix to check for

**Outputs**:
- `output` (bool): True if text starts with prefix

### EndsWith

**Purpose**: Check if text ends with a suffix.

**Inputs**:
- `text` (str): Text to check
- `suffix` (str): Suffix to check for

**Outputs**:
- `output` (bool): True if text ends with suffix

### IndexOf

**Purpose**: Find the index of a substring.

**Inputs**:
- `text` (str): Text to search
- `substring` (str): Substring to find
- `start` (int): Start position for search

**Outputs**:
- `output` (int): Index of substring (-1 if not found)

### Format

**Purpose**: Format text using template strings.

**Inputs**:
- `template` (str): Template string with placeholders
- `values` (dict): Values to substitute

**Outputs**:
- `output` (str): Formatted text

### Encode

**Purpose**: Encode text using specified encoding.

**Inputs**:
- `text` (str): Text to encode
- `encoding` (str): Encoding to use (utf-8, ascii, etc.)

**Outputs**:
- `output` (bytes): Encoded bytes

### Decode

**Purpose**: Decode bytes to text.

**Inputs**:
- `data` (bytes): Bytes to decode
- `encoding` (str): Encoding to use

**Outputs**:
- `output` (str): Decoded text

### Reverse

**Purpose**: Reverse a string.

**Inputs**:
- `text` (str): Text to reverse

**Outputs**:
- `output` (str): Reversed text

### WordCount

**Purpose**: Count the number of words in text.

**Inputs**:
- `text` (str): Text to count words in

**Outputs**:
- `output` (int): Number of words

### LineCount

**Purpose**: Count the number of lines in text.

**Inputs**:
- `text` (str): Text to count lines in

**Outputs**:
- `output` (int): Number of lines

### Trim

**Purpose**: Remove whitespace from both ends of text.

**Inputs**:
- `text` (str): Text to trim

**Outputs**:
- `output` (str): Trimmed text

### Pad

**Purpose**: Pad text to a specific length.

**Inputs**:
- `text` (str): Text to pad
- `length` (int): Target length
- `char` (str): Character to use for padding
- `side` (str): Side to pad (left, right, both)

**Outputs**:
- `output` (str): Padded text

### Repeat

**Purpose**: Repeat text a specified number of times.

**Inputs**:
- `text` (str): Text to repeat
- `count` (int): Number of repetitions

**Outputs**:
- `output` (str): Repeated text

### Capitalize

**Purpose**: Capitalize the first letter of text.

**Inputs**:
- `text` (str): Text to capitalize

**Outputs**:
- `output` (str): Capitalized text

### Slugify

**Purpose**: Convert text to a URL-friendly slug.

**Inputs**:
- `text` (str): Text to slugify

**Outputs**:
- `output` (str): Slugified text

### Hash

**Purpose**: Generate a hash of text.

**Inputs**:
- `text` (str): Text to hash
- `algorithm` (str): Hash algorithm (md5, sha1, sha256)

**Outputs**:
- `output` (str): Hash of text

### Template

**Purpose**: Process text using template engines.

**Inputs**:
- `template` (str): Template string
- `context` (dict): Template context variables
- `engine` (str): Template engine (jinja2, string)

**Outputs**:
- `output` (str): Processed template

## Video

Video nodes provide video editing and generation tools.

### LoadVideo

**Purpose**: Load a video file.

**Inputs**:
- `path` (str): Path to the video file

**Outputs**:
- `output` (Video): Loaded video asset

### SaveVideo

**Purpose**: Save a video to the assets directory.

**Inputs**:
- `video` (Video): Video to save
- `name` (str): Name of the video file
- `format` (str): Video format (mp4, avi, mov)

**Outputs**:
- `output` (Video): Saved video asset

### Trim

**Purpose**: Trim a video to a specific time range.

**Inputs**:
- `video` (Video): Video to trim
- `start_time` (float): Start time in seconds
- `end_time` (float): End time in seconds

**Outputs**:
- `output` (Video): Trimmed video

### Concatenate

**Purpose**: Concatenate multiple videos.

**Inputs**:
- `videos` (list): List of videos to concatenate

**Outputs**:
- `output` (Video): Concatenated video

### Resize

**Purpose**: Resize a video to new dimensions.

**Inputs**:
- `video` (Video): Video to resize
- `width` (int): New width
- `height` (int): New height
- `mode` (str): Resize mode

**Outputs**:
- `output` (Video): Resized video

### AddAudio

**Purpose**: Add audio track to a video.

**Inputs**:
- `video` (Video): Video to modify
- `audio` (Audio): Audio to add

**Outputs**:
- `output` (Video): Video with audio

### ExtractAudio

**Purpose**: Extract audio from a video.

**Inputs**:
- `video` (Video): Video to extract audio from

**Outputs**:
- `output` (Audio): Extracted audio

### AddSubtitles

**Purpose**: Add subtitles to a video.

**Inputs**:
- `video` (Video): Video to modify
- `subtitles` (str): Subtitle content or file path

**Outputs**:
- `output` (Video): Video with subtitles

### ChangeSpeed

**Purpose**: Change the playback speed of a video.

**Inputs**:
- `video` (Video): Video to modify
- `speed` (float): Speed multiplier

**Outputs**:
- `output` (Video): Speed-adjusted video

### Reverse

**Purpose**: Reverse a video.

**Inputs**:
- `video` (Video): Video to reverse

**Outputs**:
- `output` (Video): Reversed video

### AddWatermark

**Purpose**: Add a watermark to a video.

**Inputs**:
- `video` (Video): Video to modify
- `watermark` (Image): Watermark image
- `position` (str): Position of watermark

**Outputs**:
- `output` (Video): Video with watermark

### ExtractFrames

**Purpose**: Extract frames from a video.

**Inputs**:
- `video` (Video): Video to extract frames from
- `fps` (float): Frames per second to extract

**Outputs**:
- `output` (list): List of extracted frames

### CreateFromFrames

**Purpose**: Create a video from a series of frames.

**Inputs**:
- `frames` (list): List of frame images
- `fps` (float): Frames per second

**Outputs**:
- `output` (Video): Created video

### GetInfo

**Purpose**: Get information about a video.

**Inputs**:
- `video` (Video): Video to analyze

**Outputs**:
- `duration` (float): Duration in seconds
- `fps` (float): Frames per second
- `width` (int): Video width
- `height` (int): Video height
- `format` (str): Video format

### ApplyFilter

**Purpose**: Apply visual filters to a video.

**Inputs**:
- `video` (Video): Video to filter
- `filter` (str): Filter name
- `parameters` (dict): Filter parameters

**Outputs**:
- `output` (Video): Filtered video

### Stabilize

**Purpose**: Stabilize a shaky video.

**Inputs**:
- `video` (Video): Video to stabilize

**Outputs**:
- `output` (Video): Stabilized video

### ColorCorrect

**Purpose**: Apply color correction to a video.

**Inputs**:
- `video` (Video): Video to correct
- `brightness` (float): Brightness adjustment
- `contrast` (float): Contrast adjustment
- `saturation` (float): Saturation adjustment

**Outputs**:
- `output` (Video): Color-corrected video

### Blur

**Purpose**: Apply blur effect to a video.

**Inputs**:
- `video` (Video): Video to blur
- `radius` (float): Blur radius

**Outputs**:
- `output` (Video): Blurred video

### Sharpen

**Purpose**: Apply sharpening effect to a video.

**Inputs**:
- `video` (Video): Video to sharpen
- `strength` (float): Sharpening strength

**Outputs**:
- `output` (Video): Sharpened video

### Rotate

**Purpose**: Rotate a video by specified degrees.

**Inputs**:
- `video` (Video): Video to rotate
- `degrees` (float): Rotation angle in degrees

**Outputs**:
- `output` (Video): Rotated video

### Flip

**Purpose**: Flip a video horizontally or vertically.

**Inputs**:
- `video` (Video): Video to flip
- `direction` (str): Flip direction (horizontal, vertical)

**Outputs**:
- `output` (Video): Flipped video

### Crop

**Purpose**: Crop a video to a specific area.

**Inputs**:
- `video` (Video): Video to crop
- `x` (int): X coordinate of crop area
- `y` (int): Y coordinate of crop area
- `width` (int): Width of crop area
- `height` (int): Height of crop area

**Outputs**:
- `output` (Video): Cropped video

### Fade

**Purpose**: Apply fade in/out effects to a video.

**Inputs**:
- `video` (Video): Video to apply fade to
- `fade_in` (float): Fade in duration in seconds
- `fade_out` (float): Fade out duration in seconds

**Outputs**:
- `output` (Video): Video with fade effects

### Transition

**Purpose**: Apply transition effects between video segments.

**Inputs**:
- `video1` (Video): First video
- `video2` (Video): Second video
- `transition` (str): Transition type
- `duration` (float): Transition duration

**Outputs**:
- `output` (Video): Video with transition

### Overlay

**Purpose**: Overlay one video on top of another.

**Inputs**:
- `base_video` (Video): Base video
- `overlay_video` (Video): Video to overlay
- `x` (int): X position of overlay
- `y` (int): Y position of overlay

**Outputs**:
- `output` (Video): Video with overlay

### Composite

**Purpose**: Composite multiple videos together.

**Inputs**:
- `videos` (list): List of videos to composite
- `positions` (list): List of positions for each video

**Outputs**:
- `output` (Video): Composited video

---

## Tips and Best Practices

### Performance

- **Use appropriate data types**: Choose the right input/output types for your nodes to avoid unnecessary conversions.
- **Minimize file operations**: Cache file contents when possible to reduce I/O overhead.
- **Optimize list operations**: Use built-in list operations instead of manual loops when possible.

### Error Handling

- **Check file existence**: Use `FileExists` before attempting to read files.
- **Validate inputs**: Use validation nodes to ensure data is in the expected format.
- **Handle edge cases**: Consider empty lists, null values, and other edge cases in your workflows.

### Workflow Design

- **Modular design**: Break complex workflows into smaller, reusable components.
- **Use constants**: Define frequently used values as constants for easier maintenance.
- **Document your workflows**: Use meaningful node names and add comments where helpful.

### Resource Management

- **Clean up temporary files**: Remove temporary files after processing to avoid disk space issues.
- **Monitor memory usage**: Be aware of memory usage when processing large files or datasets.
- **Use appropriate compression**: Choose the right compression algorithm for your data type and use case.

## See Also

- [Getting Started Guide](getting-started.md)
- [Workflow Editor](workflow-editor.md)
- [Models Manager](models-manager.md)
- [User Interface](user-interface.md)

---

*This documentation is automatically generated from the [nodetool-base](https://github.com/nodetool-ai/nodetool-base) repository. For the most up-to-date information, please refer to the source repository.*
