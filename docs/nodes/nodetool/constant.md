# nodetool.nodes.nodetool.constant

## Audio

Represents an audio file constant in the workflow.

Use cases:
- Provide a fixed audio input for audio processing nodes
- Reference a specific audio file in the workflow
- Set default audio for testing or demonstration purposes

**Tags:** audio, file, mp3, wav

**Fields:**
- **value** (AudioRef)


## Bool

Represents a boolean constant in the workflow.

Use cases:
- Control flow decisions in conditional nodes
- Toggle features or behaviors in the workflow
- Set default boolean values for configuration

**Tags:** boolean, logic, flag

**Fields:**
- **value** (bool)


## Constant

**Fields:**


## DataFrame

Represents a fixed DataFrame constant in the workflow.

Use cases:
- Provide static data for analysis or processing
- Define lookup tables or reference data
- Set sample data for testing or demonstration

**Tags:** table, data, dataframe, pandas

**Fields:**
- **value** (DataframeRef)


## Dict

Represents a dictionary constant in the workflow.

Use cases:
- Store configuration settings
- Provide structured data inputs
- Define parameter sets for other nodes

**Tags:** dictionary, key-value, mapping

**Fields:**
- **value** (dict[str, typing.Any])


## Float

Represents a floating-point number constant in the workflow.

Use cases:
- Set numerical parameters for calculations
- Define thresholds or limits
- Provide fixed numerical inputs for processing

**Tags:** number, decimal, float

**Fields:**
- **value** (float)


## Image

Represents an image file constant in the workflow.

Use cases:
- Provide a fixed image input for image processing nodes
- Reference a specific image file in the workflow
- Set default image for testing or demonstration purposes

**Tags:** picture, photo, image

**Fields:**
- **value** (ImageRef)


## Integer

Represents an integer constant in the workflow.

Use cases:
- Set numerical parameters for calculations
- Define counts, indices, or sizes
- Provide fixed numerical inputs for processing

**Tags:** number, integer, whole

**Fields:**
- **value** (int)


## List

Represents a list constant in the workflow.

Use cases:
- Store multiple values of the same type
- Provide ordered data inputs
- Define sequences for iteration in other nodes

**Tags:** array, squence, collection

**Fields:**
- **value** (list[typing.Any])


## String

Represents a string constant in the workflow.

Use cases:
- Provide fixed text inputs for processing
- Define labels, identifiers, or names
- Set default text values for configuration

**Tags:** text, string, characters

**Fields:**
- **value** (str)


## Text

Represents a text document constant in the workflow.

Use cases:
- Provide larger text inputs for natural language processing
- Store formatted content or documentation
- Set default text documents for analysis

**Tags:** document, markdown, content

**Fields:**
- **value** (TextRef)


## Video

Represents a video file constant in the workflow.

Use cases:
- Provide a fixed video input for video processing nodes
- Reference a specific video file in the workflow
- Set default video for testing or demonstration purposes

**Tags:** video, movie, mp4, file

**Fields:**
- **value** (VideoRef)


