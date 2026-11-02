// The caption edits. The action that reaches the panel is in qml/dock/DockKeyActions.cpp.
#include "app/EditRegistry.h"
#include "transcript/TranscriptDocument.h"

namespace {
const bool registered = [] {
    nt::app::registerEdit("captions.setText", nt::transcript::setCueText);
    nt::app::registerEdit("captions.setTimes", nt::transcript::setCueTimes);
    nt::app::registerEdit("captions.split", nt::transcript::splitCue);
    nt::app::registerEdit("captions.merge", nt::transcript::mergeCue);
    nt::app::registerEdit("captions.delete", nt::transcript::deleteCue);
    nt::app::registerEdit("captions.add", nt::transcript::addCue);
    return true;
}();
}
