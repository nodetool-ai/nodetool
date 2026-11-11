#include "FakeRunServer.h"
#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "ui/EditorWindow.h"
#include <QDir>
#include <QFile>
#include <QJsonDocument>
#include <QPainter>
#include <QQuickItem>
#include <QQuickWidget>
#include <QSettings>
#include <QStandardPaths>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
#include <algorithm>
#include <cmath>

using namespace nodetool;

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(WINDOW_PARITY_FIXTURE));
    if (!file.open(QIODevice::ReadOnly)) {
        return {};
    }
    return QJsonDocument::fromJson(file.readAll()).object();
}

void settle() {
    QTest::qWait(250);
    QCoreApplication::processEvents();
}

// The web capture script in docs/native-node-editor-visual-comparison.md emits
// the same messages through the web run reducer, so both surfaces show one state.
void showRunProgress(EditorWindow &window, const QString &job) {
    for (const auto *id : {"subject", "size", "reference", "prompt", "metadata", "width"}) {
        emit window.session()->runEvent(job, {{"type", "node_update"}, {"job_id", job},
            {"node_id", QString::fromLatin1(id)}, {"status", "completed"}});
    }
    for (const auto *id : {"generate", "agent"}) {
        emit window.session()->runEvent(job, {{"type", "node_update"}, {"job_id", job},
            {"node_id", QString::fromLatin1(id)}, {"status", "running"}});
    }
    emit window.session()->runEvent(job, {{"type", "node_progress"}, {"job_id", job},
        {"node_id", "generate"}, {"progress", 12}, {"total", 30}});
}

void startRun(EditorWindow &window) {
    const QString job = QStringLiteral("parity-job");
    emit window.session()->runSubmitted(job);
    emit window.session()->runEvent(job, {{"type", "job_update"}, {"job_id", job}, {"status", "running"}});
    showRunProgress(window, job);
}

// The toolbar shows Stop and the clock only for a run this session submitted,
// so the running capture submits one to a local server.
void startSubmittedRun(EditorWindow &window, FakeRunServer &server) {
    window.session()->connectToServer(server.url(), {});
    QTRY_VERIFY(window.session()->connected());
    QTRY_VERIFY(server.peer);
    const auto job = window.session()->run(window.document()->snapshot());
    QVERIFY(!job.isEmpty());
    server.update(job, QStringLiteral("running"));
    QTRY_VERIFY(window.runActive());
    showRunProgress(window, job);
}
} // namespace

class WindowParityTest final : public QObject {
    Q_OBJECT

private:
    QString captureDir_;

    static WorkflowGraphModel &graphModel(EditorWindow &window) {
        return static_cast<WorkflowGraphModel &>(window.scene()->graphModel());
    }

    static QtNodes::NodeId nodeId(const WorkflowGraphModel &model, const QString &resource) {
        for (const auto id : model.allNodeIds()) {
            if (model.resourceId(id) == resource) {
                return id;
            }
        }
        return QtNodes::InvalidNodeId;
    }

    static bool findText(QQuickItem *item, const QString &text) {
        if (!item || !item->isVisible()) {
            return false;
        }
        if (item->property("text").toString() == text) {
            return true;
        }
        for (auto *child : item->childItems()) {
            if (findText(child, text)) {
                return true;
            }
        }
        return false;
    }

    static void dump(EditorWindow &window) {
        auto &model = graphModel(window);
        for (const auto id : model.allNodeIds()) {
            const auto &layout = model.layout(id);
            QStringList ports;
            for (const auto y : layout.inputY) {
                ports << QString::number(y);
            }
            qInfo().noquote() << model.resourceId(id) << layout.title << layout.size << "in" << ports.join(",") << "out" << layout.outputY.size();
        }
    }

    void capture(EditorWindow &window, const QString &state, bool dark, const QSize &size) {
        if (captureDir_.isEmpty()) {
            return;
        }
        const auto name = QStringLiteral("%1-%2-%3x%4.png")
            .arg(state, dark ? QStringLiteral("dark") : QStringLiteral("light"))
            .arg(size.width())
            .arg(size.height());
        QVERIFY(window.grab().save(captureDir_ + QLatin1Char('/') + name));
    }

