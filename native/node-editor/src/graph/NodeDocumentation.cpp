#include "graph/NodeDocumentation.h"

#include <QRegularExpression>

namespace nodetool::node_editor {

NodeDocumentation splitNodeDocumentation(const QString &documentation) {
    NodeDocumentation result;
    QStringList lines;
    for (const auto &line : documentation.split('\n')) {
        lines.append(line.trimmed());
    }
    result.description = lines.value(0);
    if (lines.size() > 1) {
        for (const auto &tag : lines[1].split(',')) {
            const auto trimmed = tag.trimmed();
            if (!trimmed.isEmpty()) {
                result.tags.append(trimmed);
            }
        }
    }
    qsizetype useCasesIndex = -1;
    for (qsizetype i = 0; i < lines.size(); ++i) {
        if (lines[i].startsWith("Use cases:")) {
            useCasesIndex = i;
            break;
        }
    }
    if (useCasesIndex < 0) {
        return result;
    }
    QStringList useCaseLines;
    bool hasBullets = false;
    for (qsizetype i = useCasesIndex + 1; i < lines.size(); ++i) {
        if (lines[i].isEmpty()) {
            continue;
        }
        useCaseLines.append(lines[i]);
        hasBullets = hasBullets || lines[i].startsWith('-');
    }
    if (!hasBullets) {
        const auto joined = useCaseLines.join(' ');
        if (!joined.isEmpty()) {
            result.useCases.append(joined);
        }
        return result;
    }
    static const QRegularExpression bullet("^-\\s*");
    for (auto line : useCaseLines) {
        if (line.startsWith('-')) {
            result.useCases.append(line.remove(bullet).trimmed());
        }
    }
    return result;
}

}  // namespace nodetool::node_editor
