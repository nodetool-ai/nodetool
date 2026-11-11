// A command line over the remix edits for the web conformance test: each request is
// {op: "remix" | "revert", raw, payload} and each answer is the document after it.
#include "remix/clip/RemixEdit.h"

#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 2) { return 1; }
    QJsonArray output;
    for (const auto& item : QJsonDocument::fromJson(QByteArray(argv[1])).array()) {
        const auto request = item.toObject();
        const auto raw = request.value("raw").toObject();
        const auto payload = request.value("payload").toObject();
        const auto op = request.value("op").toString();
        if (op != "remix" && op != "revert") { return 2; }
        const auto result = op == "remix" ? nt::remix::applyRemix(raw, payload) : nt::remix::revertRemix(raw, payload);
        output.append(QJsonObject{{"raw", result}, {"changed", result != raw}});
    }
    std::printf("%s\n", QJsonDocument(output).toJson(QJsonDocument::Compact).constData());
}
