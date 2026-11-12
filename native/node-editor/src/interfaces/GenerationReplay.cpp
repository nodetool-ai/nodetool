#include "GenerationReplay.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

GenerationReplay::GenerationReplay(QObject *parent) : QObject(parent) {}

GenerationReplay::~GenerationReplay() = default;

void GenerationReplay::setGenerationHistory(QObject *history) {
    if (generationHistory_ == history) { return; }
    generationHistory_ = history;
    emit generationHistoryChanged();
}

void GenerationReplay::setSelection(const QString &selection) {
    if (assign(selection_, selection)) { emit selectionChanged(); }
}

void GenerationReplay::setPinnedGeneration(const QString &id) {
    if (assign(pinnedGeneration_, id)) { emit pinnedGenerationChanged(); }
}

void GenerationReplay::setReplayGenerations(const QStringList &ids) {
    if (assign(replayGenerations_, ids)) { emit replayGenerationsChanged(); }
}

void GenerationReplay::setReadOnly(bool readOnly) {
    if (assign(readOnly_, readOnly)) { emit readOnlyChanged(); }
}

}  // namespace nodetool::node_editor
