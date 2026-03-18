import { describe, it, expect } from "vitest";

describe("deploy index exports", () => {
  it("exports all public API", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();

    // deployment-config
    expect(mod.DeploymentType).toBeDefined();
    expect(mod.DeploymentStatus).toBeDefined();
    expect(mod.SSHConfigSchema).toBeDefined();
    expect(mod.imageConfigFullName).toBeDefined();

    // state
    expect(mod.StateManager).toBeDefined();
    expect(mod.createStateSnapshot).toBeDefined();
    expect(mod.restoreStateFromSnapshot).toBeDefined();

    // progress
    expect(mod.ProgressManager).toBeDefined();

    // ssh
    expect(mod.SSHConnection).toBeDefined();
    expect(mod.SSHConnectionError).toBeDefined();
    expect(mod.SSHCommandError).toBeDefined();
    expect(mod.withSSHConnection).toBeDefined();

    // docker
    expect(mod.buildDockerImage).toBeDefined();
    expect(mod.formatImageName).toBeDefined();
    expect(mod.pushToRegistry).toBeDefined();
    expect(mod.checkDockerAuth).toBeDefined();

    // docker-run
    expect(mod.DockerRunGenerator).toBeDefined();
    expect(mod.generateDockerRunCommand).toBeDefined();
    expect(mod.getDockerRunHash).toBeDefined();
    expect(mod.getContainerName).toBeDefined();

    // self-hosted
    expect(mod.DockerDeployer).toBeDefined();
    expect(mod.SSHDeployer).toBeDefined();
    expect(mod.LocalExecutor).toBeDefined();
    expect(mod.safeShellQuote).toBeDefined();
    expect(mod.isLocalhost).toBeDefined();

    // runpod
    expect(mod.RunPodDeployer).toBeDefined();

    // runpod-api
    expect(mod.getRunpodEndpointByName).toBeDefined();
    expect(mod.getRunpodTemplateByName).toBeDefined();
    expect(mod.createOrUpdateRunpodEndpoint).toBeDefined();

    // deploy-to-runpod
    expect(mod.deployToRunpod).toBeDefined();

    // gcp
    expect(mod.GCPDeployer).toBeDefined();

    // google-cloud-run-api
    expect(mod.checkGcloudAuth).toBeDefined();
    expect(mod.ensureGcloudAuth).toBeDefined();
    expect(mod.CloudRunRegion).toBeDefined();

    // deploy-to-gcp
    expect(mod.deployToGcp).toBeDefined();
    expect(mod.sanitizeServiceName).toBeDefined();

    // manager
    expect(mod.DeploymentManager).toBeDefined();

    // deploy
    expect(mod.runLocalDocker).toBeDefined();
    expect(mod.getDockerUsername).toBeDefined();
    expect(mod.printDeploymentSummary).toBeDefined();

    // compose
    expect(mod.ComposeGenerator).toBeDefined();
    expect(mod.generateComposeFile).toBeDefined();

    // configure
    expect(mod.configureDocker).toBeDefined();
    expect(mod.configureSSH).toBeDefined();
    expect(mod.configureLocal).toBeDefined();
    expect(mod.configureRunPod).toBeDefined();
    expect(mod.configureGCP).toBeDefined();

    // auth
    expect(mod.generateSecureToken).toBeDefined();
    expect(mod.getServerAuthToken).toBeDefined();
    expect(mod.verifyServerToken).toBeDefined();
    expect(mod.AuthenticationError).toBeDefined();

    // remote-users
    expect(mod.RemoteUserManager).toBeDefined();

    // api-user-manager
    expect(mod.APIUserManager).toBeDefined();

    // admin-client
    expect(mod.AdminHTTPClient).toBeDefined();

    // admin-operations
    expect(mod.AdminDownloadManager).toBeDefined();
    expect(mod.getHFToken).toBeDefined();

    // admin-routes
    expect(mod.handleDownloadHuggingfaceModel).toBeDefined();
    expect(mod.handleDownloadOllamaModel).toBeDefined();
    expect(mod.handleScanCache).toBeDefined();
    expect(mod.encodeSSE).toBeDefined();
    expect(mod.HttpError).toBeDefined();

    // sync
    expect(mod.extractModels).toBeDefined();

    // workflow-syncer
    expect(mod.WorkflowSyncer).toBeDefined();

    // storage-routes
    expect(mod.validateKey).toBeDefined();
    expect(mod.getFile).toBeDefined();
    expect(mod.putFile).toBeDefined();
    expect(mod.deleteFile).toBeDefined();

    // collection-routes
    expect(mod.handleCollectionIndex).toBeDefined();
  });
});
