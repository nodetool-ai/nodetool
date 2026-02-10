# Flathub Publishing Specification - Phase 2

This document defines the requirements and implementation plan for publishing NodeTool to Flathub, building on the Phase 1 build-only infrastructure.

## Status: Planning Phase

**Phase 1** (Complete): Independent CI build workflow  
**Phase 2** (This Document): Flathub submission and publishing

---

## Prerequisites

Before Phase 2 can begin, the following must be in place:

✅ Phase 1 Flatpak CI workflow operational  
✅ Reproducible builds in CI  
✅ Manifest validated and stable  
✅ Desktop integration files complete  
⬜ Release cadence established (stable vs. beta)  
⬜ Maintainer team identified  
⬜ GPG signing infrastructure ready

---

## Publishing Architecture

### Repository Structure

```
flathub/ai.nodetool.NodeTool (new repository)
├── ai.nodetool.NodeTool.yml              # Manifest (based on current)
├── ai.nodetool.NodeTool.appdata.xml      # Copy from metainfo
├── flathub.json                 # Flathub metadata
├── patches/                     # Any required patches
└── README.md                    # Flathub-specific docs
```

### Source Management

**Current**: Builds from `type: dir` (local checkout)  
**Flathub**: Must build from release tarballs

```yaml
sources:
  - type: archive
    url: https://github.com/nodetool-ai/nodetool/archive/refs/tags/v0.6.3.tar.gz
    sha256: <computed-hash>
```

**Requirements**:
- Source must be from tagged releases
- SHA256 checksums must be provided
- All sources must be publicly accessible
- No git submodules (or include them in tarball)

### Build Isolation

**Flathub builds**:
- Run in clean containers
- No network access during build (except for declared sources)
- All dependencies must be in manifest
- Build must be reproducible

**Changes required**:
- Pre-download npm dependencies
- Include them in manifest sources
- Use `npm ci --offline`

---

## Manifest Changes for Flathub

### 1. Source Modifications

```yaml
modules:
  - name: nodetool
    sources:
      # Main source tarball
      - type: archive
        url: https://github.com/nodetool-ai/nodetool/archive/refs/tags/v${VERSION}.tar.gz
        sha256: ${SHA256_HASH}
      
      # Web dependencies
      - type: archive
        url: https://github.com/nodetool-ai/nodetool/releases/download/v${VERSION}/web-node_modules.tar.gz
        sha256: ${WEB_DEPS_SHA256}
        dest: web/node_modules
      
      # Electron dependencies
      - type: archive
        url: https://github.com/nodetool-ai/nodetool/releases/download/v${VERSION}/electron-node_modules.tar.gz
        sha256: ${ELECTRON_DEPS_SHA256}
        dest: electron/node_modules
```

### 2. Build Commands Update

```yaml
build-commands:
  # No npm install - dependencies are pre-bundled
  - cd web && npm run build
  - cd electron && npm run download-micromamba
  - cd electron && npm run vite:build
  - cd electron && npx tsc
  # ... rest of installation
```

### 3. Metadata Enhancement

Update `ai.nodetool.NodeTool.metainfo.xml`:
- Add OARS content rating details
- Add more screenshot URLs
- Include update contact information
- Add developer information

---

## Signing Infrastructure

### GPG Key Generation

```bash
# Generate key for Flathub signing
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, no expiration
# Real name: Nodetool CI
# Email: ci@nodetool.ai

# Export public key
gpg --armor --export ci@nodetool.ai > flathub-signing-key.asc

# Export private key (store in GitHub Secrets)
gpg --armor --export-secret-key ci@nodetool.ai > flathub-signing-key.private.asc
```

### GitHub Secrets

Add to repository secrets:
- `FLATHUB_GPG_PRIVATE_KEY`: Private key for signing
- `FLATHUB_GPG_PASSPHRASE`: Key passphrase
- `FLATHUB_REPO_TOKEN`: GitHub token with write access to Flathub repo

### Signing in CI

