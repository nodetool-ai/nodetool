/**
 * Typed subset of the Docker Engine API request/response shapes NodeTool
 * uses. Field names match the wire format (PascalCase JSON), so objects can
 * be serialized as-is. Only the fields our runners and the sandbox provider
 * actually read or write are declared — extend when a new call site needs
 * more.
 */

export interface DockerPortBinding {
  HostIp?: string;
  HostPort?: string;
}

export interface DockerHostConfig {
  Memory?: number;
  NanoCpus?: number;
  NetworkMode?: string;
  Binds?: string[];
  IpcMode?: string;
  CapDrop?: string[];
  SecurityOpt?: string[];
  ReadonlyRootfs?: boolean;
  Tmpfs?: Record<string, string>;
  PortBindings?: Record<string, DockerPortBinding[]>;
}

export interface ContainerCreateOptions {
  Image: string;
  Cmd?: string[];
  Env?: string[];
  Labels?: Record<string, string>;
  WorkingDir?: string;
  User?: string;
  OpenStdin?: boolean;
  Tty?: boolean;
  ExposedPorts?: Record<string, Record<string, never>>;
  HostConfig?: DockerHostConfig;
}

export interface ContainerInspectInfo {
  Id: string;
  State?: {
    Status?: string;
    Running?: boolean;
    ExitCode?: number;
  };
  NetworkSettings?: {
    Ports?: Record<string, DockerPortBinding[] | null>;
  };
}

export interface ContainerWaitResult {
  StatusCode: number;
}

export interface AttachOptions {
  stdout?: boolean;
  stderr?: boolean;
  stdin?: boolean;
}
