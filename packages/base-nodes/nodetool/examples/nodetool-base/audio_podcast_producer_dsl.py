"""
Audio Podcast Producer DSL Example

Professional podcast production workflow combining multiple audio tracks with
effects and level adjustment.

Workflow:
1. **Load Audio Files** - Load voice track, background music, intro/outro
2. **Adjust Intro/Outro** - Apply fade in/out effects for smooth transitions
3. **Mix Tracks** - Blend voice, music, and intros with volume balancing
4. **Save Output** - Export final podcast episode as audio file

This demonstrates:
- Multi-track audio mixing
- Effect processing (fade in/out)
- Volume level adjustment
- Audio file management
- Professional podcast production patterns
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.audio import (
    LoadAudioFile,
    FadeIn,
    FadeOut,
    AudioMixer,
    SaveAudioFile,
)
from nodetool.dsl.nodetool.output import Output


# Load voice track (main podcast content)
voice_track = LoadAudioFile(
    path="~/audio/podcast_voice.wav",
)

# Load background music (ambient soundscape)
bg_music = LoadAudioFile(
    path="~/audio/background_music.mp3",
)

# Load intro audio
intro_audio = LoadAudioFile(
    path="~/audio/podcast_intro.wav",
)

# Load outro audio
outro_audio = LoadAudioFile(
    path="~/audio/podcast_outro.wav",
)

# Apply fade in effect to intro (smooth entrance)
intro_faded = FadeIn(
    audio=intro_audio.output,
    duration=2.0,  # 2 second fade in
)

# Apply fade out effect to outro (smooth exit)
outro_faded = FadeOut(
    audio=outro_audio.output,
    duration=3.0,  # 3 second fade out
)

# Mix all tracks together. AudioMixer accepts any number of named audio
# inputs as dynamic props. Wire a Gain node upstream of any track that
# needs a different level — the mixer itself only sums tracks evenly.
mixed_audio = AudioMixer(
    intro=intro_faded.output,
    voice=voice_track.output,
    background=bg_music.output,
    outro=outro_faded.output,
)

# Save final podcast episode
saved_podcast = SaveAudioFile(
    audio=mixed_audio.output,
    folder="~/audio",
    filename="podcast_episode_final.wav",
)

# Output the final audio file
audio_output = Output(
    name="podcast_episode",
    value=saved_podcast.output,
)

# Create the workflow graph
graph = create_graph(audio_output)


# Main execution
if __name__ == "__main__":
    result = run_graph(graph)
    print("✅ Podcast production complete!")
    print(f"Output audio: {result}")
