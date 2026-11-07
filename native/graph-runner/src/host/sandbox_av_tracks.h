#pragma once
#include "host/media.h"
namespace gr::host {
// The Code addAudio helper retains original tracks when explicitly requested.
void installSandboxAvTracks(js::Engine &, const js::Value &,
                            const HostOptions &, const MediaOptions &);
} // namespace gr::host
