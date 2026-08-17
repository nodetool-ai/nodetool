export const SDK_AUTH_V1_FLAG = "NODETOOL_REQUIRE_SDK_AUTH_V1";
export const SDK_WORKFLOW_INTERFACE_V1_DISABLE_FLAG =
  "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1";
export const SDK_LIFECYCLE_V1_DISABLE_FLAG =
  "NODETOOL_DISABLE_SDK_LIFECYCLE_V1";

function exactOptIn(environment: NodeJS.ProcessEnv, flag: string): boolean {
  return environment[flag] === "1";
}

function enabledUnlessDisabled(
  environment: NodeJS.ProcessEnv,
  disableFlag: string
): boolean {
  return environment[disableFlag] !== "1";
}

export function isSdkWorkflowInterfaceV1Enabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return enabledUnlessDisabled(
    environment,
    SDK_WORKFLOW_INTERFACE_V1_DISABLE_FLAG
  );
}

export function isSdkV1AuthenticationEnabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return exactOptIn(environment, SDK_AUTH_V1_FLAG);
}

export function isSdkLifecycleV1Enabled(
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return enabledUnlessDisabled(environment, SDK_LIFECYCLE_V1_DISABLE_FLAG);
}

interface SdkFeatureFlagSnapshot {
  workflowInterfaceV1: boolean;
  authenticationV1: boolean;
  lifecycleV1: boolean;
}

/**
 * Central inventory of SDK flags and their exact opt-in defaults. New SDK
 * flags must be added here so the disabled-state baseline remains complete.
 */
export function getSdkFeatureFlagSnapshot(
  environment: NodeJS.ProcessEnv = process.env
): SdkFeatureFlagSnapshot {
  return {
    workflowInterfaceV1: isSdkWorkflowInterfaceV1Enabled(environment),
    authenticationV1: isSdkV1AuthenticationEnabled(environment),
    lifecycleV1: isSdkLifecycleV1Enabled(environment)
  };
}
