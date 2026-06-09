---
name: companion-clis
description: Companion CLIs for Runpod workflows — HuggingFace, GitHub, Docker, and AWS.
allowed-tools: Bash(hf:*), Bash(gh:*), Bash(docker:*), Bash(aws:*), Bash(ssh-keygen:*), Bash(ssh-add:*), Bash(ssh-agent:*)
compatibility: Linux, macOS, Windows
metadata:
  author: runpod
  version: "1.0"
license: Apache-2.0
---

# Companion CLIs

Four CLIs commonly needed alongside Runpod: HuggingFace (`hf`), GitHub (`gh`), Docker (`docker`), and AWS (`aws`). Each requires credentials before use.

## Windows: Install WSL2 First

If you are on Windows, install WSL2 (Windows Subsystem for Linux) before proceeding. WSL2 gives you a native Linux environment on Windows, which all these CLIs are designed for. Run in PowerShell as Administrator, then restart:

```powershell
wsl --install
```

This installs WSL2 with Ubuntu by default. After restarting, open the Ubuntu app to complete setup (create a Linux username and password). From that point on, follow the **Linux** instructions throughout this skill.

## HuggingFace CLI

The HuggingFace CLI (`hf`) is used to download models from the Hub to your local machine so they are cached and available when you build and run the Docker container. For example, to deploy `meta-llama/Llama-3.1-8B` to a Runpod serverless endpoint: download the model locally first, build a Docker image that includes or mounts it, validate the container locally, then push the image to Docker Hub for Runpod to pull.

### Install

```bash
# macOS / Linux (standalone installer — recommended)
curl -LsSf https://hf.co/cli/install.sh | bash

# macOS (Homebrew)
brew install hf

# Windows (WSL2): use the Linux standalone installer above
```

> **Note:** `pip install huggingface_hub` installs the older Python CLI (`huggingface-cli`), which uses different command syntax. The commands below are for the standalone `hf` CLI.

### Credentials

Get a token at https://huggingface.co/settings/tokens. Use **write** access for uploading; **read** access is sufficient for downloading public or gated models.

```bash
# Option 1: interactive login (saves token to ~/.cache/huggingface/token, optionally to git credential store)
hf auth login

# Option 2: non-interactive (pass token directly, useful in scripts and pod start commands)
hf auth login --token $HF_TOKEN --add-to-git-credential

# Option 3: environment variable (takes precedence over saved token; to revert, unset the variable)
export HF_TOKEN=hf_...
```

```bash
hf auth whoami      # confirm auth and org memberships
hf auth logout      # delete all locally stored tokens
```

### Key Commands

```bash
# Download a model to a local directory (use --local-dir to control where it lands)
hf download meta-llama/Llama-3.1-8B --local-dir ./models/llama-3.1-8b
hf download TinyLlama/TinyLlama-1.1B-Chat-v1.0 --local-dir ./models/tinyllama

# Download a single file from a model repo
hf download meta-llama/Llama-3.1-8B config.json --local-dir ./models/llama-3.1-8b

# Download with glob filters (e.g. only safetensors weights, skip fp16 variants)
hf download stabilityai/stable-diffusion-xl-base-1.0 \
  --include "*.safetensors" --exclude "*.fp16.*" \
  --local-dir ./models/sdxl

# Download a specific revision (commit hash, branch, or tag — append --revision REF)
hf download meta-llama/Llama-3.1-8B --revision v1.0 --local-dir ./models/llama-3.1-8b
```

### Troubleshooting

```bash
# Increase download timeout on slow connections (default: 10s)
export HF_HUB_DOWNLOAD_TIMEOUT=30
```

---

## GitHub CLI

The GitHub CLI (`gh`) is used to manage repositories for Runpod serverless workers. This includes cloning repos into local Docker containers for testing, versioning source code so changes can be tracked and shared with teammates or collaborators, and creating GitHub releases that publish listings to the Runpod Hub. The Hub indexes releases — not commits — so every deployment update requires a new release.

### Install

```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
(type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
  && sudo mkdir -p -m 755 /etc/apt/keyrings \
  && out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  && cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
  && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
     | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && sudo apt update && sudo apt install gh -y

# Linux (Alpine)
apk add github-cli

# Windows (WSL2): use the Linux (Debian/Ubuntu) installer above
```

### SSH Keys

An SSH key identifies your machine as authentic to remote services. Generate one key and register the public key with each service that requires it — GitHub (via `gh`) and HuggingFace (via browser).

**Generate a key**

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# Saves to ~/.ssh/id_ed25519 (private) and ~/.ssh/id_ed25519.pub (public)
# Press Enter to accept the default path; set a passphrase or leave blank
```

**Add the key to the SSH agent**

```bash
# macOS
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519

