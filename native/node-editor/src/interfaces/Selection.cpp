#include "Selection.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

Selection::Selection(QObject *parent) : QObject(parent) {}

Selection::~Selection() = default;

void Selection::setSelection(int count, const QVariantMap &info, bool disabled, bool mostlyDisabled) {
    // Bitwise or, so every field is assigned.
    if (assign(count_, count) | assign(info_, info) | assign(disabled_, disabled)
        | assign(mostlyDisabled_, mostlyDisabled)) {
        emit selectionChanged();
    }
}

}  // namespace nodetool::node_editor
