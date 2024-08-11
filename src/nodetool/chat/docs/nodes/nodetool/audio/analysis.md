# nodetool.nodes.nodetool.audio.analysis

## AmplitudeToDB

Converts an amplitude spectrogram to a dB-scaled spectrogram.

This node is useful for:
- Compressing the dynamic range of spectrograms for visualization
- Preparing input for audio models that expect dB-scaled data

## ChromaSTFT

This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.
Applications:
- Chord recognition in music
- Music genre classification based on pitch content

## DBToAmplitude

The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.
Useful for:
- Reversing dB scaling before audio synthesis
- Preparing data for models that expect linear amplitude scaling

## DBToPower

This node converts a decibel (dB) spectrogram back to power scale.

Useful for:
- Reversing dB scaling for audio synthesis
- Preparing data for models that expect power-scaled data

## GriffinLim

GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.

Applications:
- Audio synthesis from spectrograms
- Phase reconstruction in audio processing pipelines

## MFCC

MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.

## MelSpectrogram

MelSpecNode computes the Mel-frequency spectrogram for an audio signal.

Useful for:
- Audio feature extraction for machine learning
- Speech and music analysis tasks

## PlotSpectrogram

The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.
#### Applications
- Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
- Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
- Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.

## PowertToDB

Converts a power spectrogram to decibel (dB) scale.

## STFT

This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal.

#### Applications
- Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.
- Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.
- Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.
- Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.

## SpectralContrast

The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.
#### Applications
- Music genre classification: distinguishing between different types of music based on the color of sound.
- Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.
- Audio analysis: determining various characteristics of audio files.

Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.

