conda-lock lock \
  -f environment.yml \
  --platform osx-arm64 \
  --platform linux-64 \
  --platform linux-aarch64 \
  --platform win-64 \
  --kind env \
  --filename-template electron/resources/environment-{platform}
