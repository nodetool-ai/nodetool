#include "assets/AssetImport.h"
#include "assets/AssetDuration.h"
#include "assets/AssetDrop.h"
#include <QJsonArray>
#include <QCoreApplication>
#include <QJsonDocument>
#include <cstdio>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 3) { return 2; }
    const QUrl url(QString::fromLocal8Bit(argv[1]));
    if (!url.isValid() || url.port() == 7777 || url.host().isEmpty()) { return 2; }
    nt::server::ServerClient client(url);
    client.setExpectedInstance(qEnvironmentVariable("NODETOOL_TIMELINE_EXPECT_INSTANCE"));
    const auto result = nt::assets::importFile(client, QString::fromLocal8Bit(argv[2]));
    auto unknownDuration = result.asset;
    unknownDuration.remove("duration");
    const auto resolved = nt::assets::withProbedVideoDuration(client, unknownDuration);
    const auto dropped = nt::assets::dropAsset({{"tracks", QJsonArray{}}, {"clips", QJsonArray{}}},
        {{"asset", resolved}, {"startMs", 1000}, {"mode", "insert"}});
    const QJsonObject report{{"ok", result.ok()}, {"asset", result.asset}, {"error", result.error},
        {"proxyError", result.proxyError}, {"proxyAvailable", result.proxyAvailable},
        {"probedAsset", resolved}, {"probedDrop", dropped}};
    std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
}
