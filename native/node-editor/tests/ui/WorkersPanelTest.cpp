// WorkerFleet and WorkersPanel.qml on their own, with a scripted transport in
// place of the server: the web's useWorkers and WorkersPanel.
#include "interfaces/WorkerFleet.h"

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

void click(QQuickView &view, QQuickItem *item) {
    QVERIFY(item);
    QVERIFY(item->isVisible());
    QTest::mouseClick(&view, Qt::LeftButton, Qt::NoModifier, item->mapToScene({item->width() / 2, item->height() / 2}).toPoint());
}

// A server in memory: the answers to each procedure and the calls it received.
struct FakeServer {
    QHash<QString, QJsonValue> answers;
    QHash<QString, QString> errors;
    QList<QPair<QString, QJsonObject>> calls;

    WorkerFleet::Transport transport() {
        return [this](const QString &procedure, const QJsonObject &input, bool, WorkerFleet::Reply reply) {
            calls.append({procedure, input});
            reply(answers.value(procedure), errors.value(procedure));
        };
    }
    QStringList procedures() const {
        QStringList names;
        for (const auto &call : calls) { names.append(call.first); }
        return names;
    }
};

QJsonObject instance(const QString &id, const QString &status, double cost = 0.5) {
    return {{"id", id}, {"profile_name", "RunPod A40"}, {"target", "runpod"}, {"status", status},
            {"created_at", "2026-11-14T10:00:00.000Z"}, {"estimated_cost_usd", cost}};
}

qint64 noon() { return QDateTime::fromString("2026-11-14T12:00:00.000Z", Qt::ISODateWithMs).toMSecsSinceEpoch(); }

}  // namespace

class WorkersPanelTest : public QObject {
    Q_OBJECT
private slots:
    void instancesShowStatusUptimeAndTheBillingRate() {
        FakeServer server;
        server.answers["worker.instances.list"] = QJsonArray{instance("a", "attached", 0.4), instance("b", "stopped", 0.1),
                                                             instance("c", "terminated", 9), instance("d", "provisioning", 0.2)};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        fleet.setClock(noon);
        fleet.refresh();
        const auto shown = fleet.instances();
        // A terminated pod is a tombstone and stays hidden.
        QCOMPARE(shown.size(), 3);
        QCOMPARE(shown[0].toMap()["statusLabel"].toString(), QString("Attached"));
        QCOMPARE(shown[0].toMap()["uptime"].toString(), QString("2 hours"));
        QCOMPARE(shown[1].toMap()["statusLabel"].toString(), QString("Paused"));
        QCOMPARE(shown[2].toMap()["hint"].toString(), QString("Renting the GPU. This can take a few minutes."));
        // A paused pod does not count toward the GPU rate.
        QCOMPARE(fleet.rateText(), QString("$0.60/hr"));
    }

    void aWorkerStartedHereAttachesOnceItAnswers() {
        FakeServer server;
        server.answers["worker.provision"] = instance("w1", "provisioning");
        server.answers["worker.instances.list"] = QJsonArray{instance("w1", "running")};
        server.answers["worker.health"] = QJsonObject{{"healthy", false}};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        QSignalSpy finished(&fleet, &WorkerFleet::provisionFinished);
        fleet.provision("RunPod A40");
        QCOMPARE(finished.size(), 1);
        QVERIFY(finished[0][0].toBool());
        auto row = fleet.instances()[0].toMap();
        QCOMPARE(row["statusLabel"].toString(), QString("Booting"));
        QCOMPARE(row["hint"].toString(), QString("GPU is up. The worker is loading and attaches when it is ready."));
        QVERIFY(!server.procedures().contains("worker.attach"));

        // The next probe answers, so the fleet attaches and reloads the list.
        server.answers["worker.health"] = QJsonObject{{"healthy", true}};
        server.answers["worker.attach"] = QJsonObject{{"wsUrl", "ws://pod"}};
        fleet.refresh();
        QCOMPARE(server.procedures().count("worker.attach"), 1);
        server.answers["worker.instances.list"] = QJsonArray{instance("w1", "attached")};
        fleet.refresh();
        QCOMPARE(fleet.instances()[0].toMap()["statusLabel"].toString(), QString("Attached"));
    }

    void aComfyPodShowsItsUrlAndIsNeverAttached() {
        FakeServer server;
        server.answers["worker.instances.list"] = QJsonArray{instance("c1", "running")};
        server.answers["worker.health"] = QJsonObject{{"healthy", true}, {"comfyEndpoint", "https://pod/comfy"}};
        server.answers["worker.provision"] = instance("c1", "provisioning");
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        fleet.provision("Comfy");
        const auto row = fleet.instances()[0].toMap();
        QCOMPARE(row["comfyEndpoint"].toString(), QString("https://pod/comfy"));
        QCOMPARE(row["statusLabel"].toString(), QString("Ready"));
        QVERIFY(!server.procedures().contains("worker.attach"));
    }

