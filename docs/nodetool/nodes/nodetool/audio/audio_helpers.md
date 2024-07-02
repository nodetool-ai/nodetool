# nodetool.nodes.nodetool.audio.audio_helpers

## Function: `concatenate_audios(audios: List[pydub.audio_segment.AudioSegment]) -> pydub.audio_segment.AudioSegment`

Concatenate a list of audio segments

    Args:
        audios (List[AudioSegment]): A list of audio segments to concatenate.

    Returns:
        AudioSegment: The concatenated audio segment.

**Parameters:**

- `audios` (typing.List[pydub.audio_segment.AudioSegment])

**Returns:** `AudioSegment`

## Function: `convert_audio_format(audio: pydub.audio_segment.AudioSegment, format: str) -> pydub.audio_segment.AudioSegment`

Convert the audio to the given format.

    Args:
        audio (AudioSegment): The audio to convert.
        format (str): The format to convert the audio to.

    Returns:
        AudioSegment: The converted audio segment.

**Parameters:**

- `audio` (AudioSegment)
- `format` (str)

**Returns:** `AudioSegment`

## Function: `convert_audio_to_bytes(audio: pydub.audio_segment.AudioSegment) -> bytes`

Convert the audio to bytes.

    Args:
        audio (AudioSegment): The audio to convert.

    Returns:
        bytes: The audio as bytes.

**Parameters:**

- `audio` (AudioSegment)

**Returns:** `bytes`

## Function: `convert_to_float(audio_data: numpy.ndarray)`

Converts audio data from integer format to float format.

    Args:
        audio_data (np.ndarray): Audio data in integer format.

    Returns:
        np.ndarray: Audio data in float format.

**Parameters:**

- `audio_data` (ndarray)

## Function: `export_audio(audio: pydub.audio_segment.AudioSegment, file_path: str, format: str, codec: str, bitrate: str) -> None`

Export the audio to a file.

    Args:
        audio (AudioSegment): The audio to export.
        file_path (str): The path to the file to export the audio to.
        format (str): The format to export the audio in.
        codec (str): The codec to use for the exported audio.
        bitrate (str): The bitrate to use for the exported audio.

**Parameters:**

- `audio` (AudioSegment)
- `file_path` (str)
- `format` (str)
- `codec` (str)
- `bitrate` (str)

**Returns:** `None`

## Function: `get_audio_metadata(audio: pydub.audio_segment.AudioSegment) -> dict`

Get metadata for an audio segment.

    Args:
        audio (AudioSegment): The audio to get metadata for.

    Returns:
        dict: A dictionary containing the audio metadata.

**Parameters:**

- `audio` (AudioSegment)

**Returns:** `dict`

## Function: `normalize_audio(audio: pydub.audio_segment.AudioSegment) -> pydub.audio_segment.AudioSegment`

Normalize the audio.

    Args:
        audio (AudioSegment): The audio to normalize.

    Returns:
        AudioSegment: The normalized audio segment.

**Parameters:**

- `audio` (AudioSegment)

**Returns:** `AudioSegment`

## Function: `numpy_to_audio_segment(arr: numpy.ndarray, sample_rate=44100) -> pydub.audio_segment.AudioSegment`

Convert a numpy array to an audio segment.

    Args:
        arr (np.ndarray): The numpy array to convert.
        sample_rate (int): The sample rate of the audio segment.

    Returns:
        AudioSegment: The audio segment.

**Parameters:**

- `arr` (ndarray)
- `sample_rate` (default: `44100`)

**Returns:** `AudioSegment`

## Function: `remove_silence(audio: pydub.audio_segment.AudioSegment) -> pydub.audio_segment.AudioSegment`

Remove silence from an audio segment.
    This is done by detecting nonsilent ranges and concatenating them.

    Args:
        audio (AudioSegment): The audio to remove silence from.

    Returns:
        AudioSegment: The audio with silence removed.

**Parameters:**

- `audio` (AudioSegment)

**Returns:** `AudioSegment`

## Function: `resample_audio(audio: pydub.audio_segment.AudioSegment, sample_rate: int) -> pydub.audio_segment.AudioSegment`

Resample the audio to the given sample rate.

    Args:
        audio (AudioSegment): The audio to resample.
        sample_rate (int): The sample rate to resample the audio to.

    Returns:
        AudioSegment: The resampled audio segment.

**Parameters:**

- `audio` (AudioSegment)
- `sample_rate` (int)

**Returns:** `AudioSegment`

## Function: `resize_audio(audio: pydub.audio_segment.AudioSegment, duration: float) -> pydub.audio_segment.AudioSegment`

Resize the audio to the given duration.

    Args:
        audio (AudioSegment): The audio to resize.
        duration (float): The duration to resize the audio to, in milliseconds.

    Returns:
        AudioSegment: The resized audio segment.

**Parameters:**

- `audio` (AudioSegment)
- `duration` (float)

**Returns:** `AudioSegment`

## Function: `scale_audios_to_shortest_duration(audios: List[pydub.audio_segment.AudioSegment])`

Scales a list of audios to the shortest duration, meaning that
    all audios will have the same duration.

    Args:
        audios (List[AudioSegment]): A list of audios to scale.

    Returns:
        List[AudioSegment]: A list of scaled audio segments.

**Parameters:**

- `audios` (typing.List[pydub.audio_segment.AudioSegment])

## Function: `segment_audio(audio: pydub.audio_segment.AudioSegment) -> List[pydub.audio_segment.AudioSegment]`

Segment an audio into multiple audio segments.

    Args:
        audio (AudioSegment): The audio to segment.

    Returns:
        List[AudioSegment]: A list of segmented audio segments.

**Parameters:**

- `audio` (AudioSegment)

**Returns:** `typing.List[pydub.audio_segment.AudioSegment]`

