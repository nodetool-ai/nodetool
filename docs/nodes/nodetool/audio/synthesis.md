# nodetool.nodes.nodetool.audio.synthesis

## Envelope

Applies an ADR (Attack-Decay-Release) envelope to an audio signal.

Use cases:
- Shape the amplitude of synthesized sounds
- Create percussion-like instruments
- Control sound dynamics

**Tags:** audio, synthesis, envelope

**Fields:**
- **audio**: The audio to apply the envelope to. (AudioRef)
- **attack**: Attack time in seconds. (float)
- **decay**: Decay time in seconds. (float)
- **release**: Release time in seconds. (float)
- **peak_amplitude**: Peak amplitude after attack phase (0-1). (float)


## FM_Synthesis

Performs FM (Frequency Modulation) synthesis.

Use cases:
- Create complex timbres
- Generate bell-like sounds
- Synthesize metallic tones

**Tags:** audio, synthesis, modulation

**Fields:**
- **carrier_freq**: Carrier frequency in Hz. (float)
- **modulator_freq**: Modulator frequency in Hz. (float)
- **modulation_index**: Modulation index (affects richness of sound). (float)
- **amplitude**: Amplitude of the output. (float)
- **duration**: Duration in seconds. (float)
- **sample_rate**: Sampling rate in Hz. (int)


## Oscillator

Generates basic waveforms (sine, square, sawtooth, triangle).

Use cases:
- Create fundamental waveforms for synthesis
- Generate test signals
- Build complex sounds from basic waves

**Tags:** audio, synthesis, waveform

**Fields:**
- **waveform**: Type of waveform to generate (sine, square, sawtooth, triangle). (OscillatorWaveform)
- **frequency**: Frequency of the waveform in Hz. (float)
- **amplitude**: Amplitude of the waveform. (float)
- **duration**: Duration in seconds. (float)
- **sample_rate**: Sampling rate in Hz. (int)
- **pitch_envelope_amount**: Amount of pitch envelope in semitones (float)
- **pitch_envelope_time**: Duration of pitch envelope in seconds (float)
- **pitch_envelope_curve**: Shape of pitch envelope (linear, exponential) (PitchEnvelopeCurve)


## OscillatorWaveform

## PinkNoise

Generates pink noise (1/f noise).

Use cases:
- Create natural-sounding background noise
- Test speaker response
- Sound masking

**Tags:** audio, synthesis, noise

**Fields:**
- **amplitude**: Amplitude of the noise. (float)
- **duration**: Duration in seconds. (float)
- **sample_rate**: Sampling rate in Hz. (int)


## PitchEnvelopeCurve

## WhiteNoise

Generates white noise.

Use cases:
- Create background ambience
- Generate percussion sounds
- Test audio equipment

**Tags:** audio, synthesis, noise

**Fields:**
- **amplitude**: Amplitude of the noise. (float)
- **duration**: Duration in seconds. (float)
- **sample_rate**: Sampling rate in Hz. (int)


