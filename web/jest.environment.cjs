/**
 * jsdom environment that decodes `data:` URLs and fetches nothing else.
 *
 * jsdom's `resources: "usable"` loads every subresource over the network. Unit
 * suites that render preset previews fetched them from Supabase storage on
 * every run. With jsdom's default no-op loader an image never fires `load` or
 * `error`, so code that decodes a `data:` URL through `<img>` and node-canvas
 * waits forever. This loader decodes `data:` URLs, serves loopback hosts so a
 * suite can run its own HTTP server, and rejects every other URL, so a remote
 * image fires `error` without a request.
 *
 * A file with an `@jest-environment jsdom` docblock bypasses this environment
 * and gets jsdom's no-op loader.
 */
const { TestEnvironment } = require("jest-environment-jsdom");
const { ResourceLoader } = require("jsdom");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLocal = (url) => {
  const { protocol, hostname } = new URL(url);
  if (protocol === "data:") {
    return true;
  }
  return (
    (protocol === "http:" || protocol === "https:") &&
    LOOPBACK_HOSTS.has(hostname)
  );
};

class LocalOnlyResourceLoader extends ResourceLoader {
  fetch(url, options) {
    if (isLocal(url)) {
      return super.fetch(url, options);
    }
    const blocked = Promise.reject(
      new Error(`jsdom does not fetch ${url} in unit tests`)
    );
    blocked.abort = () => {};
    return blocked;
  }
}

class LocalResourcesEnvironment extends TestEnvironment {
  constructor(config, context) {
    const { projectConfig } = config;
    super(
      {
        ...config,
        projectConfig: {
          ...projectConfig,
          testEnvironmentOptions: {
            ...projectConfig.testEnvironmentOptions,
            resources: new LocalOnlyResourceLoader()
          }
        }
      },
      context
    );
  }
}

module.exports = LocalResourcesEnvironment;
module.exports.LocalOnlyResourceLoader = LocalOnlyResourceLoader;
