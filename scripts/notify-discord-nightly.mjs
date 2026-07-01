#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.log("DISCORD_WEBHOOK_URL not set; skipping Discord notification.");
  process.exit(0);
}

const tag = arg("tag");
const releaseName = arg("release-name");
const repo = arg("repo") ?? "nodetool-ai/nodetool";
if (!tag) throw new Error("--tag is required");
if (!releaseName) throw new Error("--release-name is required");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function previousNightlyTag(currentTag) {
  const tags = git(["tag", "--list", "v*-nightly.*", "--sort=-creatordate"])
    .split("\n")
    .filter(Boolean)
    .filter((t) => t !== currentTag);
  return tags[0];
}

const previousTag = previousNightlyTag(tag);
let changeLog;
if (previousTag) {
  changeLog = git(["log", "--pretty=format:- %s (%h)", `${previousTag}..HEAD`]);
} else {
  changeLog = git(["log", "--pretty=format:- %s (%h)", "-n", "20"]);
}
if (!changeLog) changeLog = "- No changes recorded.";

const MAX_CHANGELOG_LENGTH = 1500;
if (changeLog.length > MAX_CHANGELOG_LENGTH) {
  changeLog = `${changeLog.slice(0, MAX_CHANGELOG_LENGTH)}\n- ...`;
}

const releaseUrl = `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;

const payload = {
  embeds: [
    {
      title: releaseName,
      url: releaseUrl,
      description: `**Changes since ${previousTag ?? "the last 20 commits"}:**\n${changeLog}`,
      color: 0x5865f2,
    },
  ],
};

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Discord webhook returned ${response.status}: ${body}`);
}

console.log(`Posted nightly summary to Discord for ${tag}`);
