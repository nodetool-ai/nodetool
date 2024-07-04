# nodetool.nodes.nodetool.audio.analysis

## AmplitudeToDB

Converts an amplitude spectrogram to a dB-scaled spectrogram.

This node is useful for:
- Compressing the dynamic range of spectrograms for visualization
- Preparing input for audio models that expect dB-scaled data

**Tags:** audio, analysis, spectrogram

**Inherits from:** BaseNode

- **tensor**: The amplitude tensor to be converted to dB scale. (`Tensor`)

## ChromaSTFT

This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.
Applications:
- Chord recognition in music
- Music genre classification based on pitch content

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file to extract chromagram from. (`AudioRef`)
- **n_fft**: The number of samples per frame. (`int`)
- **hop_length**: The number of samples between frames. (`int`)

## DBToAmplitude

The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.
Useful for:
- Reversing dB scaling before audio synthesis
- Preparing data for models that expect linear amplitude scaling

**Tags:** 

**Inherits from:** BaseNode

- **tensor**: The dB-scaled tensor to be converted to amplitude scale. (`Tensor`)

## DBToPower

This node converts a decibel (dB) spectrogram back to power scale.

Useful for:
- Reversing dB scaling for audio synthesis
- Preparing data for models that expect power-scaled data

**Tags:** audio, analysis, spectrogram

**Inherits from:** BaseNode

- **tensor**: The tensor containing the decibel spectrogram. (`Tensor`)

## GriffinLim

GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.

Applications:
- Audio synthesis from spectrograms
- Phase reconstruction in audio processing pipelines

**Tags:** audio, synthesis, phase reconstruction

**Inherits from:** BaseNode

- **magnitude_spectrogram**: Magnitude spectrogram input for phase reconstruction. (`Tensor`)
- **n_iter**: Number of iterations for the Griffin-Lim algorithm. (`int`)
- **hop_length**: Number of samples between successive frames. (`int`)
- **win_length**: Each frame of audio is windowed by `window()`. The window will be of length `win_length` and then padded with zeros to match `n_fft`. (`typing.Optional[int]`)
- **window**: Type of window to use for Griffin-Lim transformation. (`str`)
- **center**: If True, the signal `y` is padded so that frame `D[:, t]` is centered at `y[t * hop_length]`. (`bool`)
- **length**: If given, the resulting signal will be zero-padded or clipped to this length. (`typing.Optional[int]`)

## MFCC

MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.

**Inherits from:** BaseNode

- **audio**: The audio file to extract MFCCs from. (`AudioRef`)
- **n_mfcc**: The number of MFCCs to extract. (`int`)
- **n_fft**: The number of samples per frame. (`int`)
- **hop_length**: The number of samples between frames. (`int`)
- **fmin**: The lowest frequency (in Hz). (`int`)
- **fmax**: The highest frequency (in Hz). (`int`)

## MelSpectrogram

MelSpecNode computes the Mel-frequency spectrogram for an audio signal.

Useful for:
- Audio feature extraction for machine learning
- Speech and music analysis tasks

**Tags:** audio, analysis, spectrogram

**Inherits from:** BaseNode

- **audio**: The audio file to convert to a tensor. (`AudioRef`)
- **n_fft**: The number of samples per frame. (`int`)
- **hop_length**: The number of samples between frames. (`int`)
- **n_mels**: The number of Mel bands to generate. (`int`)
- **fmin**: The lowest frequency (in Hz). (`int`)
- **fmax**: The highest frequency (in Hz). (`int`)

## PlotSpectrogram

The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.
#### Applications
- Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
- Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
- Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.

**Tags:** 

**Inherits from:** BaseNode

- **tensor**: The tensor containing the mel spectrogram. (`Tensor`)
- **fmax**: The highest frequency (in Hz). (`int`)

## PowertToDB

Converts a power spectrogram to decibel (dB) scale.

**Inherits from:** BaseNode

- **tensor**: The tensor containing the power spectrogram. (`Tensor`)

## STFT

This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal.

#### Applications
- Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.
- Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.
- Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.
- Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.

**Tags:** The STFT matrix represents the signal in both time and frequency domains, forming the foundation for many audio processing tasks.

**Inherits from:** BaseNode

- **audio**: The audio file to compute the STFT matrix from. (`AudioRef`)
- **n_fft**: The number of samples per frame. (`int`)
- **hop_length**: The number of samples between frames. (`int`)
- **win_length**: The window length. If None, it defaults to n_fft. (`typing.Optional[int]`)
- **window**: The type of window to use. (`str`)
- **center**: If True, input signal is padded so that frame D[:, t] is centered at y[t * hop_length]. (`bool`)

## SpectralContrast

The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.
#### Applications
- Music genre classification: distinguishing between different types of music based on the color of sound.
- Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.
- Audio analysis: determining various characteristics of audio files.

Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.

**Tags:** 

**Inherits from:** BaseNode

- **audio**: The audio file to extract spectral contrast from. (`AudioRef`)
- **n_fft**: The number of samples per frame. (`int`)
- **hop_length**: The number of samples between frames. (`int`)