```yaml
- name: Import GPG key
  run: |
    echo "${{ secrets.FLATHUB_GPG_PRIVATE_KEY }}" | gpg --import
    echo "${{ secrets.FLATHUB_GPG_PASSPHRASE }}" | gpg --passphrase-fd 0 --batch --yes

- name: Sign Flatpak repository
  run: |
    flatpak build-sign \
      --gpg-sign=ci@nodetool.ai \
      flatpak-repo
```

---

## Flathub Submission Process

### Step 1: Create Flathub Repository

1. Fork https://github.com/flathub/flathub
2. Create pull request to add `ai.nodetool.NodeTool` to the list
3. Wait for approval and repository creation
4. Repository will be at: https://github.com/flathub/ai.nodetool.NodeTool

### Step 2: Initial Submission

1. Clone the new repository:
   ```bash
   git clone https://github.com/flathub/ai.nodetool.NodeTool.git
   ```

2. Copy and adapt manifest:
   ```bash
   cp electron/ai.nodetool.NodeTool.flatpak.yml ai.nodetool.NodeTool/ai.nodetool.NodeTool.yml
   # Modify for Flathub (use release tarballs)
   ```

3. Add Flathub metadata:
   ```bash
   cat > flathub.json << EOF
   {
     "only-arches": ["x86_64"],
     "skip-appstream-check": false
   }
   EOF
   ```

4. Test build locally:
   ```bash
   flatpak-builder --user --install --force-clean build ai.nodetool.NodeTool.yml
   flatpak run ai.nodetool.NodeTool
   ```

5. Submit pull request to `flathub/ai.nodetool.NodeTool`

### Step 3: Review Process

**Flathub reviewers will check**:
- Manifest correctness
- AppStream metadata validity
- Permission justification
- Build reproducibility
- Icon quality and format
- Desktop file compliance

**Common feedback**:
- Reduce permissions to minimum necessary
- Add comments explaining each permission
- Improve AppStream descriptions
- Fix icon formats or sizes
- Update outdated runtime versions

**Response process**:
- Address all reviewer feedback
- Update manifest and metadata
- Push changes to PR
- Request re-review

### Step 4: Approval and Publication

Once approved:
- PR is merged to `flathub/ai.nodetool.NodeTool`
- Flathub buildbot automatically builds
- App appears on Flathub within 24-48 hours
- Users can install via: `flatpak install flathub ai.nodetool.NodeTool`

---

## Automation Workflow

### Publishing Workflow (New)

```yaml
name: Publish to Flathub

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish'
        required: true

jobs:
  publish-to-flathub:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Prepare dependencies archives
        run: |
          # Create node_modules archives for Flathub
          cd web && npm ci
          tar czf ../web-node_modules.tar.gz node_modules/
          
          cd ../electron && npm ci
          tar czf ../electron-node_modules.tar.gz node_modules/
      
      - name: Upload to release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            web-node_modules.tar.gz
            electron-node_modules.tar.gz
      
      - name: Update Flathub manifest
        run: |
          # Clone Flathub repo
          git clone https://github.com/flathub/ai.nodetool.NodeTool.git flathub-repo
          cd flathub-repo
          
          # Update version and checksums
          VERSION=${{ github.event.release.tag_name }}
          ./update-manifest.sh $VERSION
          
          # Commit and push
          git commit -am "Update to $VERSION"
          git push
      
      - name: Trigger Flathub build
        run: |
          # Flathub buildbot detects changes automatically
          echo "Manifest updated, buildbot will pick up changes"
```

---

## Update Mechanism

### Flatpak Update Flow

Users get updates via:
```bash
flatpak update ai.nodetool.NodeTool
```

Flathub checks for:
1. New commits to `flathub/ai.nodetool.NodeTool`
2. Manifest changes
3. Rebuilds automatically
4. Publishes to repository

### Version Management

**Stable channel**: Main branch of `flathub/ai.nodetool.NodeTool`
- Only release tags
- Follows semantic versioning
- Conservative update cadence

**Beta channel** (future):
- Separate branch `beta`
- Pre-release versions
- Faster update cadence

### Release Cadence

Recommended approach:
- **Stable**: Tag-based releases only (v0.6.x, v0.7.x)
- **Beta**: RC releases (v0.6.3-rc.19)
- **Manual override**: Via workflow_dispatch for hotfixes

