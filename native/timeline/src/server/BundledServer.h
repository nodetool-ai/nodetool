#pragma once

// Starts the NodeTool server that a "with server" package ships inside the
// app (scripts/stage-server.sh). The backend directory holds server.mjs,
// node_modules and the Node binary in runtime/node (runtime/node.exe on
// Windows). It is Contents/Resources/backend on macOS, backend next to the
// executable on Windows, and usr/share/nodetool-timeline/backend in the
// Linux AppImage. NT_BUNDLED_BACKEND_DIR names another backend directory
// for a development run.
//
// The server listens on a free loopback port. Its output goes to server.log
// in the app's local data folder. The process that starts it owns it. Other
// app processes opened from that process (Open timeline, Recent, an imported
// Premiere sequence) inherit its URL and join it: each holds a lock file in
// the folder that NT_BUNDLED_SERVER_USERS names. When the owner quits, it
// first saves, then hides its windows and waits until no other process
// holds a lock, then stops the server. So a window opened from the owner
// keeps its server after the owner's window closes, and the AppImage mount
// that holds the server stays mounted while the server runs.

#include <QString>
#include <QStringList>
#include <QUrl>

namespace nt::server {

// Returns the URL of the started server. Returns an empty URL when the app
// has no bundled backend, when NODETOOL_SERVER_URL is set, or on failure,
// which writes the reason to `error`. A started server sets
// NODETOOL_SERVER_URL, NT_BUNDLED_SERVER_URL and NT_BUNDLED_SERVER_USERS in
// this process's environment, so every app process it starts inherits them.
QUrl startBundledServer(QString* error);

// Stops the server this process started, once no window it opened still
// uses it. Call after the last save: the save needs the server.
void stopBundledServer();

// For a process started by the owner of a bundled server: holds this
// process's lock in NT_BUNDLED_SERVER_USERS until the process exits, so the
// owner keeps the server running. Does nothing in any other process.
void joinBundledServer();

// The URL of the bundled server this process started or joined, or empty.
QUrl bundledServerUrl();

// Call right before starting another app process that will use this
// process's bundled server. If this process then quits before the new one
// has joined, the owner waits for it (up to 30 s) instead of stopping the
// server under it.
void noteBundledServerHandoff();

// The program to start for another app window: the AppImage itself when
// the app runs from one, so the new window does not depend on this
// process's AppImage mount, else this executable.
QString appRelaunchProgram();

}  // namespace nt::server