# macOS — also add to ~/.ssh/config so the key loads automatically on login.
# Create the file if it doesn't exist, and add these lines:
#
#   Host *
#     AddKeysToAgent yes
#     UseKeychain yes
#     IdentityFile ~/.ssh/id_ed25519

# Linux
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Windows (WSL2): use the Linux instructions above
```

### Credentials

```bash
# Interactive login — when prompted, select SSH as the git protocol
gh auth login

# Verify auth
gh auth status
```

**Register the public key with each service**

```bash
# GitHub — upload via gh CLI (requires auth above to be completed first)
gh ssh-key add ~/.ssh/id_ed25519.pub --title "my-machine"

# HuggingFace — paste contents of public key manually in browser
cat ~/.ssh/id_ed25519.pub   # copy this output
# Then add at https://huggingface.co/settings/keys
```

### Key Commands

```bash
# Repositories
gh repo create my-worker --public             # create a new public repo (required for Hub)
gh repo clone owner/repo                      # clone a repository over SSH
gh repo clone owner/repo -- --depth 1        # shallow clone
gh repo view owner/repo                       # view repo details and URL

# Releases — the Runpod Hub indexes releases, not commits
# Every update to a Hub listing requires a new GitHub release
gh release create v1.0.0 --title "v1.0.0" --notes "Initial release"   # create a release
gh release create v1.0.1 --title "v1.0.1" --notes "Update model tag"  # update Hub listing
gh release list                               # list all releases
gh release view v1.0.0                        # view release details
```

#### Runpod Hub repository structure

A Hub-compatible repository requires these files (in root or `.runpod/` directory):

```
handler.py        # serverless worker implementation
Dockerfile        # container definition
README.md         # documentation shown on Hub listing
.runpod/
  hub.json        # Hub metadata: title, description, category, GPU config, env vars
  tests.json      # test cases run after each release
```

To publish: go to https://console.runpod.io → Hub → Add your repo → enter the GitHub repository URL.

---

## Docker

Docker is used to build and validate container images locally before pushing to Docker Hub. Runpod uses Docker Hub as its default image registry — serverless endpoints, pods, and templates all reference images by their Docker Hub tag. Once an image is pushed, Runpod workers pull it automatically when the endpoint or pod is started.

### Install

**macOS:** Download Docker Desktop from https://docs.docker.com/desktop/setup/install/mac-install/
- Choose the **Apple Silicon** installer for M-series Macs, or **Intel Chip** for older Macs
- Open the DMG, drag Docker to Applications, and launch it

**Windows:** Download Docker Desktop from https://docs.docker.com/desktop/setup/install/windows-install/
- Requires WSL 2 — if you followed the WSL2 setup above, Docker Desktop will detect it automatically
- After installation, `docker` commands work inside your WSL2 terminal without extra configuration
- Run the installer and follow the setup wizard

**Linux:** See https://docs.docker.com/engine/install/ for distro-specific instructions

```bash
# Linux convenience script (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # allow non-root usage (re-login after)
```

### Credentials

Docker Hub authentication uses a personal access token (PAT), not your account password.

1. Go to https://app.docker.com → Avatar (top right) → Account Settings → Personal Access Tokens
2. Click **Generate new token** — give it a descriptive name, set an expiration, and choose **Read & Write** access
3. Copy the token immediately — it is shown only once

```bash
docker login -u DOCKERHUB_USERNAME
# When prompted for a password, paste your personal access token
```

Credentials are saved to `~/.docker/config.json` after a successful login.

### Tagging

> **Always use explicit semantic version tags. Never rely on `latest`.**

The `latest` tag does not automatically point to the newest image — it only reflects the last build that was pushed without an explicit tag. If you push `v1.0.0` and then push `v1.0.1` with an explicit tag, `latest` still points to `v1.0.0`. Runpod workers pinned to `latest` will silently pull the wrong version.

Use a tag that uniquely identifies the build: `v1.0.0`, `v1.0.1`, etc.

```bash
# Correct: explicit semantic version tag
docker build --platform=linux/amd64 -t myorg/myimage:v1.0.0 .
docker push myorg/myimage:v1.0.0

# Wrong: latest tag is ambiguous and unreliable
docker build -t myorg/myimage:latest .
```

### Docker Hub

Docker Hub is the registry Runpod pulls images from. After pushing, images are visible at https://hub.docker.com/repositories/ and referenceable in Runpod as `username/image:tag`.

Images on Docker Hub can be public (anyone can pull) or private (requires credentials). For private images, register your Docker Hub credentials in Runpod once and they become available to any template:

1. Go to https://console.runpod.io/user/settings → **Container Registry Settings**
2. Add your Docker Hub username and personal access token (the same PAT used for `docker login`)
3. When creating or editing a template, select the saved credential from the dropdown

> Runpod currently only supports `docker login` type credentials for container registry authentication.

### Key Commands

```bash
# Build for Runpod (always --platform=linux/amd64 — pods run on x86 Linux)
docker build --platform=linux/amd64 -t myorg/myimage:v1.0.0 .
docker build --platform=linux/amd64 -t myorg/myimage:v1.0.0 -f Dockerfile.prod .  # specify Dockerfile

