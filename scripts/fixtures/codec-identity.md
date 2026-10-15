# Codec identity fixture

`codec-identity.mp4` contains two 64 × 48 red H.264 frames and mono AAC audio
at 48 kHz. The packed smoke registers codecs through the agents bootstrap,
then decodes the first video frame and 1,024 audio samples through Mediabunny.
This checks that agents and the server codec adapter share one module instance.

Regenerate with FFmpeg:

```bash
ffmpeg -v error -f lavfi -i color=c=red:size=64x48:rate=10 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 0.2 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -ac 1 -b:a 32k \
  -movflags +faststart -y scripts/fixtures/codec-identity.mp4
```
