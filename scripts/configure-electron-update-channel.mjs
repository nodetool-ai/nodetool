#!/usr/bin/env node
import fs from "node:fs";

const version = process.argv[2] ?? process.env.VERSION ?? "";
const configPath = "electron/electron-builder.json";
const isNightly = /-nightly\.\d{8}\.\d+$/.test(version);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const publish = Array.isArray(config.publish) ? config.publish : [];
config.publish = publish.map((entry) => {
  if (!entry || entry.provider !== "github") return entry;
  const next = { ...entry };
  if (isNightly) {
    next.channel = "nightly";
    next.releaseType = "prerelease";
  } else {
    delete next.channel;
    next.releaseType = "release";
  }
  return next;
});
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Configured Electron updater channel: ${isNightly ? "nightly" : "latest"}`);
