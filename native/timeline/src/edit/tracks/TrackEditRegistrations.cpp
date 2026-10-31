#include "app/EditRegistry.h"
#include "edit/tracks/TrackEdits.h"

namespace {
const bool add = nt::app::registerEdit("addTrack", nt::tracks::addTrack);
const bool insert = nt::app::registerEdit("insertTrack", nt::tracks::insertTrack);
const bool duplicate = nt::app::registerEdit("duplicateTrack", nt::tracks::duplicateTrack);
const bool remove = nt::app::registerEdit("removeTrack", nt::tracks::removeTrack);
const bool reorder = nt::app::registerEdit("reorderTracks", nt::tracks::reorderTracks);
const bool patches = [] {
    for (const auto& field : {"name", "heightPx", "visible", "locked", "muted", "solo"}) {
        const auto name = QString::fromLatin1(field);
        const auto suffix = name == "heightPx" ? QStringLiteral("Height") : name.first(1).toUpper() + name.sliced(1);
        nt::app::registerEdit("setTrack" + suffix, [name](QJsonObject doc, const QJsonObject& payload) {
            return nt::tracks::patchTrack(std::move(doc), payload, name);
        });
    }
    return true;
}();
}
