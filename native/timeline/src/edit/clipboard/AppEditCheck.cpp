#include "app/CliModes.h"
#include "app/EditRegistry.h"

#include <QCoreApplication>
#include <QStringList>
#include <cstdio>

namespace {
int checkStructureEdits(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    const QStringList names{
        "copy", "cut", "paste", "pasteInsert", "pasteClipAttributes", "pasteAttributes",
        "duplicateSelected", "duplicate", "duplicateWithGap", "altDragCopy", "closeGapAt",
        "groupClips", "ungroupClips", "moveClip", "moveSelectedClips", "nudge",
        "trimClipStart", "trimClipEnd", "rippleTrimClipStart", "rippleTrimClipEnd",
        "rollClipEdge", "deleteSelected", "rippleDeleteSelected"};
    bool missing = false;
    for (const auto &name : names) {
        if (!nt::app::findEdit(name)) {
            std::fprintf(stderr, "Missing app edit: %s\n", qPrintable(name));
            missing = true;
        } else {
            std::printf("App edit: %s\n", qPrintable(name));
        }
    }
    if (missing) {
        return 1;
    }
    std::printf("All %lld clipboard and group edits are linked into nodetool-timeline\n",
                static_cast<long long>(names.size()));
    return 0;
}

const bool registered = nt::app::registerCliMode(
    {"--check-structure-edits", checkStructureEdits, nt::app::CliStage::BeforeServerArgs});
} // namespace
