#pragma once

// Starts the NodeTool server that a "with server" package ships inside the
// app (scripts/stage-server.sh). The backend directory holds server.mjs,
// node_modules and the Node binary in runtime/node (runtime/node.exe on
// Windows). It is Contents/Resources/backend on macOS, backend next to the
// executable on Windows, and usr/share/nodetool-timeline/backend in the
// Linux AppImage. NT_BUNDLED_BACKEND_DIR names another backend directory
// for a development run.
//
// The server listens on a free loopback port. It runs as long as the app
// and stops when the app quits. Its output goes to server.log in the app's
// local data folder.

#include <QString>
#include <QUrl>

namespace nt::server {

// Returns the URL of the started server. Returns an empty URL when the app
// has no bundled backend, when NODETOOL_SERVER_URL is set, or on failure,
// which writes the reason to `error`.
QUrl startBundledServer(QString* error);

}  // namespace nt::server
