// GenerationActivity, GenerationsPanel.qml and the queue's history in
// QueueOverlay.qml on their own: the web's GenerationActivityStore,
// GenerationsPanel, GenerationTile, OpenAsWorkflowAction, QueuePanel and the
// Report control on a failed JobItem. Links the QML module and the media QML
// types, so it builds in the components-only configuration.
#include "interfaces/GenerationActivity.h"
#include "interfaces/RunState.h"
#include "media/VideoFrameView.h"
#include "run/GenerationWorkflow.h"

#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQuickItem>
#include <QQuickView>
#include <QSignalSpy>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>

Q_IMPORT_QML_PLUGIN(NodeTool_NodeEditorPlugin)
Q_IMPORT_QML_PLUGIN(NodeTool_ModelPickerPlugin)

using namespace nodetool::node_editor;

namespace {

QQuickItem *named(QObject *root, const QString &name) {
    if (root->objectName() == name) { return qobject_cast<QQuickItem *>(root); }
    if (auto *item = qobject_cast<QQuickItem *>(root)) {
        for (auto *child : item->childItems()) {
            if (auto *found = named(child, name)) { return found; }
        }
    }
    for (auto *child : root->children()) {
        if (auto *found = named(child, name)) { return found; }
    }
    return nullptr;
}

QJsonObject prediction(const QString &id, const QString &status, const QString &capability = "text_to_image",
                       const QJsonObject &extra = {}) {
    QJsonObject message{{"type", "prediction"}, {"id", id}, {"status", status}, {"capability", capability},
                        {"provider", "fal_ai"}, {"model", "flux-dev"}, {"workflow_id", "wf1"},
                        {"params", QJsonObject{{"prompt", "a red fox"}, {"seed", 7}}}};
    for (auto it = extra.begin(); it != extra.end(); ++it) { message.insert(it.key(), it.value()); }
    return message;
}

QStringList ids(const GenerationActivity &activity) {
    QStringList result;
    for (const auto &row : activity.rows()) { result.append(row.toMap()["id"].toString()); }
    return result;
}

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QVERIFY(item->isVisible());
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
}

void show(QQuickView &view, const QVariantMap &properties, const QString &file, QSize size) {
    view.setInitialProperties(properties);
    view.setResizeMode(QQuickView::SizeRootObjectToView);
    view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/" + file));
    QVERIFY2(view.rootObject(), qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
    view.resize(size);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
}

}  // namespace

class GenerationsPanelTest : public QObject {
    Q_OBJECT
private slots:
    void initTestCase() { registerMediaTypes(); }

    // renderedWorkflow in packages/presets/src/eject.ts.
    void recordedGenerationOpensAsTheWebGraph() {
        const auto workflow = recordedGenerationWorkflow({.provider = "fal_ai", .model = "flux-dev", .capability = "text_to_image",
                                                          .prompt = "a red fox", .params = {{"seed", 7}}},
                                                         "Open as workflow");
        QCOMPARE(workflow["name"].toString(), QString("Open as workflow"));
        const auto nodes = workflow["graph"].toObject()["nodes"].toArray();
        QStringList types;
        for (const auto &node : nodes) { types.append(node.toObject()["type"].toString()); }
        QCOMPARE(types, (QStringList{"nodetool.input.StringInput", "nodetool.text.Template", "nodetool.image.TextToImage", "nodetool.output.Output"}));
        QCOMPARE(nodes[0].toObject()["data"].toObject()["value"].toString(), QString("a red fox"));
        QCOMPARE(nodes[1].toObject()["data"].toObject()["string"].toString(), QString("{{ prompt }}"));
        const auto generator = nodes[2].toObject()["data"].toObject();
        QCOMPARE(generator["seed"].toInt(), 7);
        QCOMPARE(generator["model"].toObject(), (QJsonObject{{"type", "image_model"}, {"provider", "fal_ai"}, {"id", "flux-dev"}, {"name", "flux-dev"}}));
        QCOMPARE(nodes[2].toObject()["ui_properties"].toObject()["position"].toObject(), (QJsonObject{{"x", 680}, {"y", 80}}));
        QStringList edges;
        for (const auto &edge : workflow["graph"].toObject()["edges"].toArray()) {
            const auto object = edge.toObject();
            edges.append(object["id"].toString() + ":" + object["targetHandle"].toString());
        }
        QCOMPARE(edges, (QStringList{"prompt-template:prompt", "template-generate:prompt", "generate-output:value"}));
        // A video capability uses a video model, and an unknown one has no generator.
        const auto video = recordedGenerationWorkflow({.provider = "fal_ai", .model = "veo", .capability = "image_to_video", .prompt = ""}, "x");
        QCOMPARE(video["graph"].toObject()["nodes"].toArray()[2].toObject()["type"].toString(), QString("nodetool.video.ImageToVideo"));
        QCOMPARE(video["graph"].toObject()["nodes"].toArray()[2].toObject()["data"].toObject()["model"].toObject()["type"].toString(), QString("video_model"));
        QVERIFY(recordedGenerationWorkflow({.provider = "fal_ai", .model = "m", .capability = "text_to_speech", .prompt = "hi"}, "x").isEmpty());
        QVERIFY(recordedGenerationWorkflow({.provider = "", .model = "m", .capability = "text_to_image", .prompt = "hi"}, "x").isEmpty());
    }

