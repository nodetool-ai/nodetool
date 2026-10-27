#include "assets/AssetClip.h"
#include "assets/AssetDrop.h"
#include "app/EditRegistry.h"
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 2) { return 1; }
    const auto cases = QJsonDocument::fromJson(QByteArray(argv[1])).array();
    QJsonArray results;
    for (const auto& value : cases) {
        const auto request = value.toObject();
        if (request.value("op").toString() == "settle") {
            results.append(nt::assets::settleLinkedAudio(request.value("document").toObject(), request.value("payload").toObject()));
            continue;
        }
        if (request.value("op").toString() == "drop") {
            results.append(nt::app::findEdit("assets.dropAsset")(
                request.value("document").toObject(), request.value("payload").toObject()));
            continue;
        }
        if (request.value("op").toString() == "snap") {
            results.append(nt::assets::snapAssetDropMs(request.value("clips").toArray(),
                request.value("trackId").toString(), request.value("atMs").toDouble(), request.value("snapMs").toDouble()));
            continue;
        }
        const auto clip = nt::assets::assetToClip(request.value("asset").toObject(),
            request.value("trackId").toString(), request.value("startMs").toDouble());
        results.append(clip ? QJsonValue(*clip) : QJsonValue::Null);
    }
    std::printf("%s\n", QJsonDocument(results).toJson(QJsonDocument::Compact).constData());
}
