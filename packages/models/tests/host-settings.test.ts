import { describe, expect, it } from "vitest";
import { settingCatalog } from "@nodetool-ai/config";
import { CLOUD_HIDDEN_SETTING_GROUPS } from "@nodetool-ai/protocol";
import {
  hostSettingsRefusalMessage,
  refusedHostSettingKeys,
  userSettingCatalog
} from "../src/host-settings.js";

const CLOUD = { NODETOOL_NODE_PROFILE: "cloud" };
const FULL = { NODETOOL_NODE_PROFILE: "full", NODETOOL_ENV: "production" };

describe("host settings", () => {
  it("refuses host-group keys on the cloud profile", () => {
    expect(
      refusedHostSettingKeys(
        ["CLAUDE_CLI_PATH", "PROJECTS_DIR", "AUTOSAVE_ENABLED", "OPENAI_API_KEY"],
        CLOUD
      )
    ).toEqual(["CLAUDE_CLI_PATH", "PROJECTS_DIR"]);
  });

  it("treats production with no profile as the cloud profile", () => {
    expect(
      refusedHostSettingKeys(["OLLAMA_API_URL"], { NODETOOL_ENV: "production" })
    ).toEqual(["OLLAMA_API_URL"]);
  });

  it("never refuses a key the catalog does not declare", () => {
    expect(refusedHostSettingKeys(["MY_SERVICE_TOKEN"], CLOUD)).toEqual([]);
  });

  it("refuses nothing off the cloud profile", () => {
    expect(refusedHostSettingKeys(["CLAUDE_CLI_PATH"], FULL)).toEqual([]);
    expect(refusedHostSettingKeys(["CLAUDE_CLI_PATH"], {})).toEqual([]);
  });

  it("hides every host group from the cloud catalog and keeps the rest", () => {
    const cloud = userSettingCatalog(CLOUD);
    expect(cloud.some((d) => CLOUD_HIDDEN_SETTING_GROUPS.includes(d.group))).toBe(
      false
    );
    expect(cloud.map((d) => d.envVar)).toContain("AUTOSAVE_ENABLED");
    expect(userSettingCatalog(FULL)).toHaveLength(settingCatalog().length);
  });

  it("names the refused keys", () => {
    expect(hostSettingsRefusalMessage(["A", "B"])).toContain("A, B");
  });
});