    // GenerationActivityStore and handlePrediction in useGenerationActivityTracking.ts.
    void activityListsMediaPredictionsRunningFirst() {
        GenerationActivity activity;
        QSignalSpy changed(&activity, &GenerationActivity::rowsChanged);
        // Only media capabilities are listed, and a settled message for an unknown id is ignored.
        activity.ingestPrediction(prediction("chat", "running", "text_generation"), 1000);
        activity.ingestPrediction(prediction("late", "completed"), 1000);
        QVERIFY(activity.rows().isEmpty());
        QCOMPARE(changed.size(), 0);
        activity.ingestPrediction(prediction("a", "running"), 1000);
        activity.ingestPrediction(prediction("b", "running", "text_to_video"), 2000);
        activity.ingestPrediction(prediction("c", "running", "text_to_speech"), 3000);
        QCOMPARE(ids(activity), (QStringList{"a", "b", "c"}));
        activity.ingestPrediction(prediction("a", "completed", "text_to_image", {{"asset_ids", QJsonArray{"asset1"}}}), 5000);
        activity.ingestPrediction(prediction("c", "failed", "text_to_speech", {{"error", "quota"}}), 4000);
        // A settled generation keeps its first outcome.
        activity.ingestPrediction(prediction("a", "failed"), 6000);
        QCOMPARE(ids(activity), (QStringList{"b", "a", "c"}));
        const auto a = activity.rows()[1].toMap();
        QCOMPARE(a["status"].toString(), QString("generated"));
        QCOMPARE(a["assetId"].toString(), QString("asset1"));
        QCOMPARE(a["title"].toString(), QString("a red fox"));
        QCOMPARE(a["kind"].toString(), QString("image"));
        QCOMPARE(activity.rows()[2].toMap()["error"].toString(), QString("quota"));
        QCOMPARE(activity.rows()[2].toMap()["kind"].toString(), QString("audio"));
        QCOMPARE(activity.counts(), (QVariantMap{{"all", 3}, {"generating", 1}, {"failed", 1}}));
        // The source line names the workflow once an open tab names it.
        QCOMPARE(a["source"].toString(), QString("Workflow"));
        activity.setWorkflowNames({{"wf1", "Fox renders"}});
        QCOMPARE(activity.rows()[1].toMap()["source"].toString(), QString("Fox renders"));
        activity.clearFinished();
        QCOMPARE(ids(activity), QStringList{"b"});
    }

