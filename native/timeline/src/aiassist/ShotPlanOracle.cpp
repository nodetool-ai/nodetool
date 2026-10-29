#include "aiassist/ShotPlan.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly)) { return 2; }
    const auto data = QJsonDocument::fromJson(input.readAll()).object();
    const auto library = data.contains("assets") ? nt::aiassist::shotEntityLibrary(data.value("assets").toArray()) : data.value("entities").toArray();
    const auto plan = nt::aiassist::planShotRender(data.value("board").toObject(), data.value("shotId").toString(), data.value("kind").toString(), data.value("model").toObject(), library);
    QFile output;
    if (!output.open(stdout, QIODevice::WriteOnly)) { return 2; }
    const auto bytes = QJsonDocument(QJsonObject{{"requests", plan.requests}, {"productionCandidates", plan.productionCandidates}, {"entities", library}, {"request", plan.request}, {"renderInputs", plan.renderInputs}, {"error", plan.error}}).toJson(QJsonDocument::Compact);
    if (output.write(bytes) != bytes.size()) { return 2; }
    return 0;
}