# Tag an existing image before pushing (does not duplicate image data)
docker tag myorg/myimage:v1.0.0 myorg/myimage:v1.0.1

# Push to Docker Hub (image becomes available to Runpod as myorg/myimage:v1.0.0)
docker push myorg/myimage:v1.0.0

# Run locally for validation
docker run --rm -it myorg/myimage:v1.0.0 bash
docker run --rm --gpus all myorg/myimage:v1.0.0 bash   # with GPU (requires nvidia-container-toolkit)
docker run --rm -p 8080:80 -e API_KEY=secret myorg/myimage:v1.0.0  # port mapping + env vars

# Debug a running container
docker exec -it CONTAINER_ID /bin/bash

# Inspect
docker images                          # list local images
docker ps -a                           # list all containers (including stopped)
docker logs CONTAINER_ID             # view container output
docker logs -f CONTAINER_ID          # follow logs in real time

# Cleanup
docker rmi myorg/myimage:v1.0.0        # remove an image
docker rm CONTAINER_ID               # remove a stopped container
```

---

## AWS CLI

The AWS CLI is used to access Runpod storage over the S3 protocol. Any Runpod product that can mount a Network Volume — pods, clusters, and serverless endpoints — can have its storage accessed this way. The bucket name is the network volume ID.

### Install

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip && sudo ./aws/install
```

### Credentials

Runpod uses its own S3-compatible API, not AWS. You need a Runpod user ID and S3 API key — not an AWS account.

- **Access key** (`AWS_ACCESS_KEY_ID`): your Runpod user ID — found in the console under Settings > S3 API Keys, in the key description (format: `user_...`)
- **Secret key** (`AWS_SECRET_ACCESS_KEY`): an S3 API key — generate one at Settings > S3 API Keys > Create. Shown only once; save it immediately (format: `rps_...`)

```bash
# Option 1: interactive configure (writes ~/.aws/credentials and ~/.aws/config)
# When prompted: enter user ID as access key, S3 API key as secret.
# Press Enter to skip region and output format — region is always passed per-command, not stored in config.
aws configure

aws configure list    # verify stored credentials

# Option 2: environment variables (override config files)
export AWS_ACCESS_KEY_ID=user_...
export AWS_SECRET_ACCESS_KEY=rps_...

# To stop using env vars and fall back to config file:
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
```

### Region and Endpoint

The `--region` flag on every command is the Runpod datacenter ID where the network volume lives — not an AWS region. The `--endpoint-url` is derived from the same datacenter ID.

Every command requires both flags:
```
--region DATACENTER --endpoint-url https://s3api-DATACENTER.runpod.io/
```

**Tip:** Each network volume on the storage page at https://console.runpod.io/user/storage/ shows a pre-filled example `aws s3 ls` command with the correct `--region` and `--endpoint-url` already substituted. Use this to confirm the exact values for a given volume.

Datacenter IDs by region:

| Region | Datacenter IDs |
|--------|---------------|
| EU | CZ-1, RO-1, IS-1, NO-1 |
| US | CA-2, GA-2, IL-1, KS-2, MD-1, MO-1, MO-2, NC-1, NC-2, NE-1, WA-1 |

### Key Commands

Replace `DATACENTER` with the datacenter ID of your network volume (e.g. `CA-2`) and `NETWORK_VOLUME_ID` with the volume ID (used as the S3 bucket name).

```bash
# List files in a volume
aws s3 ls \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/

# List a subdirectory
aws s3 ls \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/my-folder/

# Upload a file
aws s3 cp local-file.txt \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/

# Download a file
aws s3 cp \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/remote-file.txt ./

# Delete a file
aws s3 rm \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/remote-file.txt

# Sync a local directory to a volume
aws s3 sync local-dir/ \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  s3://NETWORK_VOLUME_ID/remote-dir/
```

Path mapping: `/workspace/my-folder/file.txt` on a pod = `s3://NETWORK_VOLUME_ID/my-folder/file.txt` via S3.

### Troubleshooting

```bash
# Retry on timeout (large transfers)
export AWS_RETRY_MODE=standard
export AWS_MAX_ATTEMPTS=10

# Extend read timeout for large files (seconds)
aws s3 cp large-file.zip \
  --region DATACENTER \
  --endpoint-url https://s3api-DATACENTER.runpod.io/ \
  --cli-read-timeout 7200 \
  s3://NETWORK_VOLUME_ID/
```
