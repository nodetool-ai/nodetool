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


## Date

Make a date object from year, month, day.

**Tags:** date, make, create

**Fields:**
- **year**: Year of the date (int)
- **month**: Month of the date (int)
- **day**: Day of the date (int)


## DateTime

Make a datetime object from year, month, day, hour, minute, second.

**Tags:** datetime, make, create

**Fields:**
- **year**: Year of the datetime (int)
- **month**: Month of the datetime (int)
- **day**: Day of the datetime (int)
- **hour**: Hour of the datetime (int)
- **minute**: Minute of the datetime (int)
- **second**: Second of the datetime (int)
- **microsecond**: Microsecond of the datetime (int)
- **tzinfo**: Timezone of the datetime (str)
- **utc_offset**: UTC offset of the datetime (int)


## Dict

Represents a dictionary constant in the workflow.

Use cases:
- Store configuration settings
- Provide structured data inputs
- Define parameter sets for other nodes

**Tags:** dictionary, key-value, mapping

**Fields:**
- **value** (dict[str, typing.Any])


## Document

Represents a document constant in the workflow.

**Tags:** document, pdf, word, docx

**Fields:**
- **value** (DocumentRef)


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

**Tags:** array, sequence, collection

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


## Video

Represents a video file constant in the workflow.

Use cases:
- Provide a fixed video input for video processing nodes
- Reference a specific video file in the workflow
- Set default video for testing or demonstration purposes

**Tags:** video, movie, mp4, file

**Fields:**
- **value** (VideoRef)


