#pragma once

// Server sources from command-line options or the startup timeline list:
//
//   nodetool-timeline --server http://127.0.0.1:7777 --timeline <id>
//                     [--cache-dir DIR] [--token TOKEN] [--loader-report FILE]
//                     [any fixture mode: --dump-plan, --stills, --probe-media, ...]
//   nodetool-timeline --server URL --list-timelines
//   nodetool-timeline 'http://host[:port][/path]#timeline=<id>' [mode options]
//
// `takeServerArgs` runs first in main(), before any QCommandLineParser. It
// removes these options from argv and puts a source label in their place as
// the positional fixture argument, so every mode keeps its own parser.
// `loadTimelineSource` loads that label from the server. A positional http(s)
// URL with a host and exactly one non-empty timeline fragment parameter also
// opens from the server and becomes the save target. Other sources load as
// files, including filenames containing '#'. Positional labels use NODETOOL_API_TOKEN
// and the default cache folder, overridable with NODETOOL_TIMELINE_CACHE_DIR.
// Option-based opens use these defaults when --token or --cache-dir is omitted.
// NODETOOL_TIMELINE_EXPECT_INSTANCE limits saves to that server instance (SaveTarget).
//
// A server open prints a summary line of the loader report to stderr and
// writes the full report to --loader-report, or next to the raw document in
// the cache (`<id>.report.json`).

#include "model/TimelineJson.h"
#include "server/AutosaveController.h"

#include <QString>
#include <QUrl>

#include <optional>

namespace nt::server {

// A cloud timeline opens with the account signed in to that server:
//
//   nodetool-timeline --cloud-server https://api.nodetool.ai --cloud-timeline <id>
//                     [--cloud-role owner|editor|viewer] [mode options]
//
// main reads the account's access token and hands it to setCloudToken before
// loadTimelineSource, which reads the timeline and its media from the cloud
// server. serverSaveTarget() is empty for it: the edits go to the local
// drafts and then to the cloud (CloudTimelineSaver), not to timeline.update
// on the server directly.

// Returns 0 to go on, or the exit code for main() on a usage error.
int takeServerArgs(int& argc, char** argv);
bool listTimelinesRequested();
// The --list-timelines mode; needs a Q*Application.
int listTimelinesMain();

ParseResult loadTimelineSource(const QString& source);

struct CloudSource {
    QUrl origin;
    QString timelineId;
    // `owner`, `editor` or `viewer`, from the list the timeline was opened from.
    QString role;
    // The media cache folder.
    QString cacheDir;
};
// The cloud timeline the command line names, or nullopt.
std::optional<CloudSource> cloudTimelineSource();
// The access token the cloud timeline and its media are read with.
void setCloudToken(const QString& token);

// Where a save of the server timeline goes, when the source is a server
// (`--server ... --timeline ...` or a loaded positional server label).
// Returns nullopt for a fixture file.
std::optional<SaveTarget> serverSaveTarget();

}  // namespace nt::server
