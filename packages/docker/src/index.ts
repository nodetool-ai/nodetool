/**
 * @nodetool-ai/docker — minimal typed Docker Engine API client.
 *
 * Talks to the daemon over the unix socket (or DOCKER_HOST) with Node's
 * `http` module. Covers the surface NodeTool's code runners and sandbox
 * provider use; nothing more.
 */

export {
  DockerClient,
  DockerError,
  buildPath,
  parseDaemonErrorMessage,
  splitImageReference,
  type DockerClientOptions
} from "./client.js";

export { resolveDockerEndpoint, type DockerEndpoint } from "./endpoint.js";

export {
  DockerStreamDemuxer,
  demuxDockerStream,
  type DemuxFrame,
  type DemuxSlot
} from "./demux.js";

export type {
  AttachOptions,
  ContainerCreateOptions,
  ContainerInspectInfo,
  ContainerWaitResult,
  DockerHostConfig,
  DockerPortBinding
} from "./types.js";
