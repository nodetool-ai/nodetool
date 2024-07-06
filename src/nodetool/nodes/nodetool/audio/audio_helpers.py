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


def remove_silence(audio: AudioSegment, min_length: int = 100, threshold: int = -32, reduction_factor: float = 1.0, crossfade: int = 10, min_silence_between_parts: int = 100) -> AudioSegment:
    """
    Remove or shorten silence from an audio segment with crossfade to avoid clipping.

    Args:
        audio (AudioSegment): The audio to process.
        min_length (int): Minimum length of silence to be processed (in milliseconds).
        threshold (int): Silence threshold in dB (relative to full scale). Higher values detect more silence.
        reduction_factor (float): Factor to reduce silent parts (0.0 to 1.0).
                                          0.0 keeps silence as is, 1.0 removes it completely.
        crossfade (int): Duration of crossfade in milliseconds to apply between segments.
        min_silence_between_parts (int): Minimum silence duration to maintain between non-silent segments.

    Returns:
        AudioSegment: The processed audio.
    """
    nonsilent_ranges = detect_nonsilent(audio, min_silence_len=min_length, silence_thresh=threshold)
    
    if not isinstance(nonsilent_ranges, list):
        nonsilent_ranges = list(nonsilent_ranges)

    if len(nonsilent_ranges) == 0:
        return AudioSegment.silent(duration=0)

    result = AudioSegment.empty()
    prev_end = 0

    for start, end in nonsilent_ranges:
        # Process the silent part before this non-silent range
        silence_duration = start - prev_end
        if silence_duration > 0:
            reduced_silence = max(silence_duration * (1 - reduction_factor), min_silence_between_parts)
            silence_segment = audio[prev_end:prev_end + int(reduced_silence)]
            silence_segment = cast(AudioSegment, silence_segment)
            
            if len(result) > 0:
                result = result.append(silence_segment, crossfade=min(crossfade, len(silence_segment)))
            else:
                result += silence_segment

        # Add the non-silent part
        non_silent_segment = audio[start:end]
        non_silent_segment = cast(AudioSegment, non_silent_segment)
        if len(result) > 0:
            result = result.append(non_silent_segment, crossfade=min(crossfade, len(non_silent_segment)))
        else:
            result += non_silent_segment

        prev_end = end

    # Process any silence at the end
    if prev_end < len(audio):
        silence_duration = len(audio) - prev_end
        reduced_silence = max(silence_duration * (1 - reduction_factor), min_silence_between_parts)
        final_silence = audio[prev_end:prev_end + int(reduced_silence)]
        final_silence = cast(AudioSegment, final_silence)
        result = result.append(final_silence, crossfade=min(crossfade, len(final_silence)))

    return result


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
