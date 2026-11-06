#include "ai/catalog/ModelCatalog.h"
#include <QTest>
#include <QJsonDocument>

class CatalogTest : public QObject {
    Q_OBJECT
private slots:
    void procedures() {
        QCOMPARE(nt::ai::catalogProcedure("image"), QStringLiteral("models.imageByProvider"));
        QCOMPARE(nt::ai::catalogCapability("image"), QStringLiteral("text_to_image"));
        QCOMPARE(nt::ai::catalogCapability("video"), QStringLiteral("text_to_video"));
        QCOMPARE(nt::ai::catalogProcedure("video"), QStringLiteral("models.videoByProvider"));
        QCOMPARE(nt::ai::catalogProcedure("audio"), QStringLiteral("models.ttsByProvider"));
        QCOMPARE(nt::ai::catalogProcedure("music"), QStringLiteral("models.musicByProvider"));
        QCOMPARE(nt::ai::catalogCapability("audio"), QStringLiteral("text_to_speech"));
        QCOMPARE(nt::ai::catalogCapability("music"), QStringLiteral("text_to_music"));
        QVERIFY(nt::ai::catalogProcedure("unknown").isEmpty());
    }
    void workflowModelModes() {
        const QJsonArray models{QJsonObject{{"id", "one"}, {"supports_tools", false}, {"supported_tasks", QJsonArray{"image_to_image"}}}};
        for (const auto& mode : {"language_model", "image_model", "video_model", "tts_model", "asr_model", "music_model", "embedding_model"}) {
            QVERIFY(!nt::ai::catalogProcedure(mode).isEmpty());
            QVERIFY(nt::ai::catalogProviderMatches(mode, QJsonArray{nt::ai::catalogCapability(mode)}));
            const auto result = nt::ai::catalogModels(models, "provider", mode);
            QCOMPARE(result.size(), 1);
            QCOMPARE(result.first().toMap().value("modelType").toString(), QString::fromLatin1(mode));
        }
        QVERIFY(nt::ai::catalogProviderMatches("image_model", QJsonArray{"remove_background"}));
        QVERIFY(!nt::ai::catalogProviderMatches("image_model", QJsonArray{"generate_message"}));
    }
    void huggingFaceCachedModels() {
        QCOMPARE(nt::ai::catalogProcedure("huggingface_model"), QStringLiteral("models.huggingfaceByType"));
        const auto result = nt::ai::catalogModels(QJsonArray{QJsonObject{{"repo_id", "owner/model"}, {"path", "model.safetensors"}}}, "huggingface", "huggingface_model");
        QCOMPARE(result.size(), 1);
        QCOMPARE(result.first().toMap().value("id").toString(), QStringLiteral("owner/model"));
        QCOMPARE(result.first().toMap().value("path").toString(), QStringLiteral("model.safetensors"));
    }
    void clipOperationTasks() {
        const QJsonArray input{
            QJsonObject{{"id", "legacy"}},
            QJsonObject{{"id", "text"}, {"supported_tasks", QJsonArray{"text_to_video"}}},
            QJsonObject{{"id", "image"}, {"supported_tasks", QJsonArray{"image_to_video"}}},
            QJsonObject{{"id", "references"}, {"supported_tasks", QJsonArray{"reference_to_video"}}},
            QJsonObject{{"id", "edit"}, {"supported_tasks", QJsonArray{"video_to_video"}}},
            QJsonObject{{"id", "extend"}, {"supported_tasks", QJsonArray{"extend_video"}}, {"durations", QJsonArray{4, 8}}}
        };
        for (const auto& mode : {QStringLiteral("video_to_video"), QStringLiteral("image_to_video"), QStringLiteral("extend_video"), QStringLiteral("reference_to_video")}) {
            QCOMPARE(nt::ai::catalogCapability(mode), mode);
            QCOMPARE(nt::ai::catalogProcedure(mode), QStringLiteral("models.videoByProvider"));
            const auto models = nt::ai::catalogModels(input, "provider", mode);
            QCOMPARE(models.size(), mode == "image_to_video" ? 2 : 1);
            QCOMPARE(models.last().toMap().value("modelType").toString(), QStringLiteral("video_model"));
            QCOMPARE(models.last().toMap().value("supported_tasks").toList(), QVariantList{mode});
        }
        const auto extension = nt::ai::catalogModels(input, "provider", "extend_video").first().toMap();
        QCOMPARE(nt::ai::catalogConstraints(extension).value("durations").toList(), QVariantList({4.0, 8.0}));
    }
    void toolCapableChatModels() {
        QCOMPARE(nt::ai::catalogCapability("chat"), QStringLiteral("generate_message"));
        QCOMPARE(nt::ai::catalogProcedure("chat"), QStringLiteral("models.llmByProvider"));
        const QJsonArray input{
            QJsonObject{{"id", "tools"}, {"supports_tools", true}},
            QJsonObject{{"id", "no-tools"}, {"supports_tools", false}},
            QJsonObject{{"id", "legacy"}},
            QJsonObject{{"id", "unknown"}, {"supports_tools", QJsonValue::Null}}
        };
        const auto models = nt::ai::catalogModels(input, "provider", "chat");
        QCOMPARE(models.size(), 3);
        QCOMPARE(models.first().toMap().value("id").toString(), QStringLiteral("tools"));
        QCOMPARE(models.first().toMap().value("modelType").toString(), QStringLiteral("language_model"));
        QCOMPARE(models.last().toMap().value("id").toString(), QStringLiteral("unknown"));
    }
    void backendShape() {
        // The same snake_case catalog fields returned by models.videoByProvider.
        const auto input = QJsonDocument::fromJson(R"([{"id":"vendor/model","name":"Video model","provider":"wrong","durations":[-1,0,4,8],"aspect_ratios":["16:9","9:16"],"resolutions":["720p"]},{"name":"missing id"}])").array();
        const auto models = nt::ai::catalogModels(input, "fal", "video");
        QCOMPARE(models.size(), 1);
        const auto model = models.first().toMap();
        QCOMPARE(model.value("id").toString(), QStringLiteral("vendor/model"));
        QCOMPARE(model.value("provider").toString(), QStringLiteral("fal"));
        QCOMPARE(model.value("modelType").toString(), QStringLiteral("video_model"));
        const auto constraints = nt::ai::catalogConstraints(model);
        QCOMPARE(constraints.value("durations").toList(), QVariantList({4.0, 8.0}));
        QCOMPARE(constraints.value("aspectRatios").toList(), QVariantList({"16:9", "9:16"}));
        QCOMPARE(constraints.value("resolutions").toList(), QVariantList({"720p"}));
    }
    void explicitTasksMatchBasicGeneration() {
        const QJsonArray input{
            QJsonObject{{"id", "legacy"}},
            QJsonObject{{"id", "text"}, {"supported_tasks", QJsonArray{"text_to_video"}}},
            QJsonObject{{"id", "references"}, {"supported_tasks", QJsonArray{"reference_to_video"}}},
            QJsonObject{{"id", "edit"}, {"supported_tasks", QJsonArray{"video_to_video"}}}
        };
        const auto models = nt::ai::catalogModels(input, "fal", "video");
        QCOMPARE(models.size(), 2);
        QCOMPARE(models.last().toMap().value("id").toString(), QStringLiteral("text"));
    }
    void speechAndMusicStaySeparate() {
        const QJsonArray input{QJsonObject{{"id", "voice-model"}, {"name", "Speech"}, {"voices", QJsonArray{"alloy", "nova"}}}};
        const auto speech = nt::ai::catalogModels(input, "openai", "audio").first().toMap();
        QCOMPARE(speech.value("modelType").toString(), QStringLiteral("tts_model"));
        QCOMPARE(nt::ai::catalogConstraints(speech).value("voices").toList(), QVariantList({"alloy", "nova"}));
        const auto music = nt::ai::catalogModels(input, "other", "music").first().toMap();
        QCOMPARE(music.value("modelType").toString(), QStringLiteral("music_model"));
    }
    void unspecifiedConstraintsRemainUnknown() {
        QVERIFY(nt::ai::catalogConstraints({}).isEmpty());
        QVERIFY(nt::ai::catalogConstraints({{"durations", QVariantList{-1, 0}}}).isEmpty());
    }
};
QTEST_GUILESS_MAIN(CatalogTest)
#include "tst_catalog.moc"
