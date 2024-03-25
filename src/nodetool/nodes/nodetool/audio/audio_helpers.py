import io
import numpy as np
import pydub
from pydub import AudioSegment
import pydub.effects
from typing import List, Tuple, cast
from pydub.silence import detect_nonsilent
from pydub.silence import split_on_silence


def convert_to_float(audio_data: np.ndarray):
    """
    Converts audio data from integer format to float format.

    Args:
        audio_data (np.ndarray): Audio data in integer format.

    Returns:
        np.ndarray: Audio data in float format.
    """
    dtype = audio_data.dtype

    if dtype == np.float32 or dtype == np.float64:
        return audio_data
    if dtype == np.int16:
        return audio_data / 2**15
    if dtype == np.int32:
        return audio_data / 2**31
    if dtype == np.int64:
        return audio_data / 2**63

    raise Exception(f"Unsupported dtype: {dtype}")


def scale_audios_to_shortest_duration(audios: List[AudioSegment]):
    """
    Scales a list of audios to the shortest duration, meaning that
    all audios will have the same duration.

    Args:
        audios (List[AudioSegment]): A list of audios to scale.

    Returns:
        List[AudioSegment]: A list of scaled audio segments.
    """
    # Find the shortest duration
    min_duration = min([len(audio) for audio in audios])

    # Scale audios to the shortest duration
    scaled_audios = [audio[:min_duration] for audio in audios]

    return scaled_audios


def resize_audio(audio: AudioSegment, duration: float) -> AudioSegment:
    """
    Resize the audio to the given duration.

    Args:
        audio (AudioSegment): The audio to resize.
        duration (float): The duration to resize the audio to, in milliseconds.

    Returns:
        AudioSegment: The resized audio segment.
    """
    if len(audio) > duration:
        return cast(AudioSegment, audio[:duration])
    elif len(audio) < duration:
        padding = AudioSegment.silent(duration=int(len(audio) - duration))
        return audio + padding
    else:
        return audio


def concatenate_audios(audios: List[AudioSegment]) -> AudioSegment:
    """
    Concatenate a list of audio segments

    Args:
        audios (List[AudioSegment]): A list of audio segments to concatenate.

    Returns:
        AudioSegment: The concatenated audio segment.
    """
    concatenated_audio = AudioSegment.empty()
    for audio in audios:
        concatenated_audio += audio
    return concatenated_audio


def remove_silence(audio: AudioSegment) -> AudioSegment:
    """
    Remove silence from an audio segment.
    This is done by detecting nonsilent ranges and concatenating them.

    Args:
        audio (AudioSegment): The audio to remove silence from.

    Returns:
        AudioSegment: The audio with silence removed.
    """
    nonsilent_ranges = detect_nonsilent(audio, min_silence_len=100, silence_thresh=-32)
    return concatenate_audios(
        [cast(AudioSegment, audio[start:end]) for start, end in nonsilent_ranges]
    )


def segment_audio(audio: AudioSegment) -> List[AudioSegment]:
    """
    Segment an audio into multiple audio segments.

    Args:
        audio (AudioSegment): The audio to segment.

    Returns:
        List[AudioSegment]: A list of segmented audio segments.
    """
    res = split_on_silence(
        audio, min_silence_len=500, silence_thresh=-32, keep_silence=100
    )
    return [cast(AudioSegment, segment) for segment in res]


def resample_audio(audio: AudioSegment, sample_rate: int) -> AudioSegment:
    """
    Resample the audio to the given sample rate.

    Args:
        audio (AudioSegment): The audio to resample.
        sample_rate (int): The sample rate to resample the audio to.

    Returns:
        AudioSegment: The resampled audio segment.
    """
    return audio.set_frame_rate(sample_rate)


def get_audio_metadata(audio: AudioSegment) -> dict:
    """
    Get metadata for an audio segment.

    Args:
        audio (AudioSegment): The audio to get metadata for.

    Returns:
        dict: A dictionary containing the audio metadata.
    """
    return {
        "channels": audio.channels,
        "frame_rate": audio.frame_rate,
        "frame_width": audio.frame_width,
        "length": len(audio),
    }


def convert_audio_format(audio: AudioSegment, format: str) -> AudioSegment:
    """
    Convert the audio to the given format.

    Args:
        audio (AudioSegment): The audio to convert.
        format (str): The format to convert the audio to.

    Returns:
        AudioSegment: The converted audio segment.
    """
    buffer = io.BytesIO()
    audio.export(buffer, format=format)
    buffer.seek(0)
    return AudioSegment.from_file(buffer, format=format)


def export_audio(
    audio: AudioSegment, file_path: str, format: str, codec: str, bitrate: str
) -> None:
    """
    Export the audio to a file.

    Args:
        audio (AudioSegment): The audio to export.
        file_path (str): The path to the file to export the audio to.
        format (str): The format to export the audio in.
        codec (str): The codec to use for the exported audio.
        bitrate (str): The bitrate to use for the exported audio.
    """
    audio.export(file_path, format=format, codec=codec, bitrate=bitrate)


def convert_audio_to_bytes(audio: AudioSegment) -> bytes:
    """
    Convert the audio to bytes.

    Args:
        audio (AudioSegment): The audio to convert.

    Returns:
        bytes: The audio as bytes.
    """
    with io.BytesIO() as buffer:
        audio.export(buffer, format="MP3")
        return buffer.getvalue()


def normalize_audio(audio: AudioSegment) -> AudioSegment:
    """
    Normalize the audio.

    Args:
        audio (AudioSegment): The audio to normalize.

    Returns:
        AudioSegment: The normalized audio segment.
    """
    return pydub.effects.normalize(audio)


def numpy_to_audio_segment(arr: np.ndarray, sample_rate=44100) -> AudioSegment:
    """
    Convert a numpy array to an audio segment.

    Args:
        arr (np.ndarray): The numpy array to convert.
        sample_rate (int): The sample rate of the audio segment.

    Returns:
        AudioSegment: The audio segment.
    """
    # Convert the float array to int16 format, which is used by WAV files.
    arr_int16 = np.int16(arr * 32767.0).tobytes()

    # Create a pydub AudioSegment from raw data.
    return AudioSegment(arr_int16, sample_width=2, frame_rate=sample_rate, channels=1)
