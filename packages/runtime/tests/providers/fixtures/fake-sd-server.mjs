#!/usr/bin/env node
// A stand-in for stable-diffusion.cpp's sd-server: it serves the /sdcpp/v1
// job API and appends its argv and each request body to $FAKE_SD_LOG.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--listen-port") + 1]);
const log = (entry) => appendFileSync(process.env.FAKE_SD_LOG, `${JSON.stringify(entry)}\n`);
log({ argv: args });

// A 1x1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/sdcpp/v1/capabilities") {
      res.end("{}");
    } else if (req.url === "/sdcpp/v1/img_gen") {
      log({ request: JSON.parse(body) });
      res.end(JSON.stringify({ id: "job1" }));
    } else if (req.url === "/sdcpp/v1/jobs/job1") {
      res.end(JSON.stringify({ status: "completed", result: { output_format: "png", images: [{ b64_json: PNG }] } }));
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
}).listen(port, "127.0.0.1");