    // generations.list replaces the web's browser storage as the history.
    void historyPageSettlesAndFillsTheList() {
        GenerationActivity activity;
        activity.ingestPrediction(prediction("live", "running"), 1000);
        const QJsonArray page{
            QJsonObject{{"generation_id", "live"}, {"status", "completed"}, {"capability", "text_to_image"}, {"asset_ids", QJsonArray{"x"}},
                        {"completed_at", "2026-11-13T10:00:05.000Z"}},
            QJsonObject{{"generation_id", "old"}, {"status", "failed"}, {"capability", "text_to_video"}, {"model", "veo"},
                        {"prompt", QJsonValue()}, {"provider_error", "rejected"}, {"workflow_id", "wf2"},
                        {"started_at", "2026-11-13T09:00:00.000Z"}, {"completed_at", "2026-11-13T09:00:30.000Z"}},
            QJsonObject{{"generation_id", "embed"}, {"status", "completed"}, {"capability", "embedding"}},
        };
        activity.replaceHistory(page, 0);
        QCOMPARE(ids(activity), (QStringList{"live", "old"}));
        QCOMPARE(activity.rows()[0].toMap()["status"].toString(), QString("generated"));
        QCOMPARE(activity.rows()[0].toMap()["assetId"].toString(), QString("x"));
        const auto old = activity.rows()[1].toMap();
        QCOMPARE(old["error"].toString(), QString("rejected"));
        QCOMPARE(old["title"].toString(), QString("Video generation"));
        QCOMPARE(old["workflowId"].toString(), QString("wf2"));
        QVERIFY(old["canOpenSource"].toBool());
        // A history record has no recorded request, so it cannot open as a workflow.
        QVERIFY(!old["canOpenAsWorkflow"].toBool());
        // A cleared generation stays cleared when the next page lists it again.
        activity.clearFinished();
        activity.replaceHistory(page, 0);
        QVERIFY(activity.rows().isEmpty());
        // GENERATION_HISTORY_LIMIT finished generations are kept.
        QJsonArray many;
        for (int i = 0; i < GenerationActivity::historyLimit + 5; ++i) {
            many.append(QJsonObject{{"generation_id", QString("g%1").arg(i)}, {"status", "completed"}, {"capability", "text_to_image"},
                                    {"completed_at", QDateTime::fromMSecsSinceEpoch(1'000'000 + i * 1000, QTimeZone::UTC).toString(Qt::ISODateWithMs)}});
        }
        activity.replaceHistory(many, 0);
        QCOMPARE(activity.rows().size(), GenerationActivity::historyLimit);
        QCOMPARE(activity.rows().first().toMap()["id"].toString(), QString("g%1").arg(GenerationActivity::historyLimit + 4));
    }

    void panelFiltersTilesAndSendsRequests() {
        GenerationActivity activity;
        QSignalSpy refresh(&activity, &GenerationActivity::refreshRequested);
        QSignalSpy open(&activity, &GenerationActivity::openSourceRequested);
        QSignalSpy eject(&activity, &GenerationActivity::openAsWorkflowRequested);
        QQuickView view;
        show(view, {{"activity", QVariant::fromValue(&activity)}}, "GenerationsPanel.qml", {900, 520});
        auto *root = view.rootObject();
        // Opening the panel asks for the history page.
        QCOMPARE(refresh.size(), 1);
        QVERIFY(named(root, "generations-empty")->isVisible());
        QVERIFY(!named(root, "generations-grid")->isVisible());

        activity.ingestPrediction(prediction("run", "running", "text_to_image", {{"preset_ids", QJsonArray{"look.noir"}}}), QDateTime::currentMSecsSinceEpoch());
        activity.ingestPrediction(prediction("bad", "running", "text_to_video"), QDateTime::currentMSecsSinceEpoch());
        activity.ingestPrediction(prediction("bad", "failed", "text_to_video", {{"error", "Provider rejected the prompt"}}), QDateTime::currentMSecsSinceEpoch());
        QTRY_VERIFY(named(root, "generations-grid")->isVisible());
        QCOMPARE(named(root, "generations-count")->property("text").toString(), QString("2"));
        QTRY_VERIFY(named(root, "generation-tile-run"));
        QTRY_VERIFY(named(root, "generation-tile-bad"));
        QCOMPARE(named(root, "generation-status-run")->property("text").toString(), QString("generating"));
        QCOMPARE(named(root, "generation-meta-bad")->property("text").toString(), QString("Provider rejected the prompt"));
        QVERIFY(named(root, "generation-meta-run")->property("text").toString().startsWith("Workflow · flux-dev · "));
        QCOMPARE(named(root, "generations-filter-generating")->property("text").toString(), QString("Generating 1"));
        QCOMPARE(named(root, "generations-filter-failed")->property("text").toString(), QString("Failed 1"));

        // Only the preset generation with a recorded request opens as a workflow.
        QVERIFY(named(root, "generation-open-workflow-run")->isVisible());
        QVERIFY(!named(root, "generation-open-workflow-bad")->isVisible());
        click(view, named(root, "generation-open-workflow-run"));
        QTRY_COMPARE(eject.size(), 1);
        QCOMPARE(eject.first().first().toJsonObject()["graph"].toObject()["nodes"].toArray().size(), 4);
        QCOMPARE(open.size(), 0);

        click(view, named(root, "generation-tile-bad"));
        QTRY_COMPARE(open.size(), 1);
        QCOMPARE(open.first().first().toString(), QString("wf1"));

        click(view, named(root, "generations-filter-failed"));
        QTRY_COMPARE(root->property("shown").toList().size(), 1);
        QCOMPARE(root->property("shown").toList().first().toMap()["id"].toString(), QString("bad"));
        // A filter whose last generation left the list falls back to everything.
        click(view, named(root, "generations-clear-finished"));
        QTRY_COMPARE(root->property("activeFilter").toString(), QString("all"));
        QCOMPARE(root->property("shown").toList().size(), 1);
        QVERIFY(!named(root, "generations-clear-finished")->isVisible());
        click(view, named(root, "generations-refresh"));
        QTRY_COMPARE(refresh.size(), 2);
    }

