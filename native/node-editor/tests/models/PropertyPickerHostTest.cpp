#include "ui/EditorWindow.h"
#include "graph/WorkflowGraphModel.h"
#include <QBuffer>
#include <QDir>
#include <QImage>
#include <QQuickWidget>
#include <QQuickItem>
#include <QtTest>
using namespace nodetool;
class PropertyPickerHostTest final : public QObject {
 Q_OBJECT
private:
 static QQuickItem* findItem(QQuickItem* root, const QString& name) {
  if (root->objectName() == name) return root;
  for (auto* child : root->childItems()) { if (auto* found = findItem(child, name)) return found; }
  return nullptr;
 }
 static QString image(const QColor& color) {
  QImage image(320, 100, QImage::Format_ARGB32); image.fill(color);
  QByteArray bytes; QBuffer buffer(&bytes); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
  return "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
 }
 static QQuickWidget* inspector(EditorWindow& window) {
  for (auto* panel : window.findChildren<QQuickWidget*>()) { if (panel->source().toString().contains("Inspector")) return panel; }
  return nullptr;
 }
 static void typeInto(QQuickWidget* panel, QQuickItem* field, const QString& value) {
  const auto name = field->objectName();
  panel->window()->activateWindow();
  panel->quickWindow()->requestActivate();
  panel->setFocus(); QCoreApplication::processEvents();
  field = findItem(panel->rootObject(), name); QVERIFY(field);
  field->forceActiveFocus();
  QTRY_VERIFY(field->hasActiveFocus());
  QTest::keyClick(panel->quickWindow(), Qt::Key_A, Qt::ControlModifier);
  for (const auto character : value.toLatin1()) { QTest::keyClick(panel->quickWindow(), character); }
  QTRY_COMPARE(field->property("text").toString(), value);
  QTest::keyClick(panel->quickWindow(), Qt::Key_Return);
 }
private slots:
 void colorAndImageSizeAcceptance() {
  EditorWindow window;
  const QJsonObject colorType{{"type", "color"}}, sizeType{{"type", "image_size"}};
  const QJsonObject colorProperty{{"name", "value"}, {"title", "Color"}, {"type", colorType}, {"default", QJsonObject{{"type", "color"}, {"value", "#60A5FA"}}}};
  const QJsonObject sizeProperty{{"name", "value"}, {"title", "Image dimensions"}, {"type", sizeType}, {"default", QJsonObject{{"width", 1024}, {"height", 1024}}}};
  window.setCatalog({QJsonObject{{"node_type", "fixture.Color"}, {"title", "Color"}, {"properties", QJsonArray{colorProperty}}}, QJsonObject{{"node_type", "fixture.Size"}, {"title", "Image size"}, {"properties", QJsonArray{sizeProperty}}}, QJsonObject{{"node_type", "fixture.Source"}, {"title", "Source"}, {"properties", QJsonArray{}}, {"outputs", QJsonArray{QJsonObject{{"name", "color"}, {"type", colorType}}, QJsonObject{{"name", "size"}, {"type", sizeType}}}}}});
  const QJsonObject colorNode{{"id", "color"}, {"type", "fixture.Color"}, {"data", QJsonObject{}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 200}, {"y", 200}}}}}};
  const QJsonObject sizeNode{{"id", "size"}, {"type", "fixture.Size"}, {"data", QJsonObject{}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 550}, {"y", 200}}}}}};
  const QJsonObject snapshot{{"name", "Color and dimensions acceptance"}, {"graph", QJsonObject{{"nodes", QJsonArray{colorNode, sizeNode}}, {"edges", QJsonArray{}}}}};
  QVERIFY(window.document()->load(snapshot)); window.resize(1460, 1000); window.show(); QCoreApplication::processEvents(); window.fit();
  QVERIFY(window.selectNode("color")); auto* panel = inspector(window); QVERIFY(panel);
  QTRY_VERIFY(findItem(panel->rootObject(), "color-hex-value"));
  auto* hex = findItem(panel->rootObject(), "color-hex-value");
  typeInto(panel, hex, "#12345680");
  QTRY_COMPARE(window.document()->node("color").value("data").toObject().value("value").toObject().value("value").toString(), "#12345680");
  QCOMPARE(window.document()->undoStack()->count(), 1); window.document()->undo(); QVERIFY(!window.document()->node("color").value("data").toObject().contains("value")); window.document()->redo(); QCoreApplication::processEvents();
  auto* colorEditor = findItem(panel->rootObject(), "color-editor-value"); QVERIFY(colorEditor);
  auto* dialog = colorEditor->findChild<QObject*>("color-dialog-value"); QVERIFY(dialog);
  auto* customButton = findItem(panel->rootObject(), "color-custom-value"); QVERIFY(customButton);
  auto clickCustom = [&] { const auto position = customButton->mapToScene(QPointF(customButton->width() / 2, customButton->height() / 2)); QTest::mouseClick(panel->quickWindow(), Qt::LeftButton, Qt::NoModifier, position.toPoint()); };
  clickCustom(); QTRY_VERIFY(dialog->property("visible").toBool());
  QCOMPARE(dialog->property("parentWindow").value<QObject*>(), panel->quickWindow());
  const auto beforeCancel = window.document()->snapshot();
  dialog->setProperty("selectedColor", QColor::fromRgbF(1, 0, 0, 0.5)); QVERIFY(QMetaObject::invokeMethod(dialog, "reject"));
  QTRY_VERIFY(!dialog->property("visible").toBool());
  QCOMPARE(window.document()->snapshot(), beforeCancel);
  QCOMPARE(window.document()->undoStack()->count(), 1);
  clickCustom(); QTRY_VERIFY(dialog->property("visible").toBool()); dialog->setProperty("selectedColor", QColor::fromRgbF(1, 0, 0, 0.5)); QVERIFY(QMetaObject::invokeMethod(dialog, "accept"));
  QTRY_COMPARE(window.document()->node("color").value("data").toObject().value("value").toObject().value("value").toString(), "#ff000080");
  QCOMPARE(window.document()->undoStack()->count(), 2);
  QTRY_VERIFY(!dialog->property("visible").toBool());
  window.document()->undo();
  QTRY_COMPARE(window.document()->node("color").value("data").toObject().value("value").toObject().value("value").toString(), "#12345680");
  QTRY_VERIFY(findItem(panel->rootObject(), "color-hex-value") && findItem(panel->rootObject(), "color-hex-value")->property("value").toString() == "#12345680");
  window.document()->redo();
  QTRY_COMPARE(window.document()->node("color").value("data").toObject().value("value").toObject().value("value").toString(), "#ff000080");
  QTRY_VERIFY(findItem(panel->rootObject(), "color-hex-value") && findItem(panel->rootObject(), "color-hex-value")->property("value").toString() == "#ff000080");
  hex = findItem(panel->rootObject(), "color-hex-value"); QVERIFY(hex);
  typeInto(panel, hex, "invalid"); QCOMPARE(window.document()->undoStack()->count(), 2); QTest::keyClick(panel->quickWindow(), Qt::Key_Escape);
  QVERIFY(window.selectNode("size")); QCoreApplication::processEvents(); QTRY_VERIFY(findItem(panel->rootObject(), "image-width-value"));
  typeInto(panel, findItem(panel->rootObject(), "image-width-value"), "777");
  QTRY_COMPARE(window.document()->node("size").value("data").toObject().value("value").toObject().value("width").toInt(), 777);
  QCOMPARE(window.document()->undoStack()->count(), 3);
  auto* lockedSize = findItem(panel->rootObject(), "image-size-editor-value"); QVERIFY(lockedSize);
  QVERIFY(QMetaObject::invokeMethod(lockedSize, "toggleLock")); QVERIFY(lockedSize->property("locked").toBool());
  typeInto(panel, findItem(panel->rootObject(), "image-width-value"), "200");
  QTRY_COMPARE(window.document()->node("size").value("data").toObject().value("value").toObject().value("height").toInt(), 264);
  QTRY_VERIFY(findItem(panel->rootObject(), "image-size-editor-value"));
  QVERIFY(findItem(panel->rootObject(), "image-size-editor-value")->property("locked").toBool());
  const auto persisted = window.document()->snapshot(); node_editor::WorkflowDocument reopened; QVERIFY(reopened.load(persisted)); QCOMPARE(reopened.node("size").value("data"), window.document()->node("size").value("data"));
  const auto output = qEnvironmentVariable("NODETOOL_PROPERTY_CAPTURE_DIR"); if (!output.isEmpty()) QVERIFY(QDir().mkpath(output));
  for (const auto& theme : {QString("dark"), QString("light")}) {
   window.setDarkTheme(theme == "dark");
   for (auto width : {1460, 860}) {
    window.resize(width, 1000); QCoreApplication::processEvents(); window.fit();
    for (const auto& family : {QString("color"), QString("size")}) {
     QVERIFY(window.selectNode(family)); QCoreApplication::processEvents(); QTest::qWait(80);
     const auto name = family == "color" ? "color-editor-value" : "image-size-editor-value"; QVERIFY(findItem(panel->rootObject(), name));
     if (!output.isEmpty()) QVERIFY(window.grab().save(QDir(output).filePath(QString("%1-%2-%3.png").arg(family, theme).arg(width))));
    }
   }
  }
  // The inspector follows the selection in the next pass.
  QVERIFY(window.selectNode("color")); QTRY_VERIFY((hex = findItem(panel->rootObject(), "color-hex-value")));
  QVERIFY(QMetaObject::invokeMethod(hex, "textEdited")); hex->setProperty("text", "#ff0000");
  const QPointer<QQuickItem> staleHex = hex;
  QVERIFY(window.document()->load(snapshot)); if (staleHex) QVERIFY(QMetaObject::invokeMethod(staleHex, "valueCommitted", Q_ARG(QString, "#ff0000"))); QCoreApplication::processEvents();
  QCOMPARE(window.document()->undoStack()->count(), 0); QVERIFY(!window.document()->node("color").value("data").toObject().contains("value"));
  auto graph = snapshot.value("graph").toObject(); auto nodes = graph.value("nodes").toArray(); nodes.append(QJsonObject{{"id", "source"}, {"type", "fixture.Source"}, {"data", QJsonObject{}}}); graph.insert("nodes", nodes);
  graph.insert("edges", QJsonArray{QJsonObject{{"source", "source"}, {"sourceHandle", "color"}, {"target", "color"}, {"targetHandle", "value"}}, QJsonObject{{"source", "source"}, {"sourceHandle", "size"}, {"target", "size"}, {"targetHandle", "value"}}});
  QVERIFY(window.document()->load({{"graph", graph}}));
  for (const auto& family : {QString("color"), QString("size")}) { QVERIFY(window.selectNode(family)); const auto name = family == "color" ? "color-editor-value" : "image-size-editor-value"; QTRY_VERIFY(findItem(panel->rootObject(), name) && !findItem(panel->rootObject(), name)->property("writable").toBool()); }
  graph = snapshot.value("graph").toObject(); graph.insert("edges", QJsonArray{QJsonObject{{"source", "missing"}, {"sourceHandle", "out"}, {"target", "color"}, {"targetHandle", "value"}}}); QVERIFY(window.document()->load({{"graph", graph}})); QVERIFY(window.readOnly());
  QVERIFY(window.selectNode("size")); QCoreApplication::processEvents(); QTRY_VERIFY(findItem(panel->rootObject(), "image-size-editor-value")); QVERIFY(!findItem(panel->rootObject(), "image-size-editor-value")->property("writable").toBool());
 }
 void assetAndPathDialogsOpenAndCancel_data() {
  QTest::addColumn<QString>("kind");
  for (const auto& kind : {QString("asset"), QString("file_path"), QString("folder_path")}) { QTest::newRow(qPrintable(kind)) << kind; }
 }
 void assetAndPathDialogsOpenAndCancel() {
  QFETCH(QString, kind);
  EditorWindow window;
  window.setCatalog({QJsonObject{{"node_type", "fixture.Dialog"}, {"title", "Dialog"}, {"properties", QJsonArray{QJsonObject{{"name", "value"}, {"type", QJsonObject{{"type", kind}}}}}}}});
  QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "dialog"}, {"type", "fixture.Dialog"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}}));
  window.resize(1460, 1000); window.show(); QVERIFY(window.selectNode("dialog"));
  auto* panel = inspector(window); QVERIFY(panel);
  const auto buttonName = kind == "asset" ? "asset-upload-value" : "path-browse-value";
  QQuickItem* button = nullptr;
  QTRY_VERIFY((button = findItem(panel->rootObject(), buttonName)) && button->isVisible() && button->isEnabled());
  const auto before = window.document()->snapshot();
  const auto expectedTitle = kind == "asset" ? "Upload asset" : kind == "file_path" ? "Select file" : "Select folder";
  QObject* dialog = nullptr;
  auto* editor = findItem(panel->rootObject(), kind == "asset" ? "asset-editor-value" : "path-editor-value");
  QVERIFY(editor);
  for (auto* object : editor->findChildren<QObject*>()) { if (object->property("title").toString() == expectedTitle && object->metaObject()->indexOfProperty("visible") >= 0) { dialog = object; break; } }
  QVERIFY(dialog);
  QTest::mouseClick(panel, Qt::LeftButton, Qt::NoModifier, button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
  QTRY_VERIFY(dialog->property("visible").toBool());
  QCOMPARE(dialog->property("parentWindow").value<QObject*>(), panel->quickWindow());
  QVERIFY(QMetaObject::invokeMethod(dialog, "reject"));
  QTRY_VERIFY(!dialog->property("visible").toBool());
  QCOMPARE(window.document()->snapshot(), before);
  QCOMPARE(window.document()->undoStack()->count(), 0);
 }
 void stableSlotsAndCredentialIsolation() {
  EditorWindow window;
  const QJsonObject sizeType{{"type", "image_size"}}, colorType{{"type", "color"}}, textType{{"type", "str"}};
  const auto property = [](QString name, QJsonObject type, QJsonValue value) { return QJsonObject{{"name", name}, {"type", type}, {"default", value}}; };
  const auto first = property("first", sizeType, QJsonObject{{"width", 1000}, {"height", 500}});
  const auto second = property("second", sizeType, QJsonObject{{"width", 640}, {"height", 480}});
  const auto color = property("color", colorType, QJsonObject{{"type", "color"}, {"value", "#fff"}});
  const auto caption = property("caption", textType, "baseline");
  const auto metadata = [](const QJsonArray& fields) { return QJsonArray{QJsonObject{{"node_type", "fixture.Fields"}, {"title", "Stable fields"}, {"properties", fields}}}; };
  window.setCatalog(metadata({first, second, color, caption}));
  QVERIFY(window.document()->load({{"graph", QJsonObject{{"nodes", QJsonArray{QJsonObject{{"id", "n"}, {"type", "fixture.Fields"}, {"data", QJsonObject{}}}}}, {"edges", QJsonArray{}}}}}));
  window.resize(1460, 1000); window.show(); QCoreApplication::processEvents(); QVERIFY(window.selectNode("n")); QCoreApplication::processEvents();
  auto* panel = inspector(window); QVERIFY(panel); QTRY_VERIFY(findItem(panel->rootObject(), "image-size-editor-first"));
  auto* editor = findItem(panel->rootObject(), "image-size-editor-first"); QVERIFY(QMetaObject::invokeMethod(editor, "toggleLock")); QVERIFY(editor->property("locked").toBool());
  QVERIFY(QMetaObject::invokeMethod(editor, "setDimension", Q_ARG(QVariant, "width"), Q_ARG(QVariant, 200)));
  window.setCatalog(metadata({second, first, color, caption}));
  QCoreApplication::processEvents(); QCOMPARE(window.document()->undoStack()->count(), 0);
  QTRY_VERIFY(findItem(panel->rootObject(), "image-size-editor-second"));
  QVERIFY(!findItem(panel->rootObject(), "image-size-editor-second")->property("locked").toBool());
  window.setCatalog(metadata({first, second, color, caption})); QCoreApplication::processEvents();
  QCOMPARE(window.document()->undoStack()->count(), 0);
  auto* widthDraft = findItem(panel->rootObject(), "image-width-first"); QVERIFY(widthDraft);
  QVERIFY(QMetaObject::invokeMethod(widthDraft, "begin")); widthDraft->setProperty("text", "999");
  window.setCatalog(metadata({second, first, color, caption})); QCoreApplication::processEvents();
  auto* substituted = findItem(panel->rootObject(), "image-width-second"); QVERIFY(substituted); QVERIFY(!substituted->property("editing").toBool()); QCOMPARE(substituted->property("text").toString(), "640");
  window.setCatalog(metadata({first, second, color, caption})); QCoreApplication::processEvents();
  const auto invalidateCredentials = [&] { emit window.session()->credentialsChanged(QUrl{}, QString{}, "different-account"); QCoreApplication::processEvents(); };
  auto* colorEditor = findItem(panel->rootObject(), "color-editor-color"); QVERIFY(colorEditor);
  QVERIFY(QMetaObject::invokeMethod(colorEditor, "choose", Q_ARG(QVariant, "#ff0000"))); invalidateCredentials(); QCOMPARE(window.document()->undoStack()->count(), 0);
  editor = findItem(panel->rootObject(), "image-size-editor-first"); QVERIFY(editor);
  QVERIFY(QMetaObject::invokeMethod(editor, "setDimension", Q_ARG(QVariant, "width"), Q_ARG(QVariant, 200))); invalidateCredentials(); QCOMPARE(window.document()->undoStack()->count(), 0);
  auto* text = findItem(panel->rootObject(), "property-caption"); QVERIFY(text);
  QVERIFY(QMetaObject::invokeMethod(text, "editStarted")); QVERIFY(QMetaObject::invokeMethod(text, "valueCommitted", Q_ARG(QString, "queued caption"))); invalidateCredentials(); QCOMPARE(window.document()->undoStack()->count(), 0);
  QVERIFY(window.document()->node("n").value("data").toObject().isEmpty());
 }
 void populatedInspectorCaptures() {
  EditorWindow window;
  const QJsonObject imageType{{"type", "image"}};
  const QJsonObject listType{{"type", "list"}, {"type_args", QJsonArray{imageType}}};
  const QJsonObject listProperty{{"name", "images"}, {"title", "Reference images"}, {"type", listType}, {"required", true}};
  const QJsonObject assetProperty{{"name", "file"}, {"title", "Custom file"}, {"type", QJsonObject{{"type", "asset"}}}, {"required", true}};
  window.setCatalog({QJsonObject{{"node_type", "fixture.MediaList"}, {"title", "Image references"}, {"properties", QJsonArray{listProperty}}}, QJsonObject{{"node_type", "fixture.Asset"}, {"title", "Custom asset"}, {"properties", QJsonArray{assetProperty}}}});
  const QJsonArray refs{QJsonObject{{"type", "image"}, {"uri", image(QColor("#3d68a8"))}, {"metadata", QJsonObject{{"note", "Retained reference metadata"}}}}, QJsonObject{{"type", "image"}, {"uri", image(QColor("#50b8a0"))}}};
  const QJsonArray nodes{QJsonObject{{"id", "media"}, {"type", "fixture.MediaList"}, {"data", QJsonObject{{"images", refs}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 200}, {"y", 200}}}}}}, QJsonObject{{"id", "asset"}, {"type", "fixture.Asset"}, {"data", QJsonObject{{"file", QJsonObject{{"type", "asset"}, {"uri", "asset://abcdef0123456789abcdef0123456789"}, {"asset_id", "abcdef0123456789abcdef0123456789"}}}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 550}, {"y", 200}}}}}}};
  QVERIFY(window.document()->load(QJsonObject{{"name", "Property picker acceptance"}, {"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{}}}}}));
  auto* model = window.findChild<WorkflowGraphModel*>(); QVERIFY(model);
  QHash<QString, QPointF> projected;
  for (auto id : model->allNodeIds()) { projected.insert(model->resourceId(id), model->nodeData(id, QtNodes::NodeRole::Position).toPointF()); }
  QCOMPARE(projected.value("media"), QPointF(200, 200));
  QCOMPARE(projected.value("asset"), QPointF(550, 200));
  QVERIFY(projected.value("media") != projected.value("asset"));
  const auto output = qEnvironmentVariable("NODETOOL_PROPERTY_CAPTURE_DIR");
  if (!output.isEmpty()) QVERIFY(QDir().mkpath(output));
  for (const auto& theme : {QString("dark"), QString("light")}) {
   window.setDarkTheme(theme == "dark");
   for (const auto width : {1460, 860}) {
    window.resize(width, 1000); window.show();
    QCoreApplication::processEvents(); window.fit();
    for (const auto& family : {QString("media"), QString("asset")}) {
     QVERIFY(window.selectNode(family));
     QQuickWidget* inspector = nullptr;
     for (auto* panel : window.findChildren<QQuickWidget*>()) { if (panel->source().toString().contains("Inspector")) inspector = panel; }
     QVERIFY(inspector); QTRY_VERIFY(inspector->rootObject());
     const auto name = family == "media" ? "media-list-editor-images" : "asset-editor-file";
     QTRY_VERIFY(findItem(inspector->rootObject(), name));
     QTest::qWait(80);
     QVERIFY(!window.readOnly());
     if (!output.isEmpty()) QVERIFY(window.grab().save(QDir(output).filePath(QString("%1-%2-%3.png").arg(family, theme).arg(width))));
    }
   }
  }
 }
};
QTEST_MAIN(PropertyPickerHostTest)
#include "PropertyPickerHostTest.moc"
