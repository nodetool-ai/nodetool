#include "graph/EditorScene.h"
#include "graph/WorkflowGraphModel.h"
#include "document/WorkflowDocument.h"
#include "run/NodeRuntimeModel.h"
#include <QGraphicsView>
#include <QSignalSpy>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtTest>
using namespace nodetool;
using namespace nodetool::node_editor;
using namespace QtNodes;
// The card warnings BaseNode.tsx draws above a node's body: ApiKeyValidation
// for a provider node without its key and InputNodeNameWarning for an input
// node whose name is empty or shared. Also NodeErrors' Report control on a
// failed card.
namespace {
QJsonArray catalog() {
  const QJsonObject str{{"type", "str"}};
  return {
      QJsonObject{{"node_type", "openai.text.Summarize"}, {"namespace", "openai.text"}, {"title", "Summarize"},
                  {"properties", QJsonArray{QJsonObject{{"name", "text"}, {"type", str}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", str}}}}},
      QJsonObject{{"node_type", "nodetool.input.StringInput"}, {"namespace", "nodetool.input"}, {"title", "String Input"},
                  {"properties", QJsonArray{QJsonObject{{"name", "name"}, {"type", str}}, QJsonObject{{"name", "value"}, {"type", str}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", str}}}}},
      QJsonObject{{"node_type", "custom.audio.Speak"}, {"namespace", "custom.audio"}, {"title", "Speak"},
                  {"required_settings", QJsonArray{"REPLICATE_API_TOKEN", "HF_TOKEN", "COMFY_URL"}},
                  {"properties", QJsonArray{QJsonObject{{"name", "text"}, {"type", str}}}},
                  {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", str}}}}}};
}
QJsonObject node(const QString &id, const QString &type, const QJsonObject &data, double x) {
  return {{"id", id}, {"type", type}, {"data", data}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", x}, {"y", 0}}}}}};
}
QJsonObject workflow(const QString &secondName, bool speak) {
  QJsonArray nodes{node("llm", "openai.text.Summarize", {}, 0),
                   node("first", "nodetool.input.StringInput", {{"name", "prompt"}}, 300),
                   node("second", "nodetool.input.StringInput", {{"name", secondName}}, 600)};
  if (speak) { nodes.append(node("speak", "custom.audio.Speak", {}, 900)); }
  return {{"id", "wf"}, {"name", "Warnings"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}};
}
struct Fixture {
  WorkflowDocument document;
  WorkflowGraphModel model;
  EditorScene scene{model};
  explicit Fixture(const QString &secondName, bool speak = false) {
    document.setNodeMetadata(catalog());
    if (!document.load(workflow(secondName, speak))) { qFatal("fixture workflow does not load"); }
    model.commit = [this](const QJsonObject &command) {
      const auto result = document.applyCommand(command);
      if (result) { model.project(document.snapshot(), catalog()); }
      return bool(result);
    };
    model.project(document.snapshot(), catalog());
  }
  NodeId id(const QString &resource) const {
    for (const auto node : model.allNodeIds()) { if (model.resourceId(node) == resource) { return node; } }
    return InvalidNodeId;
  }
  QStringList warnings(const QString &resource) const {
    QStringList result;
    for (const auto &row : model.layout(id(resource)).rows) {
      if (row.warning) { result.append(row.label); }
    }
    return result;
  }
};
} // namespace

class CardWarningTest : public QObject {
  Q_OBJECT
private slots:
  void missingKeyWarnsOnceSecretsLoad() {
    Fixture f(QStringLiteral("other"));
    // Before the secrets load nothing warns, as useApiKeyValidation while loading.
    QVERIFY(f.warnings("llm").isEmpty());
    const auto before = f.model.layout(f.id("llm")).size.height();
    QSignalSpy updated(&f.model, &WorkflowGraphModel::nodeUpdated);
    f.model.setConfiguredSecrets({QStringLiteral("FAL_API_KEY")}, true);
    QCOMPARE(f.warnings("llm"), (QStringList{"OpenAI API Key is missing!", "Connect provider"}));
    QVERIFY(f.model.layout(f.id("llm")).size.height() > before);
    // Only the gated card is rebuilt.
    QCOMPARE(updated.size(), 1);
    QVERIFY(f.warnings("first").isEmpty());
    f.model.setConfiguredSecrets({QStringLiteral("OPENAI_API_KEY")}, true);
    QVERIFY(f.warnings("llm").isEmpty());
    QCOMPARE(f.model.layout(f.id("llm")).size.height(), before);
  }
  void connectProviderNamesTheSecret() {
    Fixture f(QStringLiteral("other"));
    f.model.setConfiguredSecrets({}, true);
    QSignalSpy requested(&f.scene, &EditorScene::providerConnectRequested);
    auto *item = f.scene.nodeGraphicsObject(f.id("llm"));
    QVERIFY(item);
    QRectF button;
    for (const auto &row : f.model.layout(f.id("llm")).rows) {
      if (row.action == QStringLiteral("connectProvider")) { button = row.rect; }
    }
    QVERIFY(!button.isEmpty());
    QGraphicsView view(&f.scene);
    view.resize(1200, 600);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    const auto point = view.mapFromScene(item->mapToScene(button.center()));
    QTest::mouseClick(view.viewport(), Qt::LeftButton, {}, point);
    QTRY_COMPARE(requested.size(), 1);
    QCOMPARE(requested.first().first().toString(), QStringLiteral("OPENAI_API_KEY"));
  }
  void inputNamesMustBeSetAndUnique() {
    Fixture duplicate(QStringLiteral("prompt"));
    QCOMPARE(duplicate.warnings("first"), QStringList{"Duplicate name"});
    QCOMPARE(duplicate.warnings("second"), QStringList{"Duplicate name"});
    // Renaming one input clears the warning on the other.
    QVERIFY(duplicate.model.commit(duplicate.model.propertyCommand(duplicate.id("second"), QStringLiteral("name"), QJsonValue(QStringLiteral("style")))));
    QVERIFY(duplicate.warnings("first").isEmpty());
    QVERIFY(duplicate.warnings("second").isEmpty());
    Fixture empty(QStringLiteral("  "));
    QCOMPARE(empty.warnings("second"), QStringList{"Name required"});
    QVERIFY(empty.warnings("first").isEmpty());
  }
  void requiredSecretSettingsWarn() {
    Fixture f(QStringLiteral("other"), true);
    // COMFY_URL is not a secret the server lists, so only the secrets warn, as
    // one sentence with one settings button.
    const QStringList secrets{"REPLICATE_API_TOKEN", "HF_TOKEN", "OPENAI_API_KEY"};
    f.model.setConfiguredSecrets({}, true, secrets);
    QCOMPARE(f.warnings("speak"), (QStringList{"Required settings REPLICATE_API_TOKEN, HF_TOKEN are not configured!", "Configure in settings"}));
    f.model.setConfiguredSecrets({QStringLiteral("HF_TOKEN")}, true, secrets);
    QCOMPARE(f.warnings("speak"), (QStringList{"Required setting REPLICATE_API_TOKEN is not configured!", "Configure in settings"}));
    f.model.setConfiguredSecrets({QStringLiteral("HF_TOKEN"), QStringLiteral("REPLICATE_API_TOKEN")}, true, secrets);
    QVERIFY(f.warnings("speak").isEmpty());
  }
  void failedCardOffersReport() {
    Fixture f(QStringLiteral("other"));
    node_editor::NodeRuntimeModel runtime;
    f.model.setRuntimeModel(&runtime);
    runtime.beginRun(QStringLiteral("job"));
    runtime.ingest(QStringLiteral("job"), {{"type", "node_update"}, {"job_id", "job"}, {"node_id", "llm"}, {"status", "error"}, {"error", "Model refused"}});
    QSignalSpy requested(&f.scene, &EditorScene::errorReportRequested);
    auto *item = f.scene.nodeGraphicsObject(f.id("llm"));
    QVERIFY(item);
    QGraphicsView view(&f.scene);
    view.resize(1200, 600);
    view.show();
    QVERIFY(QTest::qWaitForWindowExposed(&view));
    const auto size = f.model.layout(f.id("llm")).size;
    // The control sits at the card's bottom left, across from the status label.
    const auto point = view.mapFromScene(item->mapToScene(QPointF(24, size.height() - 10)));
    QTest::mouseClick(view.viewport(), Qt::LeftButton, {}, point);
    QTRY_COMPARE(requested.size(), 1);
    QCOMPARE(requested.first().first().toString(), QStringLiteral("llm"));
    // A card that ran cleanly has no Report control.
    runtime.beginRun(QStringLiteral("next"));
    runtime.ingest(QStringLiteral("next"), {{"type", "node_update"}, {"job_id", "next"}, {"node_id", "llm"}, {"status", "completed"}});
    QCOMPARE(f.model.runtimeState(f.id("llm"))["status"].toString(), QStringLiteral("completed"));
    QTest::mouseClick(view.viewport(), Qt::LeftButton, {}, point);
    QTest::qWait(50);
    QCOMPARE(requested.size(), 1);
  }
};
QTEST_MAIN(CardWarningTest)
#include "CardWarningTest.moc"
