#include "ai/catalog/ModelCatalogController.h"
#include "ai/catalog/EntityReferenceController.h"
#include "TestHttpServer.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSettings>
#include <QTemporaryDir>
#include <QTest>
#include <QUrlQuery>

namespace {
QByteArray answer(const QJsonValue& data) {
    return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", data}}}}).toJson(QJsonDocument::Compact);
}
QJsonObject input(const QUrl& url) {
    return QJsonDocument::fromJson(QUrlQuery(url).queryItemValue("input", QUrl::FullyDecoded).toUtf8()).object();
}
}
class CatalogServerTest : public QObject {
    Q_OBJECT
private slots:
    void providerContracts() {
        QTemporaryDir settings;
        QSettings::setDefaultFormat(QSettings::IniFormat);
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
        TestHttpServer server;
        QVERIFY(server.base().port() != 7777);
        server.setJson([](const QByteArray& path, const QUrl& url) {
            if (path == "/trpc/models.providers") return answer(QJsonArray{
                QJsonObject{{"provider", "video-provider"}, {"capabilities", QJsonArray{"text_to_video"}}, {"access", "remote_api"}, {"display_name", "Video"}},
                QJsonObject{{"provider", "speech-provider"}, {"capabilities", QJsonArray{"text_to_speech"}}},
                QJsonObject{{"provider", "music-provider"}, {"capabilities", QJsonArray{"text_to_music"}}}});
            if (path == "/trpc/models.videoByProvider" && input(url).value("provider") == "video-provider")
                return answer(QJsonArray{QJsonObject{{"id", "video/model"}, {"name", "Video Model"}, {"type", "video_model"}, {"provider", "video-provider"}, {"supported_tasks", QJsonArray{"text_to_video"}}, {"durations", QJsonArray{4, 8}}, {"aspect_ratios", QJsonArray{"16:9"}}}});
            if (path == "/trpc/models.ttsByProvider" && input(url).value("provider") == "speech-provider")
                return answer(QJsonArray{QJsonObject{{"id", "speech/model"}, {"name", "Speech Model"}, {"type", "tts_model"}, {"voices", QJsonArray{"alloy"}}}});
            if (path == "/trpc/models.musicByProvider" && input(url).value("provider") == "music-provider")
                return answer(QJsonArray{QJsonObject{{"id", "music/model"}, {"name", "Music Model"}, {"type", "music_model"}}});
            return QByteArray(R"({"error":{"message":"unexpected contract","data":{"code":"BAD_REQUEST"}}})");
        });
        ModelCatalogController catalog;
        catalog.configure(server.base());
        QTRY_VERIFY_WITH_TIMEOUT(!catalog.loading() && catalog.models().size() == 1, 10000);
        QCOMPARE(catalog.models().first().toMap().value("id").toString(), QStringLiteral("video/model"));
        catalog.selectModel("video/model", "video-provider");
        QCOMPARE(catalog.constraints().value("aspectRatios").toList(), QVariantList{"16:9"});
        catalog.setMode("audio");
        QTRY_VERIFY_WITH_TIMEOUT(!catalog.loading() && catalog.models().size() == 1, 10000);
        catalog.selectModel("speech/model", "speech-provider");
        QCOMPARE(catalog.constraints().value("voices").toList(), QVariantList{"alloy"});
        catalog.setMode("music");
        QTRY_VERIFY_WITH_TIMEOUT(!catalog.loading() && catalog.models().size() == 1, 10000);
        catalog.selectModel("music/model", "music-provider");
        QCOMPARE(catalog.selectedModelType(), QStringLiteral("music_model"));
        QVERIFY(catalog.error().isEmpty());
        for (const auto& request : server.requests()) QCOMPARE(request.method, QByteArray("GET"));
    }
    void huggingFaceCatalogContract() {
        TestHttpServer server;
        QVERIFY(server.base().port() != 7777);
        server.setJson([](const QByteArray& path, const QUrl& url) {
            if (path != "/trpc/models.huggingfaceByType" || input(url).value("model_type") != "hf.model" || (input(url).value("scope") != "local" && input(url).value("scope") != "worker"))
                return QByteArray(R"({"error":{"message":"unexpected catalog query","data":{"code":"BAD_REQUEST"}}})");
            return answer(QJsonArray{QJsonObject{{"repo_id", "owner/model"}, {"name", "Model"}, {"path", QJsonValue::Null}}});
        });
        ModelCatalogController catalog;
        catalog.setMode("huggingface_model");
        catalog.configure(server.base());
        QTRY_VERIFY_WITH_TIMEOUT(!catalog.loading() && catalog.models().size() == 1, 10000);
        QCOMPARE(catalog.models().first().toMap().value("id").toString(), QStringLiteral("owner/model"));
        QVERIFY(catalog.error().isEmpty());
        catalog.setModelScope("worker");
        QTRY_VERIFY_WITH_TIMEOUT(!catalog.loading() && catalog.models().size() == 1, 10000);
        QCOMPARE(catalog.modelScope(), QStringLiteral("worker"));
        bool foundLocal = false, foundWorker = false;
        for (const auto& request : server.requests()) {
            QCOMPARE(request.method, QByteArray("GET"));
            if (!request.target.startsWith("/trpc/models.huggingfaceByType?")) continue;
            const auto scope = input(QUrl::fromEncoded(QByteArray("http://localhost") + request.target)).value("scope").toString();
            foundLocal = foundLocal || scope == "local";
            foundWorker = foundWorker || scope == "worker";
        }
        QVERIFY(foundLocal);
        QVERIFY(foundWorker);
    }
    void projectEntityContract() {
        TestHttpServer server;
        QVERIFY(server.base().port() != 7777);
        server.setJson([](const QByteArray& path, const QUrl& url) {
            if (path != "/trpc/assets.search" || input(url).value("project_id") != "project-one"
                || input(url).value("page_size") != 1000 || input(url).value("query") != "")
                return QByteArray(R"({"error":{"message":"unexpected search","data":{"code":"BAD_REQUEST"}}})");
            const QJsonObject marker{
                {"kind", "character"}, {"name", "Mara"}, {"descriptor", "Red coat"},
                {"reference_asset_id", "new-picture"}
            };
            const QJsonObject metadata{{"nodetool_entity", marker}};
            const QJsonObject entityAsset{{"id", "entity-id"}, {"metadata", metadata}};
            const QJsonObject ordinaryAsset{{"id", "ordinary-image"}};
            const QJsonArray assets{entityAsset, ordinaryAsset};
            const QJsonObject result{
                {"assets", assets}, {"next_cursor", QJsonValue::Null},
                {"total_count", 2}, {"is_global_search", true}
            };
            return answer(result);
        });
        EntityReferenceController entities;
        entities.setProjectId("project-one");
        entities.configure(server.base());
        QTRY_VERIFY_WITH_TIMEOUT(!entities.loading() && entities.entities().size() == 1, 10000);
        entities.toggleEntity("entity-id");
        QCOMPARE(entities.selectedIds(), QVariantList{"entity-id"});
        QCOMPARE(entities.selectedEntities().first().toMap().value("referenceAssetId").toString(), QStringLiteral("new-picture"));
        entities.toggleEntity("ordinary-image");
        QCOMPARE(entities.selectedIds().size(), 1);
        entities.toggleEntity("entity-id");
        QVERIFY(entities.selectedIds().isEmpty());
        QVERIFY(entities.error().isEmpty());
        for (const auto& request : server.requests()) QCOMPARE(request.method, QByteArray("GET"));
    }
};
QTEST_GUILESS_MAIN(CatalogServerTest)
#include "tst_catalogserver.moc"
