#pragma once
#include <QString>
#include <QStringList>

namespace nodetool::node_editor {

// A node description split as web stores/formatNodeDocumentation.ts splits it:
// the first line is the description, the second the comma-separated tags, and
// the lines after "Use cases:" the use cases. Bulleted use cases keep one entry
// per "-" line. Unbulleted ones join into a single entry.
struct NodeDocumentation {
    QString description;
    QStringList tags;
    QStringList useCases;
};

NodeDocumentation splitNodeDocumentation(const QString &documentation);

}  // namespace nodetool::node_editor
