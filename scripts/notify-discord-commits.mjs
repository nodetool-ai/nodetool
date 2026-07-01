#!/usr/bin/env node
function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.log("DISCORD_WEBHOOK_URL not set; skipping Discord notification.");
  process.exit(0);
}

const repo = arg("repo") ?? "nodetool-ai/nodetool";
const commitsJson = arg("commits");
if (!commitsJson) throw new Error("--commits is required (JSON array from github.event.commits)");

const commits = JSON.parse(commitsJson);
if (!Array.isArray(commits) || commits.length === 0) {
  console.log("No commits in this push; skipping.");
  process.exit(0);
}

function firstLine(message) {
  return message.split("\n")[0];
}

for (const commit of commits) {
  const shortSha = commit.id.slice(0, 7);
  const url = commit.url ?? `https://github.com/${repo}/commit/${commit.id}`;
  const author = commit.author?.username ?? commit.author?.name ?? "unknown";

  const payload = {
    embeds: [
      {
        title: firstLine(commit.message),
        url,
        description: `\`${shortSha}\` by ${author}`,
        color: 0x2ecc71,
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
    throw new Error(`Discord webhook returned ${response.status} for ${shortSha}: ${body}`);
  }
}

console.log(`Posted ${commits.length} commit(s) to Discord.`);
