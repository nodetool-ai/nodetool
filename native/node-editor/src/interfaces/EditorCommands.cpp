#include "EditorCommands.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

EditorCommands::EditorCommands(QObject *parent) : QObject(parent) {}

EditorCommands::~EditorCommands() = default;

void EditorCommands::setReadOnly(bool readOnly) {
    if (assign(readOnly_, readOnly)) { emit readOnlyChanged(); }
}

void EditorCommands::setRunning(bool running) {
    if (assign(running_, running)) { emit runningChanged(); }
}

void EditorCommands::setComfyTarget(const QString &label) {
    if (assign(comfyTarget_, label)) { emit comfyTargetChanged(); }
}

}  // namespace nodetool::node_editor
