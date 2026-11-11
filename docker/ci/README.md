# CI image

The Linux image the Node and TypeScript jobs in `.github/workflows/` run in.
It carries every system package those jobs need, so no job runs `apt-get` or
`playwright install --with-deps`. The browsers themselves still download per
job (`npx playwright install chromium`), so they match the job's lockfile.

## How a job gets the image

The tag is a hash of this directory:
`ghcr.io/nodetool-ai/nodetool-ci:<first 16 hex of hashFiles('docker/ci/**')>`.
Each workflow that uses the image starts with a `ci-image` job that calls
[`ci-image.yml`](../../.github/workflows/ci-image.yml). It computes the tag and
checks GHCR. When the image is missing, which happens on the first run after
this directory changes, it builds and pushes it. Then the jobs run in it:

```yaml
needs: ci-image
container:
  image: ${{ needs.ci-image.outputs.image }}
  options: --init --user 1001   # add --privileged for sandboxed Chromium
```

The `ci-image` job needs `packages: write`. The jobs that pull the image need
`packages: read`. A pull request from a fork cannot push, so a fork that
changes this directory fails until a maintainer runs the CI image workflow
for the same content.

## Container options

- `--init` runs an init process as PID 1. Without it PID 1 is the runner's
  `tail -f /dev/null`, which never reaps orphaned processes, so a test that
  waits for a detached child to exit sees a zombie that never goes away.
- `--user 1001` runs steps as the hosted runner's user, which owns the mounted
  workspace, tool cache and home. Chromium refuses its sandbox as root.
  Passwordless `sudo` works as it does on the runner.
- `--privileged` is needed only by jobs that launch Chromium with
  `chromiumSandbox: true` (the game and 3D capture suites). Docker's seccomp
  profile blocks the user namespace the sandbox needs.
  [`chromium-sandbox`](../../.github/actions/chromium-sandbox/action.yml) also
  lifts Ubuntu's AppArmor user-namespace restriction on the runner VM, and
  sets `CHROME_PATH` to Playwright's Chromium for chrome-launcher, since the
  image has no system Chrome.
- The `volumes` that mount the runner's unused SDKs under `/reclaim` let
  [`setup-build`](../../.github/actions/setup-build/action.yml) free their
  disk space from inside the container.

## Changing the package list

Edit the `Dockerfile` and open a pull request. Its `ci-image` jobs build the
new image, and every job in the pull request runs in it. Keep
`PLAYWRIGHT_VERSION` near the version the workspaces pin, since it selects the
browser libraries `install-deps` installs.

## Jobs that do not use the image

- The scheduled agent and maintenance workflows call `setup-build` on the bare
  runner. They never needed a package beyond the runner image, so they never
  ran apt.
- `docker` in `quality-checks.yml` and `docker.yml` build and run Docker
  images, which needs the runner's own Docker daemon. They install nothing.
- The native C++ workflows (`native-timeline.yml`, `native-timeline-release.yml`,
  `native-ui-primitives.yml`, `vst-host.yml`) and the release jobs in
  `release.yaml` and `publish.yaml` still install their packages with apt on
  the runner.