---

## Permission Justification

For Flathub submission, each permission must be justified:

### Network Access (`--share=network`)
**Required for**:
- API calls to OpenAI, Anthropic, Gemini, etc.
- Model downloads from HuggingFace
- Backend server communication
- WebSocket connections for workflow execution

### Filesystem Access (`--filesystem=home`)
**Required for**:
- Loading and saving workflow files
- Accessing user project directories
- Storing generated assets
- Reading/writing configuration

**Alternative**: Use XDG portals (more restrictive)
```yaml
- --filesystem=xdg-documents
- --filesystem=xdg-download
```

### Device Access (`--device=all`)
**Required for**:
- Microphone: Audio recording nodes
- Camera: Video recording nodes
- GPU: AI model inference (`--device=dri` alone is insufficient)

**Recommendation**: Split into separate permissions
```yaml
- --device=dri         # GPU only
- --device=input       # Mouse/keyboard
# Request mic/camera via portals
```

### Audio (`--socket=pulseaudio`)
**Required for**:
- Audio playback nodes
- Audio recording features
- Real-time audio processing

---

## Testing Before Submission

### Local Testing Checklist

```bash
# 1. Build from manifest
flatpak-builder --user --force-clean build ai.nodetool.NodeTool.yml

# 2. Install and run
flatpak-builder --user --install build ai.nodetool.NodeTool.yml
flatpak run ai.nodetool.NodeTool

# 3. Test functionality
# - Create a workflow
# - Save/load files
# - Test network access
# - Test GPU acceleration
# - Test audio/video

# 4. Validate metadata
appstreamcli validate ai.nodetool.NodeTool.metainfo.xml
desktop-file-validate ai.nodetool.NodeTool.desktop

# 5. Check icons
for size in 16 24 32 48 64 128 256 512; do
  test -f linux_icons/icon_${size}x${size}.png || echo "Missing: $size"
done
```

### Automated Testing

Add to CI:
```yaml
- name: Test Flatpak installation
  run: |
    flatpak-builder --user --install build ai.nodetool.NodeTool.yml
    flatpak run --command=sh ai.nodetool.NodeTool -c "ls /app/nodetool"
```

---

## Monitoring and Maintenance

### Flathub Dashboard

Monitor at: https://flathub.org/apps/details/ai.nodetool.NodeTool

Metrics:
- Install counts
- Update stats
- Build success/failure
- User reviews

### Update Responsibilities

**On each release**:
- [ ] Update manifest version
- [ ] Update source URLs and SHA256
- [ ] Update dependency archives
- [ ] Test build locally
- [ ] Submit PR to Flathub
- [ ] Monitor build status
- [ ] Respond to user feedback

**Maintenance**:
- Keep runtime version up to date
- Update base app when available
- Address CVEs in dependencies
- Respond to Flathub policy changes

---

## Success Criteria

Phase 2 is complete when:

✅ App is published on Flathub  
✅ Users can install via `flatpak install flathub ai.nodetool.NodeTool`  
✅ Automatic updates work  
✅ GPG signing is operational  
✅ Build automation is in place  
✅ Documentation is updated  
✅ Team is trained on update process

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| GPG key setup | 1 day | None |
| Dependency archive automation | 2-3 days | Release workflow |
| Manifest adaptation | 2-3 days | None |
| Local testing | 2 days | None |
| Flathub submission | 1-2 weeks | Flathub review |
| Automation workflow | 2-3 days | Flathub approval |
| Documentation | 1 day | None |

**Total**: 4-6 weeks from start to full automation

---

## References

- [Flathub Submission Guidelines](https://docs.flathub.org/docs/for-app-authors/submission/)
- [Flatpak Manifest Reference](https://docs.flatpak.org/en/latest/manifests.html)
- [AppStream Metadata](https://www.freedesktop.org/software/appstream/docs/)
- [Electron BaseApp Documentation](https://github.com/flathub/org.electronjs.Electron2.BaseApp)

---

## Contact

Questions about Phase 2 implementation:
- Technical: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- Flathub: [Flathub Matrix channel](https://matrix.to/#/#flathub:matrix.org)
