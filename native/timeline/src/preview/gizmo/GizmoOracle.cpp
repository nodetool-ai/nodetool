#include "GizmoMath.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) { return 2; }
    QJsonParseError error;
    const auto requests = QJsonDocument::fromJson(input.readAll(), &error);
    if (error.error != QJsonParseError::NoError || !requests.isArray() || requests.array().isEmpty()) { return 2; }
    QJsonArray results;
    for (const auto& request : requests.array()) {
        const auto r = request.toObject();
        const auto at = r.value("atMs");
        results.append(nt::gizmo::transformPatch(r.value("clip").toObject(),
            nt::gizmo::transformOf(QJsonObject{{"transform", r.value("next")}}),
            at.isDouble() ? std::optional<double>(at.toDouble()) : std::nullopt));
    }
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) { return 2; }
    const auto bytes = QJsonDocument(results).toJson(QJsonDocument::Compact);
    return output.write(bytes) == bytes.size() ? 0 : 1;
}
