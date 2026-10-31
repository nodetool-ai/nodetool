#include "editor/EditorController.h"
#include <atomic>
#include <QFile>
#include <QLocalSocket>
#include <QTemporaryDir>
#include <QtTest>
using namespace nodetool::game;
namespace {
Json fixture() {
  return {
      {"scripts", Json::array({{{"id", "valid"}, {"source", "input=>({})"}}})},
      {"id", "game"},
      {"engine", "native-cpp-1"},
      {"schemaVersion", 4},
      {"dimension", "3d"},
      {"title", "Editor fixture"},
      {"initialSceneId", "scene"},
      {"scenes",
       Json::array(
           {{{"id", "scene"},
             {"entities",
              Json::array(
                  {{{"behaviors", Json::array({{{"id", "behavior"},
                                                {"scriptId", "valid"}}})},
                    {"id", "cube"},
                    {"name", "Cube"},
                    {"visual",
                     {{"kind", "primitive"}, {"shape", "box"}}}}})}}})}};
}
Json title(const char *value) {
  return Json::array({{{"kind", "setTitle"}, {"title", value}}});
}
} // namespace
class EditorTest final : public QObject {
  Q_OBJECT
private slots:
  void concurrentJsonSaveReports() {
    auto doc = fixture();
    doc["scripts"][0]["source"] =
        "i=>({commands:[{kind:'load',scope:'progress',slot:'missing'}]})";
    Session session(doc);
    JsonSaveHost host;
    std::atomic<bool> finished = false;
    std::atomic<bool> failed = false;
    std::jthread playback([&] {
      try {
        for (int tick = 0; tick < 300; ++tick) {
          host.step(session, Json::object());
        }
      } catch (...) {
        failed = true;
      }
      finished = true;
    });
    std::size_t snapshots = 0;
    do {
      const auto report = host.report();
      const auto &messages = report.at("diagnostics");
      QVERIFY(messages.is_array());
      QVERIFY(messages.size() <= 256);
      for (const auto &message : messages) {
        QCOMPARE(message, Json("JSON save slot is empty"));
      }
      ++snapshots;
    } while (!finished.load());
    playback.join();
    QVERIFY(!failed.load());
    QVERIFY(snapshots > 0);
    QCOMPARE(host.report().at("diagnostics").size(), std::size_t(256));
  }
  void inspectJsonSavesDuringPlayback() {
    auto doc = fixture();
    doc["scripts"][0]["source"] =
        "i=>({commands:[{kind:'load',scope:'progress',slot:'missing'}]})";
    EditorController editor;
    editor.openDocument(doc);
    QVERIFY(editor.start());
    for (int request = 0; request < 100; ++request) {
      const auto result = editor.dispatch({{"operation", "inspect"}});
      QVERIFY(result.at("jsonSaveStorage").at("diagnostics").is_array());
      QTest::qWait(1);
    }
    editor.stop();
    QVERIFY(!editor.dispatch({{"operation", "inspect"}})
                 .at("jsonSaveStorage").at("diagnostics").empty());
  }
  void committedJsonSaveStorage() {
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    for (const auto *dimension : {"2d", "3d"}) {
      auto doc = fixture();
      doc["dimension"] = dimension;
      doc["schemaVersion"] = std::string(dimension) == "2d" ? 5 : 4;
      if (std::string(dimension) == "2d") { doc["scenes"][0]["entities"][0].erase("visual"); }
      const auto source = "i=>({commands:i.input.write?[{kind:'save',scope:'progress',slot:'slot',data:{version:1,value:7}},{kind:'save',scope:'settings',slot:'slot',data:{version:1,value:2}}]:i.input.load?[{kind:'load',scope:'progress',slot:'slot'},{kind:'load',scope:'settings',slot:'slot'}]:(i.input.loaded||[]).map(r=>({kind:'score',amount:r.data?r.data.value:0}))})";
      doc["scripts"][0]["source"] = source;
      Session first(doc);
      JsonSaveHost durable(std::string("game-") + dimension, true, false, directory.path());
      durable.step(first, {{"write", true}});
      durable.drain();
      QCOMPARE(durable.report().at("persistence"), Json("durable"));
      Session reopened(doc);
      JsonSaveHost next(std::string("game-") + dimension, true, false, directory.path());
      next.step(reopened, {{"load", true}});
      next.drain();
      const auto frame = next.step(reopened, Json::object());
      QCOMPARE(frame.at("score"), Json(9));
      const auto checkpoint = reopened.snapshot();
      next.step(reopened, {{"load", true}});
      next.drain();
      reopened.restore(checkpoint);
      QCOMPARE(next.step(reopened, Json::object()).at("score"), Json(9));
      QCOMPARE(reopened.snapshot().at("document").at("scripts")[0].at("source"), Json(source));
      JsonSaveHost memory;
      Session ephemeral(doc);
      memory.step(ephemeral, {{"load", true}});
      QCOMPARE(memory.step(ephemeral, Json::object()).at("score"), Json(0));
      QCOMPARE(memory.report().at("persistence"), Json("memory"));
      QFile denied(directory.path() + "/file");
      QVERIFY(denied.open(QIODevice::WriteOnly)); denied.close();
      JsonSaveHost inaccessible("denied", true, false, denied.fileName());
      Session failed(doc);
      inaccessible.step(failed, {{"write", true}});
      inaccessible.drain();
      QVERIFY(!inaccessible.report().at("diagnostics").empty());
      QCOMPARE(failed.frame().at("tick"), Json(1));
    }
  }
  void pendingJsonSaveLoadsRespectGenerationChanges() {
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    for (const auto *dimension : {"2d", "3d"}) {
      auto doc = fixture();
      doc["dimension"] = dimension;
      doc["schemaVersion"] = std::string(dimension) == "2d" ? 5 : 4;
      if (std::string(dimension) == "2d") {
        doc["scenes"][0]["entities"][0].erase("visual");
      }
      doc["scripts"][0]["source"] =
          "i=>({commands:i.input.write?"
          "[{kind:'save',scope:'progress',slot:'slot',data:{version:1,value:7}}]:"
          "i.input.load?[{kind:'load',scope:'progress',slot:'slot'}]:"
          "(i.input.loaded||[]).map(r=>({kind:'score',amount:r.data?r.data.value:0}))})";
      for (const bool durable : {false, true}) {
        Session session(doc);
        JsonSaveHost host(std::string("generation-") + dimension, durable,
                          false, directory.path());
        host.step(session, {{"write", true}});
        host.drain();
        const auto saved = session.snapshot();
        host.step(session, {{"load", true}});
        host.drain();
        session.restore(saved);
        const auto restored = host.step(session, Json::object());
        QCOMPARE(restored.at("score"), Json(0));
        QVERIFY(restored.at("generation") > saved.at("generation"));
        QVERIFY(!host.lastInput().contains("loaded"));
        host.step(session, {{"load", true}});
        host.drain();
        QCOMPARE(host.step(session, Json::object()).at("score"), Json(7));
        QCOMPARE(host.lastInput().at("loaded").size(), std::size_t(1));
        host.step(session, {{"load", true}});
        host.drain();
        session.reload(doc);
        QCOMPARE(host.step(session, Json::object()).at("score"), Json(0));
        QVERIFY(!host.lastInput().contains("loaded"));
        host.step(session, {{"load", true}});
        host.drain();
        QCOMPARE(host.step(session, Json::object()).at("score"), Json(7));
        QCOMPARE(host.lastInput().at("loaded").size(), std::size_t(1));
      }
    }
  }
  void recordedJsonSaveLoadsReplayWithoutStorage() {
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    QFile denied(directory.path() + "/file");
    QVERIFY(denied.open(QIODevice::WriteOnly));
    denied.close();
    for (const auto *dimension : {"2d", "3d"}) {
      auto doc = fixture();
      doc["dimension"] = dimension;
      doc["schemaVersion"] = std::string(dimension) == "2d" ? 5 : 4;
      if (std::string(dimension) == "2d") {
        doc["scenes"][0]["entities"][0].erase("visual");
      }
      doc["scripts"][0]["source"] =
          "i=>({commands:i.input.write?"
          "[{kind:'save',scope:'progress',slot:'slot',data:{version:1,value:7}}]:"
          "i.input.load?[{kind:'load',scope:'progress',slot:'slot'}]:"
          "(i.input.loaded||[]).map(r=>({kind:'score',amount:r.data?r.data.value:0}))})";
      Session recorded(doc), replayed(doc);
      JsonSaveHost writer;
      JsonSaveHost replay("recorded", true, true, denied.fileName());
      const auto inputs = Json::array(
          {Json{{"write", true}}, Json{{"load", true}}, Json::object()});
      for (const auto &input : inputs) {
        const auto expected = writer.step(recorded, input);
        QCOMPARE(replay.step(replayed, writer.lastInput()), expected);
      }
      replay.drain();
      QVERIFY(writer.lastInput().contains("loaded"));
      QCOMPARE(replayed.frame().at("score"), Json(7));
      QCOMPARE(replay.report().at("replay"), Json(true));
      QVERIFY(replay.report().at("diagnostics").empty());
    }
  }
  void keyboardMovementUses2DObjectInput() {
    auto doc = fixture();
    doc["dimension"] = "2d"; doc["schemaVersion"] = 5; doc["gravity"] = {{"x", 0}, {"y", 0}};
    auto &actor = doc["scenes"][0]["entities"][0];
    actor.erase("visual"); actor["body2d"] = {{"type", "kinematic"}, {"gravityScale", 0}};
    EditorController editor;
    editor.openDocument(doc);
    QVERIFY(editor.start());
    editor.setAction("right", true);
    QVERIFY(editor.step());
    const auto moved = editor.mailbox()->latest()->at("entities")[0].at("transform").at("x").get<double>();
    QVERIFY(moved > 0);
    editor.setAction("right", false);
    QVERIFY(editor.step());
    QCOMPARE(editor.mailbox()->latest()->at("entities")[0].at("transform").at("x").get<double>(), moved);
  }
  void dimension2DTransformsAndConflicts() {
    auto doc = fixture();
    doc["dimension"] = "2d";
    doc["schemaVersion"] = 5;
    doc["scenes"][0]["entities"][0].erase("visual");
    EditorController editor;
    editor.openDocument(doc);
    editor.select("cube");
    QVERIFY(editor.is2D());
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(1.1, 2.1, 0, .25);
    QCOMPARE(editor.mailbox()
                 ->latest()
                 ->at("entities")[0]["transform"]["x"]
                 .get<double>(),
             1.0);
    QVERIFY(editor.endDrag());
    QCOMPARE(editor.document()["scenes"][0]["entities"][0]["transform"]["y"]
                 .get<double>(),
             2.0);
    QVERIFY(editor.beginDrag("rotate"));
    editor.previewDrag(.5, 0, 0, 0);
    QVERIFY(editor.endDrag());
    QCOMPARE(
        editor.document()["scenes"][0]["entities"][0]["transform"]["rotation"]
            .get<double>(),
        .5);
    QVERIFY(editor.beginDrag("scale"));
    editor.previewDrag(.5, .75, 0, 0);
    QVERIFY(editor.endDrag());
    QCOMPARE(
        editor.document()["scenes"][0]["entities"][0]["transform"]["scaleY"]
            .get<double>(),
        1.75);
    editor.navigateCamera(2, 3, 0);
    QCOMPARE(editor.mailbox()->latest()->at("camera")["x"].get<double>(), 2.0);
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(5, 0, 0, 0);
    editor.dispatch({{"operation", "transaction"},
                     {"expectedRevision", 3},
                     {"operations", title("Agent2D")}});
    QVERIFY(!editor.endDrag());
    QCOMPARE(editor.revision(), 4ULL);
    QCOMPARE(editor.document()["scenes"][0]["entities"][0]["transform"]["x"]
                 .get<double>(),
             1.0);
  }
  void transactionsAndHistory() {
    EditorController editor;
    editor.openDocument(fixture());
    editor.select("cube");
    QCOMPARE(editor.entities().size(), 1);
    QVERIFY(editor.transact(QString::fromStdString(title("Edited").dump()), 0));
    QCOMPARE(editor.revision(), 1ULL);
    QVERIFY(editor.undo());
    QCOMPARE(editor.revision(), 2ULL);
    QCOMPARE(editor.document().at("title").get<std::string>(),
             std::string("Editor fixture"));
    QVERIFY(editor.redo());
    QCOMPARE(editor.revision(), 3ULL);
  }
  void gestureCommitCancelAndConflict() {
    EditorController editor;
    editor.openDocument(fixture());
    editor.select("cube");
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(1.1, 0, 0, .25);
    QCOMPARE(editor.revision(), 0ULL);
    editor.cancelDrag();
    QCOMPARE(editor.revision(), 0ULL);
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(1.1, 0, 0, .25);
    QVERIFY(editor.endDrag());
    QCOMPARE(editor.revision(), 1ULL);
    QCOMPARE(
        editor
            .document()["scenes"][0]["entities"][0]["transform"]["position"][0]
            .get<double>(),
        1.0);
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(3, 0, 0, .25);
    editor.dispatch({{"operation", "transaction"},
                     {"expectedRevision", 1},
                     {"operations", title("Agent edit")}});
    QVERIFY(!editor.endDrag());
    QCOMPARE(editor.revision(), 2ULL);
    QCOMPARE(editor.document().at("title").get<std::string>(),
             std::string("Agent edit"));
    QVERIFY(editor.diagnostic().contains("revision", Qt::CaseInsensitive));
  }
  void saveRecoveryAndPlaySeparation() {
    QTemporaryDir dir;
    const auto path = dir.filePath("game.json");
    EditorController editor;
    editor.openDocument(fixture());
    QVERIFY(editor.save(path));
    editor.select("cube");
    QVERIFY(editor.beginDrag("translate"));
    editor.previewDrag(2, 0, 0, 0);
    QVERIFY(editor.endDrag());
    QVERIFY(editor.dirty());
    EditorController recovered;
    QVERIFY(recovered.open(path));
    QVERIFY(recovered.dirty());
    QCOMPARE(recovered.revision(), 1ULL);
    QVERIFY(recovered.start());
    const auto before = recovered.document();
    QVERIFY(recovered.step());
    recovered.stop();
    QVERIFY(recovered.document() == before);
    QVERIFY(recovered.save());
    EditorController reopened;
    QVERIFY(reopened.open(path));
    QCOMPARE(reopened.revision(), 1ULL);
    QVERIFY(!reopened.dirty());
  }
  void scriptsFailWithoutLosingDraft() {
    EditorController editor;
    editor.openDocument(fixture());
    QVERIFY(!editor.editScript("broken", "({ not valid"));
    QCOMPARE(editor.revision(), 0ULL);
    QVERIFY(!editor.diagnostic().isEmpty());
    QVERIFY(editor.editScript(
        "valid", "({onUpdate(input){return {state:input.state};}})"));
    QCOMPARE(editor.revision(), 1ULL);
    QVERIFY(editor.start());
    QVERIFY(editor.editScript(
        "valid", "({onUpdate(input){throw Error('visible failure');}})"));
    QVERIFY(!editor.step());
    QVERIFY(editor.diagnostic().contains("visible failure"));
    QVERIFY(editor.dirty());
  }
  void externalSaveConflictAndMissingAsset() {
    QTemporaryDir dir;
    const auto path = dir.filePath("game.json");
    EditorController editor;
    editor.openDocument(fixture());
    QVERIFY(editor.save(path));
    QVERIFY(editor.transact(QString::fromStdString(title("Local").dump()), 0));
    auto foreign = editor.document();
    foreign["title"] = "External";
    QFile file(path);
    QVERIFY(file.open(QIODevice::WriteOnly));
    file.write(QByteArray::fromStdString(foreign.dump()));
    file.close();
    QVERIFY(!editor.save());
    QVERIFY(editor.diagnostic().contains("externally"));
    auto doc = fixture();
    doc["assets"] = Json::array({{{"id", "model"},
                                  {"kind", "model"},
                                  {"path", "missing.gltf"},
                                  {"digest", std::string(64, '0')},
                                  {"size", 1}}});
    editor.openDocument(doc, path);
    QTRY_VERIFY_WITH_TIMEOUT(!editor.diagnostic().isEmpty(), 2000);
  }
  void agentEditProtectsLocalHistory() {
    EditorController editor;
    editor.openDocument(fixture());
    QVERIFY(editor.transact(QString::fromStdString(title("Local").dump()), 0));
    editor.dispatch({{"operation", "transaction"},
                     {"expectedRevision", 1},
                     {"operations", title("Agent")}});
    QVERIFY(!editor.undo());
    QCOMPARE(editor.revision(), 2ULL);
    QVERIFY_EXCEPTION_THROWN(
        editor.dispatch({{"operation", "inspect"}, {"documentId", "another"}}),
        Error);
  }
  void liveSocketSharesRevision() {
    EditorController editor;
    editor.openDocument(fixture());
    const auto name = "nodetool-editor-test-" +
                      QString::number(QCoreApplication::applicationPid());
    QVERIFY(editor.listen(name));
    QLocalSocket socket;
    socket.connectToServer(name);
    QVERIFY(socket.waitForConnected());
    const auto request = Json{{"requestId", "external"},
                              {"operation", "transaction"},
                              {"expectedRevision", 0},
                              {"operations", title("Socket edit")}};
    socket.write(QByteArray::fromStdString(request.dump()) + '\n');
    socket.flush();
    QTRY_VERIFY_WITH_TIMEOUT(socket.bytesAvailable() > 0, 2000);
    const auto response = Json::parse(socket.readAll().toStdString());
    QCOMPARE(response.at("status").get<std::string>(), std::string("ok"));
    QCOMPARE(editor.revision(), 1ULL);
    QVERIFY(
        !editor.transact(QString::fromStdString(title("Stale UI").dump()), 0));
    QCOMPARE(editor.document().at("title").get<std::string>(),
             std::string("Socket edit"));
  }
};
QTEST_MAIN(EditorTest)
#include "EditorTest.moc"
