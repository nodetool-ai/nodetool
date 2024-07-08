# nodetool.nodes.replicate.audio.separate

## Demucs

Demucs is an audio source separator created by Facebook Research.

- **jobs**: Choose the number of parallel jobs to use for separation. (int)
- **stem**: If you just want to isolate one stem, you can choose it here. (Stem)
- **audio**: Upload the file to be processed here. (AudioRef)
- **model**: Choose the demucs audio that proccesses your audio. The readme has more information on what to choose. (Model)
- **split**: Choose whether or not the audio should be split into chunks. (bool)
- **shifts**: Choose the amount random shifts for equivariant stabilization. This performs multiple predictions with random shifts of the input and averages them, which makes it x times slower. (int)
- **overlap**: Choose the amount of overlap between prediction windows. (float)
- **segment**: Choose the segment length to use for separation. (int | None)
- **clip_mode**: Choose the strategy for avoiding clipping. Rescale will rescale entire signal if necessary or clamp will allow hard clipping. (Clip_mode)
- **mp3_preset**: Choose the preset for the MP3 output. Higher is faster but worse quality. If MP3 is not selected as the output type, this has no effect. (Mp3_preset)
- **wav_format**: Choose format for the WAV output. If WAV is not selected as the output type, this has no effect. (Wav_format)
- **mp3_bitrate**: Choose the bitrate for the MP3 output. Higher is better quality but larger file size. If MP3 is not selected as the output type, this has no effect. (int)
- **output_format**: Choose the audio format you would like the result to be returned in. (Output_format)

