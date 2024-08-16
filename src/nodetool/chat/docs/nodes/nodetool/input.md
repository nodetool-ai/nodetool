# nodetool.nodes.nodetool.input

## AssetSchemaMixin

## AudioFolder

Folder of audio assets input for workflows.

Use cases:
- Batch process multiple audio files
- Analyze audio datasets
- Create playlists or audio collections

**Fields:**
label: str
name: str
description: str
folder: FolderRef
limit: int

## AudioInput

Audio asset input for workflows.

Use cases:
- Load audio files for processing
- Analyze sound or speech content
- Provide audio input to models

**Fields:**
label: str
name: str
description: str
value: AudioRef

## BooleanInput

Boolean parameter input for workflows.

Use cases:
- Toggle features on/off
- Set binary flags
- Control conditional logic

**Fields:**
label: str
name: str
description: str
value: bool

## ChatInput

Chat message input for workflows.

Use cases:
- Accept user prompts or queries
- Capture conversational input
- Provide instructions to language models

**Fields:**
label: str
name: str
description: str
value: str

## FloatInput

Float parameter input for workflows.

Use cases:
- Specify a numeric value within a defined range
- Set thresholds or scaling factors
- Configure continuous parameters like opacity or volume

**Fields:**
label: str
name: str
description: str
value: float
min: float
max: float

## Folder

Folder of assets input for workflows.

Use cases:
- Batch process multiple assets
- Select a collection of related files
- Iterate over a set of inputs

**Fields:**
label: str
name: str
description: str
folder: FolderRef
limit: int

## GroupInput

Generic group input for loops.

Use cases:
- provides input for a loop
- iterates over a group of items

**Fields:**

## ImageFolder

Folder of image assets input for workflows.

Use cases:
- Batch process multiple images
- Train models on image datasets
- Create image galleries or collections

**Fields:**
label: str
name: str
description: str
folder: FolderRef
limit: int

## ImageInput

Image asset input for workflows.

Use cases:
- Load images for processing or analysis
- Provide visual input to models
- Select images for manipulation

**Fields:**
label: str
name: str
description: str
value: ImageRef

## IntegerInput

Integer parameter input for workflows.

Use cases:
- Specify counts or quantities
- Set index values
- Configure discrete numeric parameters

**Fields:**
label: str
name: str
description: str
value: int
min: int
max: int

## StringInput

String parameter input for workflows.

Use cases:
- Provide text labels or names
- Enter search queries
- Specify file paths or URLs

**Fields:**
label: str
name: str
description: str
value: str

## TextFolder

Folder of text assets input for workflows.

Use cases:
- Batch process multiple text documents
- Analyze text corpora
- Create document collections

**Fields:**
label: str
name: str
description: str
folder: FolderRef
limit: int

## TextInput

Text content input for workflows.

Use cases:
- Load text documents or articles
- Process multi-line text content
- Analyze large text bodies

**Fields:**
label: str
name: str
description: str
value: TextRef

## VideoFolder

Folder of video assets input for workflows.

Use cases:
- Batch process multiple video files
- Analyze video datasets
- Create video playlists or collections

**Fields:**
label: str
name: str
description: str
folder: FolderRef
limit: int

## VideoInput

Video asset input for workflows.

Use cases:
- Load video files for processing
- Analyze video content
- Extract frames or audio from videos

**Fields:**
label: str
name: str
description: str
value: VideoRef

