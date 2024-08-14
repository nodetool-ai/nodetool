# File: nodetool/nodes/nodetool/audio/segmentation.py

from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, Tensor, FolderRef
import librosa
import numpy as np


class DetectOnsets(BaseNode):
    """
    Detect onsets in an audio file.
    audio, analysis, segmentation

    Use cases:
    - Identify beat locations in music
    - Segment audio based on changes in energy or spectral content
    - Prepare audio for further processing or analysis
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The input audio file to analyze."
    )
    hop_length: int = Field(
        default=512, description="Number of samples between successive frames."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        # Load the audio file
        audio, sr, _ = await context.audio_to_numpy(self.audio)

        # Compute the onset strength
        onset_env = librosa.onset.onset_strength(
            y=audio, sr=sr, hop_length=self.hop_length
        )

        # Detect onsets
        onsets = librosa.onset.onset_detect(
            onset_envelope=onset_env,
            sr=sr,
            hop_length=self.hop_length,
        )

        # Convert frame indices to time
        onset_times = librosa.frames_to_time(onsets, sr=sr, hop_length=self.hop_length)

        return Tensor.from_numpy(onset_times)


class SegmentAudioByOnsets(BaseNode):
    """
    Segment an audio file based on detected onsets.
    audio, segmentation, processing

    Use cases:
    - Split a long audio recording into individual segments
    - Prepare audio clips for further analysis or processing
    - Extract specific parts of an audio file based on onset locations
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The input audio file to segment."
    )
    onsets: Tensor = Field(
        default=Tensor(), description="The onset times detected in the audio."
    )
    min_segment_length: float = Field(
        default=0.1, description="Minimum length of a segment in seconds."
    )

    async def process(self, context: ProcessingContext) -> list[AudioRef]:
        # Load the audio file
        audio, sr, _ = await context.audio_to_numpy(self.audio)

        # Convert onset times to samples
        onset_samples = librosa.time_to_samples(self.onsets.to_numpy(), sr=sr)

        # Add the end of the audio as the last onset
        onset_samples = np.append(onset_samples, len(audio))

        segments = []
        for start, end in zip(onset_samples[:-1], onset_samples[1:]):
            # Check if the segment is long enough
            if (end - start) / sr >= self.min_segment_length:
                segment = audio[start:end]
                segment_ref = await context.audio_from_numpy(segment, sr)
                segments.append(segment_ref)

        return segments


class SaveAudioSegments(BaseNode):
    """
    Save a list of audio segments to a specified folder.
    audio, save, export

    Use cases:
    - Export segmented audio files for further processing or analysis
    - Create a dataset of audio clips from a longer recording
    - Organize audio segments into a structured format
    """

    segments: list[AudioRef] = Field(
        default_factory=list, description="The list of audio segments to save."
    )
    output_folder: FolderRef = Field(
        default=FolderRef(), description="The folder to save the audio segments in."
    )
    name_prefix: str = Field(
        default="segment", description="Prefix for the saved audio file names."
    )

    async def process(self, context: ProcessingContext) -> FolderRef:
        for i, segment in enumerate(self.segments):
            segment_name = f"{self.name_prefix}_{i:04d}.wav"
            await context.audio_from_io(
                await context.asset_to_io(segment),
                name=segment_name,
                parent_id=self.output_folder.asset_id,
            )

        return self.output_folder