    // The web capture opens each state with its side panels closed, so the
    // catalog opens only for its own state.
    void prepare(EditorWindow &window, bool dark, const QSize &size, bool graph) {
        window.setDarkTheme(dark);
        window.resize(size);
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto data = fixture();
        window.setCatalog(data["metadata"].toArray());
        const auto server = qEnvironmentVariable("NODETOOL_WINDOW_PARITY_SERVER");
        if (!server.isEmpty()) {
            window.session()->connectToServer(QUrl(server), qEnvironmentVariable("NODETOOL_TOKEN"));
            QTRY_VERIFY_WITH_TIMEOUT(window.session()->connected(), 20000);
        }
        if (graph) {
            QVERIFY(window.document()->load(data["workflow"].toObject()));
            settle();
            window.fit();
        }
        if (window.catalogVisible()) {
            window.action(QStringLiteral("Toggle nodes"));
        }
        settle();
    }

private slots:
    void initTestCase() {
        QStandardPaths::setTestModeEnabled(true);
        // The web captures seed the chat window collapsed (scripts/capture-web-window-parity.mjs).
        QSettings().setValue(QStringLiteral("canvas-chat-dock/collapsed"), true);
        QVERIFY(!fixture().isEmpty());
        captureDir_ = qEnvironmentVariable("NODETOOL_WINDOW_PARITY_CAPTURE_DIR");
        if (!captureDir_.isEmpty()) {
            QVERIFY(QDir().mkpath(captureDir_));
        }
    }

    void captures_data() {
        QTest::addColumn<bool>("dark");
        QTest::addColumn<QSize>("size");
        for (const bool dark : {true, false}) {
            for (const QSize size : {QSize(1440, 900), QSize(1024, 700)}) {
                const auto tag = QStringLiteral("%1-%2").arg(dark ? "dark" : "light").arg(size.width());
                QTest::newRow(qPrintable(tag)) << dark << size;
            }
        }
    }

    // Web references are DOM measurements of the same fixture on the web
    // editor. See the whole-window comparison in docs/parity.md.
    void cardsFollowWebFieldClassification() {
        EditorWindow window;
        prepare(window, true, QSize(1440, 900), true);
        auto &model = graphModel(window);
        const auto subject = nodeId(model, QStringLiteral("subject"));
        // Web StringInput: titled by its name, one Value row, 129 tall.
        QCOMPARE(model.layout(subject).title, QStringLiteral("subject"));
        QVERIFY2(std::abs(model.layout(subject).size.height() - 129) <= 1,
                 qPrintable(QString::number(model.layout(subject).size.height())));
        QCOMPARE(model.layout(subject).inputY, QVector<double>{46});
        // Web Output: the value handle alone. Name and description stay in the inspector.
        const auto output = nodeId(model, QStringLiteral("image"));
        QCOMPARE(model.layout(output).inputY, QVector<double>{46});
        // Web Agent: the prompt, image, audio and history handles 28 apart.
        const auto agent = nodeId(model, QStringLiteral("agent"));
        auto handles = model.layout(agent).inputY;
        std::sort(handles.begin(), handles.end());
        QCOMPARE(handles.mid(0, 4), (QVector<double>{46, 74, 102, 130}));
    }

    void previewStackingFollowsDocumentOrder() {
        EditorWindow window;
        prepare(window, true, QSize(1440, 900), true);
        auto &model = graphModel(window);
        auto *width = window.scene()->nodeGraphicsObject(nodeId(model, "width"));
        auto *caption = window.scene()->nodeGraphicsObject(nodeId(model, "caption"));
        QVERIFY(width && caption);
        const auto overlap = width->sceneBoundingRect().intersected(caption->sceneBoundingRect());
        QVERIFY(!overlap.isEmpty());
        const auto ordered = window.scene()->items(overlap.center(), Qt::IntersectsItemShape, Qt::DescendingOrder);
        QVERIFY(ordered.indexOf(caption) < ordered.indexOf(width));
    }

