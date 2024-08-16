# nodetool.nodes.nodetool.audio.analysis

## AmplitudeToDB

Converts an amplitude spectrogram to a dB-scaled spectrogram.

This node is useful for:
- Compressing the dynamic range of spectrograms for visualization
- Preparing input for audio models that expect dB-scaled data

**Fields:**
tensor: Tensor

## BeatTracking

Perform beat tracking on an audio file.

Use cases:
- Analyze rhythm and tempo of music tracks
- Synchronize visual effects with music beats
- Extract rhythmic features for music classification tasks

**Fields:**
audio: AudioRef
start_bpm: float

## ChromaSTFT

This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.
Applications:
- Chord recognition in music
- Music genre classification based on pitch content

**Fields:**
audio: AudioRef
n_fft: int
hop_length: int

## DBToAmplitude

The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.
Useful for:
- Reversing dB scaling before audio synthesis
- Preparing data for models that expect linear amplitude scaling

**Fields:**
tensor: Tensor

## DBToPower

This node converts a decibel (dB) spectrogram back to power scale.

Useful for:
- Reversing dB scaling for audio synthesis
- Preparing data for models that expect power-scaled data

**Fields:**
tensor: Tensor

## GriffinLim

GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.

Applications:
- Audio synthesis from spectrograms
- Phase reconstruction in audio processing pipelines

**Fields:**
magnitude_spectrogram: Tensor
n_iter: int
hop_length: int
win_length: typing.Optional[int]
window: str
center: bool
length: typing.Optional[int]

## HarmonicPercussiveSeparation

Perform Harmonic-Percussive Source Separation on an audio file.

Use cases:
- Isolate melodic and rhythmic components of music
- Enhance drum tracks by extracting percussive elements
- Improve pitch detection by focusing on harmonic content

**Fields:**
audio: AudioRef
margin: float

## MFCC

MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.

**Fields:**
audio: AudioRef
n_mfcc: int
n_fft: int
hop_length: int
fmin: int
fmax: int

## MelSpectrogram

MelSpecNode computes the Mel-frequency spectrogram for an audio signal.

Useful for:
- Audio feature extraction for machine learning
- Speech and music analysis tasks

**Fields:**
audio: AudioRef
n_fft: int
hop_length: int
n_mels: int
fmin: int
fmax: int

## PlotSpectrogram

The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.
#### Applications
- Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
- Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
- Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.

**Fields:**
tensor: Tensor
fmax: int

## PowertToDB

Converts a power spectrogram to decibel (dB) scale.

**Fields:**
tensor: Tensor

## STFT

This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal.

#### Applications
- Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.
- Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.
- Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.
- Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.

**Fields:**
audio: AudioRef
n_fft: int
hop_length: int
win_length: typing.Optional[int]
window: str
center: bool

## SpectralCentroid

Computes the spectral centroid of an audio file.

The spectral centroid indicates where the "center of mass" of the spectrum is located.
Perceptually, it has a connection with the impression of "brightness" of a sound.

Use cases:
- Analyze the timbral characteristics of audio
- Track changes in sound brightness over time
- Feature extraction for music genre classification
- Audio effect design and sound manipulation

**Fields:**
audio: AudioRef
n_fft: int
hop_length: int

## SpectralContrast

The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.
#### Applications
- Music genre classification: distinguishing between different types of music based on the color of sound.
- Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.
- Audio analysis: determining various characteristics of audio files.

Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.

**Fields:**
audio: AudioRef
n_fft: int
hop_length: int