    void failuresAndOrphansReachTheBanners() {
        FakeServer server;
        server.errors["worker.stop"] = "pod is gone";
        server.answers["worker.reconcile"] = QJsonObject{{"orphans", QJsonArray{QJsonObject{}, QJsonObject{}}},
                                                         {"liveCount", 3}, {"estimatedCostUsd", 1.5}};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        fleet.stop("x");
        QCOMPARE(fleet.error(), QString("Worker action failed: pod is gone"));
        QVERIFY(fleet.stoppingId().isEmpty());
        fleet.reconcile();
        QVERIFY(fleet.error().isEmpty());
        QCOMPARE(fleet.orphanWarning()["title"].toString(),
                 QString("2 orphaned workers may still be billing — stop them in your provider console"));
        QCOMPARE(fleet.orphanWarning()["details"].toString(), QString("3 live, ~$1.50/hr"));
    }

    void profileFormBuildsTheCreateInput() {
        FakeServer server;
        server.answers["worker.profiles.list"] = QJsonArray{QJsonObject{{"name", "RunPod CPU"}}};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        fleet.refresh();
        QCOMPARE(fleet.suggestProfileName("RunPod CPU"), QString("RunPod CPU 2"));
        QSignalSpy finished(&fleet, &WorkerFleet::profileFinished);
        fleet.createProfile({{"name", "Box"}, {"target", "runpod"}, {"image", "img"}, {"gpu", ""}, {"vcpu", "8"},
                             {"disk", "100"}, {"token_policy", "generate"}, {"idle_timeout_minutes", "30"},
                             {"max_lifetime_minutes", ""}},
                            true);
        QCOMPARE(finished.size(), 1);
        QVERIFY(finished[0][0].toString().isEmpty());
        QVERIFY(finished[0][1].toBool());
        const auto create = std::find_if(server.calls.begin(), server.calls.end(),
                                         [](const auto &call) { return call.first == "worker.profiles.create"; });
        QVERIFY(create != server.calls.end());
        // A RunPod pod with no GPU is a CPU pod with a vCPU count. A blank lifetime is left out.
        QCOMPARE(create->second["spec"].toObject(), (QJsonObject{{"vcpu", 8}, {"disk", 100}}));
        QCOMPARE(create->second["idle_timeout_minutes"].toInt(), 30);
        QVERIFY(!create->second.contains("max_lifetime_minutes"));
        QVERIFY(server.procedures().contains("worker.provision"));
    }

    void anInvalidApiKeyIsNotStored() {
        FakeServer server;
        server.answers["settings.secrets.validate"] = QJsonObject{{"status", "invalid"}};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        QSignalSpy finished(&fleet, &WorkerFleet::apiKeyFinished);
        fleet.saveApiKey("runpod", " key ", false);
        QCOMPARE(finished[0][1].toString(), QString("rejected"));
        QVERIFY(!server.procedures().contains("settings.secrets.upsert"));
        fleet.saveApiKey("runpod", "key", true);
        QCOMPARE(finished[1][1].toString(), QString("saved"));
        QCOMPARE(server.calls[1].second["value"].toString(), QString("key"));
    }

    void panelStopsAndTerminatesAfterConfirmation() {
        FakeServer server;
        server.answers["worker.instances.list"] = QJsonArray{instance("a", "attached")};
        server.answers["worker.profiles.list"] = QJsonArray{QJsonObject{{"name", "RunPod A40"}, {"target", "runpod"}}};
        WorkerFleet fleet;
        fleet.setTransport(server.transport());
        QQuickView view;
        view.setInitialProperties({{"fleet", QVariant::fromValue(&fleet)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkersPanel.qml"));
        QVERIFY2(view.rootObject(), qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.resize(1100, 500);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *root = view.rootObject();
        QTRY_VERIFY(named(root, "workers-instance-a"));
        QCOMPARE(named(root, "workers-primary-a")->property("text").toString(), QString("Detach"));
        click(view, named(root, "workers-stop-a"));
        QVERIFY(server.procedures().contains("worker.stop"));

        click(view, named(root, "workers-terminate-a"));
        QVERIFY(!server.procedures().contains("worker.terminate"));
        QTRY_VERIFY(named(root, "workers-terminate-confirm") && named(root, "workers-terminate-confirm")->isVisible());
        click(view, named(root, "workers-terminate-confirm"));
        QVERIFY(server.procedures().contains("worker.terminate"));
    }

    void panelWithoutAServerExplainsWhy() {
        WorkerFleet fleet;
        QQuickView view;
        view.setInitialProperties({{"fleet", QVariant::fromValue(&fleet)}});
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.setSource(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/WorkersPanel.qml"));
        QVERIFY(view.rootObject());
        view.resize(900, 400);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        auto *empty = named(view.rootObject(), "workers-empty");
        QVERIFY(empty && empty->isVisible());
        QCOMPARE(empty->property("title").toString(), QString("No server connected"));
        QVERIFY(!named(view.rootObject(), "workers-start")->isEnabled());
    }
};

QTEST_MAIN(WorkersPanelTest)
#include "WorkersPanelTest.moc"
