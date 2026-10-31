#include "ModelPickerCatalog.h"
#include <QJsonArray>
#include <QSettings>
#include <QTemporaryDir>
#include <QTest>

using nt::modelpicker::Catalog;

class ModelPickerTest : public QObject {
    Q_OBJECT
private slots:
    void identitySelectionAndIndependentPreferences() {
        QTemporaryDir settings;
        QSettings::setPath(QSettings::IniFormat, QSettings::UserScope, settings.path());
        Catalog catalog;
        catalog.setMode("chat");
        catalog.setIdentity("server-a/account-a");
        catalog.setQuery([](const QString& procedure, QJsonObject input, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "alpha"}, {"capabilities", QJsonArray{"generate_message"}}},
                                QJsonObject{{"provider", "beta"}, {"capabilities", QJsonArray{"generate_message"}}}}, {});
            } else {
                const auto provider = input.value("provider").toString();
                done(QJsonArray{QJsonObject{{"id", "same"}, {"name", provider + " model"}, {"supports_tools", true}},
                                QJsonObject{{"id", "excluded"}, {"supports_tools", false}}}, {});
            }
        });
        QCOMPARE(catalog.models().size(), 2);
        catalog.selectModel("same", "beta");
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("beta"));
        catalog.toggleFavorite("same", "alpha");
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("beta"));
        catalog.setDefault("same", "alpha");
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("beta"));
        catalog.setGroup("Favorites");
        QCOMPARE(catalog.results()->rowCount(), 1);
        QCOMPARE(catalog.resultAt(0).value("provider").toString(), QStringLiteral("alpha"));
        catalog.setGroup("All");
        catalog.setIdentity("server-a/account-b");
        QCOMPARE(catalog.selectedModelId(), QString());
        catalog.reload();
        QCOMPARE(catalog.models().size(), 2);
        catalog.setIdentity("server-a/account-a");
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("beta"));
        catalog.reload();
        QCOMPARE(catalog.selectedModel().value("name").toString(), QStringLiteral("beta model"));
        catalog.clearSelection();
        QCOMPARE(catalog.selectedProvider(), QString());
        QCOMPARE(catalog.selectedModelId(), QString());
    }
    void staleResponsesDoNotCrossIdentity() {
        Catalog catalog;
        Catalog::Completion oldRequest;
        catalog.setQuery([&](const QString& procedure, QJsonObject, Catalog::Completion done) {
            if (procedure == "models.providers") oldRequest = std::move(done);
        });
        catalog.setIdentity("old");
        catalog.reload();
        QVERIFY(catalog.loading());
        catalog.setIdentity("new");
        QVERIFY(!catalog.loading());
        oldRequest(QJsonArray{QJsonObject{{"provider", "leaked"}, {"capabilities", QJsonArray{"text_to_video"}}}}, {});
        QVERIFY(catalog.providers().isEmpty());
        QVERIFY(catalog.models().isEmpty());
    }
    void taskAndAvailabilityFiltering() {
        Catalog catalog;
        catalog.setIdentity("tasks");
        catalog.setMode("extend_video");
        catalog.setQuery([](const QString& procedure, QJsonObject, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "video"}, {"capabilities", QJsonArray{"extend_video"}}}}, {});
            } else {
                done(QJsonArray{QJsonObject{{"id", "compatible"}, {"supported_tasks", QJsonArray{"extend_video"}}},
                                QJsonObject{{"id", "wrong"}, {"supported_tasks", QJsonArray{"video_to_video"}}},
                                QJsonObject{{"id", "unavailable"}, {"supported_tasks", QJsonArray{"extend_video"}},
                                            {"execution", QJsonObject{{"state", "unavailable"}}}}}, {});
            }
        });
        QCOMPARE(catalog.models().size(), 2);
        catalog.selectModel("unavailable", "video");
        QCOMPARE(catalog.selectedModelId(), QString());
        catalog.selectModel("compatible", "video");
        QCOMPARE(catalog.selectedModelId(), QStringLiteral("compatible"));
        catalog.reload();
        QCOMPARE(catalog.selectedModelId(), QStringLiteral("compatible"));
    }
    void refreshRetainsUnavailableExplicitChoice() {
        Catalog catalog;
        catalog.setMode("chat");
        catalog.setIdentity("refresh-account");
        bool includeModel = true;
        catalog.setQuery([&](const QString& procedure, QJsonObject, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "alpha"}, {"capabilities", QJsonArray{"generate_message"}}}}, {});
            } else if (procedure == "models.llmByProvider") {
                done(includeModel ? QJsonArray{QJsonObject{{"id", "chosen"}, {"supports_tools", true}, {"voices", QJsonArray{"one"}}}} : QJsonArray{}, {});
            } else {
                done(QJsonArray{}, {});
            }
        });
        catalog.selectModel("chosen", "alpha");
        QVERIFY(catalog.selectionAvailable());
        includeModel = false;
        catalog.reload();
        QCOMPARE(catalog.selectedModelId(), QStringLiteral("chosen"));
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("alpha"));
        QVERIFY(!catalog.selectionAvailable());
        QVERIFY(catalog.constraints().isEmpty());
    }
    void rankingSetupAndDefault() {
        Catalog catalog;
        catalog.setMode("chat");
        catalog.setIdentity("ranking-account");
        catalog.setQuery([](const QString& procedure, QJsonObject input, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "alpha"}, {"display_name", "Alpha Cloud"}, {"access", "remote_api"}, {"capabilities", QJsonArray{"generate_message"}}},
                                QJsonObject{{"provider", "beta"}, {"display_name", "Beta Local"}, {"access", "local_service"}, {"capabilities", QJsonArray{"generate_message"}}}}, {});
            } else if (procedure == "settings.providerCatalog") {
                done(QJsonArray{QJsonObject{{"provider", "alpha"}, {"configured", false}}}, {});
            } else if (procedure == "models.rankedKeys") {
                done(QJsonArray{"beta:same", "alpha:same"}, {});
            } else {
                done(QJsonArray{QJsonObject{{"id", "same"}, {"name", "Same"}}}, {});
            }
        });
        QCOMPARE(catalog.resultAt(0).value("provider").toString(), QStringLiteral("beta"));
        QCOMPARE(catalog.cloudProviders(), QStringList{"alpha"});
        QCOMPARE(catalog.localProviders(), QStringList{"beta"});
        QCOMPARE(catalog.providerLabel("alpha"), QStringLiteral("Alpha Cloud"));
        QVERIFY(catalog.needsProviderSetup());
        catalog.setDefault("same", "beta");
        QCOMPARE(catalog.selectedModelId(), QString());
        catalog.reload();
        QCOMPARE(catalog.selectedProvider(), QStringLiteral("beta"));
        QVERIFY(catalog.selectionAvailable());
        catalog.clearSelection();
        catalog.reload();
        QCOMPARE(catalog.selectedModelId(), QString());
    }
    void largeCatalogFiltersWithoutIndexSelection() {
        Catalog catalog;
        catalog.setIdentity("large-catalog");
        catalog.setMode("chat");
        catalog.setQuery([](const QString& procedure, QJsonObject, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "many"}, {"capabilities", QJsonArray{"generate_message"}}}}, {});
            } else if (procedure == "models.llmByProvider") {
                QJsonArray entries;
                for (int index = 0; index < 5000; ++index) {
                    entries.append(QJsonObject{{"id", QString("model-%1").arg(index)}, {"name", QString("Model %1").arg(index)}});
                }
                done(entries, {});
            } else {
                done(QJsonArray{}, {});
            }
        });
        QCOMPARE(catalog.results()->rowCount(), 5000);
        catalog.setSearch("model-4999");
        QCOMPARE(catalog.results()->rowCount(), 1);
        QCOMPARE(catalog.resultAt(0).value("id").toString(), QStringLiteral("model-4999"));
        catalog.selectModel("model-4999", "many");
        QCOMPARE(catalog.selectedModelId(), QStringLiteral("model-4999"));
    }
    void partialProviderFailureKeepsAvailableModels() {
        Catalog catalog;
        catalog.setIdentity("partial-failure");
        catalog.setMode("chat");
        catalog.setQuery([](const QString& procedure, QJsonObject input, Catalog::Completion done) {
            if (procedure == "models.providers") {
                done(QJsonArray{QJsonObject{{"provider", "alpha"}, {"capabilities", QJsonArray{"generate_message"}}},
                                QJsonObject{{"provider", "beta"}, {"capabilities", QJsonArray{"generate_message"}}}}, {});
            } else if (procedure == "models.llmByProvider" && input.value("provider") == "alpha") {
                done({}, "offline");
            } else if (procedure == "models.llmByProvider") {
                done(QJsonArray{QJsonObject{{"id", "working"}}}, {});
            } else {
                done(QJsonArray{}, {});
            }
        });
        QVERIFY(!catalog.loading());
        QVERIFY(catalog.error().contains("alpha: offline"));
        QCOMPARE(catalog.results()->rowCount(), 1);
        catalog.selectModel("working", "beta");
        QVERIFY(catalog.selectionAvailable());
    }
};
QTEST_GUILESS_MAIN(ModelPickerTest)
#include "tst_modelpicker.moc"
