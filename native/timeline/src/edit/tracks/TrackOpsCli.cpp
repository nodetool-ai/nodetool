#include "app/EditRegistry.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) {
        return 1;
    }
    QJsonParseError error;
    const auto request = QJsonDocument::fromJson(input.readAll(), &error);
    QJsonObject result;
    const auto action = request.object().value("action").toString();
    const auto edit = nt::app::findEdit(action);
    if (error.error != QJsonParseError::NoError || !request.isObject()) {
        result = {{"error", "Invalid JSON request"}};
    } else if (!edit) {
        result = {{"error", "Unknown track action: " + action}};
    } else {
        result = edit(request.object().value("doc").toObject(), request.object().value("payload").toObject());
    }
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) {
        return 1;
    }
    output.write(QJsonDocument(result).toJson(QJsonDocument::Compact));
    output.write("\n");
}