    void stackingTracksReorderedDocumentWithThreeOverlappingCards() {
        WorkflowGraphModel model;
        EditorScene scene(model);
        const QJsonObject declaration{{"node_type", "Fixture"}, {"title", "Fixture"}};
        const QJsonArray catalog{declaration};
        QHash<QString, QtNodes::NodeId> ids;
        for (const auto &order : {QStringList{"a", "b", "c"}, QStringList{"c", "a", "b"}, QStringList{"b", "c", "a"}}) {
            QJsonArray nodes;
            for (const auto &id : order) {
                nodes.append(QJsonObject{{"id", id}, {"type", "Fixture"}});
            }
            model.project(QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}, catalog);
            for (const auto id : model.allNodeIds()) { ids.insert(model.resourceId(id), id); }
            const auto stacked = scene.items(QPointF(100, 20), Qt::IntersectsItemShape, Qt::DescendingOrder);
            for (qsizetype i = 1; i < order.size(); ++i) {
                auto *earlier = scene.nodeGraphicsObject(ids.value(order[i - 1]));
                auto *later = scene.nodeGraphicsObject(ids.value(order[i]));
                QVERIFY(stacked.contains(earlier));
                QVERIFY(stacked.contains(later));
                QVERIFY(stacked.indexOf(later) < stacked.indexOf(earlier));
            }
        }
    }

    void runStatusKeepsCardSizeAndShowsProgress() {
        for (const bool dark : {true, false}) {
            EditorWindow window;
            prepare(window, dark, QSize(1440, 900), true);
            auto &model = graphModel(window);
            const auto subject = nodeId(model, QStringLiteral("subject"));
            const auto generate = nodeId(model, QStringLiteral("generate"));
            const auto completedHeight = model.layout(subject).size.height();
            const auto runningHeight = model.layout(generate).size.height();
            startRun(window);
            settle();
            // Web: a status alone changes no card. Progress adds a 47 px band.
            QCOMPARE(model.layout(subject).size.height(), completedHeight);
            QCOMPARE(model.layout(generate).size.height(), runningHeight + 47);
            const auto size = model.layout(generate).size;
            QImage card(size, QImage::Format_ARGB32_Premultiplied);
            card.fill(Qt::transparent);
            {
                QPainter painter(&card);
                const auto position = window.scene()->nodeGraphicsObject(generate)->scenePos();
                window.scene()->render(&painter, QRectF(QPointF(), QSizeF(size)), QRectF(position, QSizeF(size)));
            }
            // 12 of 30 fills the bar to 40 percent in the web secondary color.
            const auto filled = card.pixelColor(11 + 50, size.height() - 22);
            const auto empty = card.pixelColor(size.width() - 30, size.height() - 22);
            const QColor expected(dark ? "#e879f9" : "#b13bcf");
            const auto close = [](const QColor &a, const QColor &b) {
                return std::abs(a.red() - b.red()) <= 8 && std::abs(a.green() - b.green()) <= 8
                    && std::abs(a.blue() - b.blue()) <= 8;
            };
            QVERIFY2(close(filled, expected), qPrintable(filled.name()));
            QVERIFY2(!close(empty, expected), qPrintable(empty.name()));
        }
    }

    void inspectorShowsDescriptionsAsTooltips() {
        EditorWindow window;
        prepare(window, true, QSize(1440, 900), true);
        QVERIFY(window.selectNode(QStringLiteral("agent")));
        settle();
        QString description;
        for (const auto &value : fixture()["metadata"].toArray()) {
            const auto meta = value.toObject();
            if (meta["node_type"] != "nodetool.agents.Agent") {
                continue;
            }
            for (const auto &property : meta["properties"].toArray()) {
                if (property.toObject()["name"] == "system") {
                    description = property.toObject()["description"].toString();
                }
            }
        }
        QVERIFY(!description.isEmpty());
        QQuickWidget *inspector = nullptr;
        for (auto *panel : window.findChildren<QQuickWidget *>()) {
            if (panel->source().fileName() == QStringLiteral("Inspector.qml")) {
                inspector = panel;
            }
        }
        QVERIFY(inspector);
        QTRY_VERIFY(findText(inspector->rootObject(), QStringLiteral("You write short captions.")));
        QVERIFY(!findText(inspector->rootObject(), description));
        QVERIFY(!findText(inspector->rootObject(), QStringLiteral("Using the metadata default.")));
    }

    void captures() {
        QFETCH(bool, dark);
        QFETCH(QSize, size);
        {
            EditorWindow window;
            prepare(window, dark, size, false);
            capture(window, QStringLiteral("empty"), dark, size);
        }
        EditorWindow window;
        prepare(window, dark, size, true);
        capture(window, QStringLiteral("graph"), dark, size);
        if (qEnvironmentVariableIsSet("NODETOOL_WINDOW_PARITY_DUMP")) {
            dump(window);
        }
        QVERIFY(window.selectNode(QStringLiteral("agent")));
        settle();
        QVERIFY(window.inspectorVisible());
        capture(window, QStringLiteral("selected"), dark, size);
        window.action(QStringLiteral("Clear selection"));
        window.action(QStringLiteral("Toggle nodes"));
        settle();
        QVERIFY(window.catalogVisible());
        capture(window, QStringLiteral("catalog"), dark, size);
        window.action(QStringLiteral("Toggle nodes"));
        FakeRunServer server;
        server.metadata = fixture()["metadata"].toArray();
        startSubmittedRun(window, server);
        // The web capture shows the clock one second in.
        QTest::qWait(1100);
        settle();
        if (window.outputVisible()) {
            window.action(QStringLiteral("Output"));
        }
        settle();
        capture(window, QStringLiteral("running"), dark, size);
        window.action(QStringLiteral("Output"));
        settle();
        QVERIFY(window.outputVisible());
        capture(window, QStringLiteral("output"), dark, size);
    }
};

QTEST_MAIN(WindowParityTest)
#include "WindowParityTest.moc"
