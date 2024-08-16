# nodetool.nodes.replicate.audio.generate

## Bark

🔊 Text-Prompted Generative Audio Model

**Fields:**
prompt: str
text_temp: float
output_full: bool
waveform_temp: float
history_prompt: nodetool.nodes.replicate.audio.generate.Bark.History_prompt | None
custom_history_prompt: str | None

## MusicGen

Generate music from a prompt or melody

**Fields:**
seed: int | None
top_k: int
top_p: float
prompt: str | None
duration: int
input_audio: str | None
temperature: float
continuation: bool
model_version: Model_version
output_format: Output_format
continuation_end: int | None
continuation_start: int
multi_band_diffusion: bool
normalization_strategy: Normalization_strategy
classifier_free_guidance: int

## RealisticVoiceCloning

Create song covers with any RVC v2 trained AI voice from audio files.

**Fields:**
protect: float
rvc_model: Rvc_model
index_rate: float
song_input: AudioRef
reverb_size: float
pitch_change: Pitch_change
rms_mix_rate: float
filter_radius: int
output_format: Output_format
reverb_damping: float
reverb_dryness: float
reverb_wetness: float
crepe_hop_length: int
pitch_change_all: float
main_vocals_volume_change: float
pitch_detection_algorithm: Pitch_detection_algorithm
instrumental_volume_change: float
backup_vocals_volume_change: float
custom_rvc_model_download_url: str | None

## Riffusion

Stable diffusion for real-time music generation

**Fields:**
alpha: float
prompt_a: str
prompt_b: str | None
denoising: float
seed_image_id: Seed_image_id
num_inference_steps: int

## StyleTTS2

Generates speech from text

**Fields:**
beta: float
seed: int
text: str | None
alpha: float
weights: str | None
reference: AudioRef
diffusion_steps: int
embedding_scale: float

## TortoiseTTS

Generate speech from text, clone voices from mp3 files. From James Betker AKA "neonbjb".

**Fields:**
seed: int
text: str
preset: Preset
voice_a: Voice_a
voice_b: Voice_b
voice_c: Voice_c
cvvp_amount: float
custom_voice: AudioRef

