# nodetool.common.media_utils

#### `create_empty_video`

Create a video file with empty frames.

    Args:
        fps (int): The frames per second of the video.
        duration (int): The duration of the video in seconds.
        width (int): The width of each frame.
        height (int): The height of each frame.
        filename (str): The filename of the output video file.

    Returns:
        None

**Parameters:**

- `fps` (int)
- `width` (int)
- `height` (int)
- `duration` (int)
- `filename` (str)

#### `create_image_thumbnail`

Generate a thumbnail image from an image using PIL.

**Parameters:**

- `input_io` (IO)
- `width` (int)
- `height` (int)

**Returns:** `BytesIO`

#### `create_video_thumbnail`

Generate a thumbnail image from a video file using OpenCV.

**Parameters:**

- `input_io` (IO)
- `width` (int)
- `height` (int)

**Returns:** `BytesIO`

#### `get_audio_duration`

Get the duration of an audio file using pydub.

    Args:
        source_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the audio file in seconds.

**Parameters:**

- `source_io` (BytesIO)

**Returns:** `float`

#### `get_video_duration`

Get the duration of a media file using ffprobe.

    Args:
        input_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the media file in seconds.

**Parameters:**

- `input_io` (BytesIO)

**Returns:** `typing.Optional[float]`

