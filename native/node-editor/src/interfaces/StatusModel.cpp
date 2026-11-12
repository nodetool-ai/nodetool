#include "StatusModel.h"

#include "interfaces/Assign.h"

namespace nodetool::node_editor {

StatusModel::StatusModel(QObject *parent) : QObject(parent) {}

StatusModel::~StatusModel() = default;

void StatusModel::setStatus(const Status &status) {
    if (assign(status_, status)) { emit statusChanged(); }
}

}  // namespace nodetool::node_editor
