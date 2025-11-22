---
layout: page
title: "nodetool.audio Nodes"
---

# nodetool.audio

This namespace contains 25 node(s).

## Available Nodes

- **[Audio Mixer](audiomixer.md)** - Mix up to 5 audio tracks together with individual volume controls.
    audio, mix, volume, combin...
- **[Audio To Numpy](audiotonumpy.md)** - Convert audio to numpy array for processing.
    audio, numpy, convert, array

    Use cases:
   ...
- **[Concat](concat.md)** - Concatenates two audio files together.
    audio, edit, join, +

    Use cases:
    - Combine mul...
- **[Concat List](concatlist.md)** - Concatenates multiple audio files together in sequence.
    audio, edit, join, multiple, +

    U...
- **[Convert To Array](converttoarray.md)** - Converts an audio file to a Array for further processing.
    audio, conversion, tensor

    Use ...
- **[Create Silence](createsilence.md)** - Creates a silent audio file with a specified duration.
    audio, silence, empty

    Use cases:
...
- **[Fade In](fadein.md)** - Applies a fade-in effect to the beginning of an audio file.
    audio, edit, transition

    Use ...
- **[Fade Out](fadeout.md)** - Applies a fade-out effect to the end of an audio file.
    audio, edit, transition

    Use cases...
- **[Load Audio Assets](loadaudioassets.md)** - Load audio files from an asset folder.
    load, audio, file, import
- **[Load Audio File](loadaudiofile.md)** - Read an audio file from disk.
    audio, input, load, file

    Use cases:
    - Load audio for p...
- **[Load Audio Folder](loadaudiofolder.md)** - Load all audio files from a folder, optionally including subfolders.
    audio, load, folder, fil...
- **[Mono To Stereo](monotostereo.md)** - Converts a mono audio signal to stereo.
    audio, convert, channels

    Use cases:
    - Expand...
- **[Normalize](normalize.md)** - Normalizes the volume of an audio file.
    audio, fix, dynamics, volume

    Use cases:
    - En...
- **[Numpy To Audio](numpytoaudio.md)** - Convert numpy array to audio.
    audio, numpy, convert

    Use cases:
    - Convert processed a...
- **[Overlay Audio](overlayaudio.md)** - Overlays two audio files together.
    audio, edit, transform

    Use cases:
    - Mix backgroun...
- **[Realtime Whisper](realtimewhisper.md)** - Stream audio input to WhisperLive and emit real-time transcription.
    realtime, whisper, transc...
- **[Remove Silence](removesilence.md)** - Removes or shortens silence in an audio file with smooth transitions.
    audio, edit, clean

   ...
- **[Repeat](repeat.md)** - Loops an audio file a specified number of times.
    audio, edit, repeat

    Use cases:
    - Cr...
- **[Reverse](reverse.md)** - Reverses an audio file.
    audio, edit, transform

    Use cases:
    - Create reverse audio eff...
- **[Save Audio Asset](saveaudio.md)** - Save an audio file to a specified asset folder.
    audio, folder, name

    Use cases:
    - Sav...
- **[Save Audio File](saveaudiofile.md)** - Write an audio file to disk.
    audio, output, save, file

    The filename can include time and...
- **[Slice Audio](sliceaudio.md)** - Extracts a section of an audio file.
    audio, edit, trim

    Use cases:
    - Cut out a specif...
- **[Stereo To Mono](stereotomono.md)** - Converts a stereo audio signal to mono.
    audio, convert, channels

    Use cases:
    - Reduce...
- **[Text To Speech](texttospeech.md)** - Generate speech audio from text using any supported TTS provider.
    Automatically routes to the...
- **[Trim](trim.md)** - Trim an audio file to a specified duration.
    audio, trim, cut

    Use cases:
    - Remove sil...