    // QueuePanel.tsx opens at any time, lists finished jobs and offers Report on a failed one.
    void queueOpensWithoutJobsAndReportsFailures() {
        RunState runs;
        QSignalSpy report(&runs, &RunState::reportJobRequested);
        QQuickView view;
        show(view, {{"runs", QVariant::fromValue(&runs)}}, "QueueOverlay.qml", {304, 640});
        auto *root = view.rootObject();
        QVERIFY(!root->property("presented").toBool());
        root->setProperty("opened", true);
        QTRY_VERIFY(root->property("presented").toBool());
        QVERIFY(root->property("showList").toBool());
        QVERIFY(named(root, "queue-active-empty")->isVisible());
        QVERIFY(named(root, "queue-history-empty")->isVisible());
        QVERIFY(!named(root, "queue-history-filters")->isVisible());

        const auto today = QDateTime::currentDateTimeUtc();
        const auto job = [&](QString id, QString status, QString error = {}) {
            return QVariantMap{{"jobId", id}, {"status", status}, {"name", "Workflow " + id}, {"error", error},
                               {"finished_at", today.toString(Qt::ISODateWithMs)}};
        };
        runs.setQueue({job("done", "completed"), job("broke", "failed", "Node crashed"), job("stop", "cancelled")});
        QTRY_VERIFY(named(root, "queue-history-broke"));
        QVERIFY(!named(root, "queue-history-empty")->isVisible());
        QVERIFY(named(root, "queue-day-Today"));
        QCOMPARE(named(root, "queue-history-meta-broke")->property("text").toString(), QString("Node crashed"));
        QVERIFY(named(root, "queue-history-meta-done")->property("text").toString().startsWith("Completed · "));
        QVERIFY(named(root, "queue-report-broke")->isVisible());
        QVERIFY(!named(root, "queue-report-done")->isVisible());
        QVERIFY(!named(root, "queue-report-stop")->isVisible());
        click(view, named(root, "queue-report-broke"));
        QTRY_COMPARE(report.size(), 1);
        QCOMPARE(report.first().first().toString(), QString("broke"));

        QCOMPARE(named(root, "queue-filter-failed")->property("text").toString(), QString("Failed 1"));
        click(view, named(root, "queue-filter-failed"));
        QTRY_VERIFY(!named(root, "queue-history-done"));
        QVERIFY(named(root, "queue-history-broke"));

        // An active job brings the queue's own sections back.
        runs.setQueue({job("broke", "failed", "Node crashed"), job("now", "running")});
        QTRY_VERIFY(!named(root, "queue-active-empty")->isVisible());
        QCOMPARE(named(root, "queue-active-summary")->property("text").toString(), QString("1 running"));
        runs.setQueue({job("broke", "failed", "Node crashed")});
        QTRY_VERIFY(named(root, "queue-active-empty")->isVisible());
        // Without active jobs the header button closes the opened queue.
        click(view, named(root, "queue-collapse"));
        QTRY_VERIFY(!root->property("opened").toBool());
        QTRY_VERIFY(!root->property("presented").toBool());
    }
};

QTEST_MAIN(GenerationsPanelTest)
#include "GenerationsPanelTest.moc"
