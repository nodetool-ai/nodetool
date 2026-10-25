#pragma once

// The command-line side of a server open:
//
//   nodetool-timeline --server http://127.0.0.1:7777 --timeline <id>
//                     [--cache-dir DIR] [--token TOKEN] [--loader-report FILE]
//                     [any fixture mode: --dump-plan, --stills, --probe-media, ...]
//   nodetool-timeline --server URL --list-timelines
//
// `takeServerArgs` runs first in main(), before any QCommandLineParser. It
// removes these options from argv and puts a source label in their place as
// the positional fixture argument, so every mode keeps its own parser.
// `loadTimelineSource` then loads that label from the server, and any other
// argument from its file. The token can also come from NODETOOL_API_TOKEN,
// the cache folder from NODETOOL_TIMELINE_CACHE_DIR.
//
// A server open prints a summary line of the loader report to stderr and
// writes the full report to --loader-report, or next to the raw document in
// the cache (`<id>.report.json`).

#include "model/TimelineJson.h"
#include "server/AutosaveController.h"

#include <QString>

#include <optional>

namespace nt::server {

// Returns 0 to go on, or the exit code for main() on a usage error.
int takeServerArgs(int& argc, char** argv);
bool listTimelinesRequested();
// The --list-timelines mode; needs a Q*Application.
int listTimelinesMain();

ParseResult loadTimelineSource(const QString& source);

// Where a save of the server timeline goes, when the source is a server
// (`--server ... --timeline ...`); nullopt for a fixture file.
std::optional<SaveTarget> serverSaveTarget();

}  // namespace nt::server
