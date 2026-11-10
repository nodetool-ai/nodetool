#pragma once

// Starts the NodeTool server that a test package ships inside the app
// (scripts/package-macos-with-server.sh). The package holds the bundled
// backend in Contents/Resources/backend: server.mjs, node_modules and the
// Node binary in runtime/node. NT_BUNDLED_BACKEND_DIR names another backend
// directory for a development run.
//
// The server listens on a free loopback port. It runs as long as the app
// and stops when the app quits. Its output goes to server.log in the app's
// local data folder.
//
// A copy of native/timeline/src/server/BundledServer.h.
//
// Thread affinity: UI thread only. The server process is parented to the
// QCoreApplication.

#include <QString>
#include <QUrl>

namespace nodetool::node_editor {

// Returns the URL of the started server. Returns an empty URL when the app
// has no bundled backend, when NODETOOL_SERVER_URL is set, or on failure,
// which writes the reason to `error`.
QUrl startBundledServer(QString* error);

// What an editor start reads to pick its server.
struct ServerStartOptions {
  QUrl given;             // --server
  bool offline = false;   // --offline
  bool headless = false;  // --screenshot, --dump, --save or --replay
  bool restored = false;  // the session already has a server URL
};

// The server the editor connects to, or an empty URL for none. --server
// wins. An interactive start without --offline and without a restored
// server uses the bundled server, through `bundled`, and else the local
// server on port 7777.
template <typename StartBundled>
QUrl chooseServer(const ServerStartOptions& options, StartBundled&& bundled) {
  if (!options.given.isEmpty()) return options.given;
  if (options.headless || options.offline || options.restored) return {};
  if (QUrl url = bundled(); !url.isEmpty()) return url;
  return QUrl(QStringLiteral("http://localhost:7777"));
}

}  // namespace nodetool::node_editor
