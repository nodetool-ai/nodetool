/**
 * @nodetool-ai/docker — minimal typed Docker Engine API client.
 *
 * Talks to the daemon over the local socket, HTTP(S), or SSH according to
 * DOCKER_HOST. Covers the surface NodeTool's code runners and sandbox provider
 * use; nothing more.
 */

export {
  DockerClient,
  DockerError,
  buildPath,
  parseDaemonErrorMessage,
  splitImageReference,
  type DockerClientOptions
} from "./client.js";

export {
  resolveDockerEndpoint,
  type DockerEndpoint,
  type DockerEnvironment,
  type DockerProtocol
} from "./endpoint.js";

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
