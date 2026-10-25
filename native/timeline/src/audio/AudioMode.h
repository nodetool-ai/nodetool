#pragma once

// The audio output a run uses (src/audio/AppAudio.h), from the parsed
// command line. An explicit --audio wins. Without it only a plain
// interactive launch plays on the system device: a run with any option
// other than the interactive ones below (size, seek, play, decoder choice,
// on-top, and the audio options themselves, --audio-dry-run included) gets "none". The check reads the
// parsed option names, so `--play-stills DIR` and `--play-stills=DIR` are the
// same run.

#include <QCommandLineParser>
#include <QString>

namespace nt::audio {

QString resolveAudioMode(const QCommandLineParser& parser);

}  // namespace nt::audio
