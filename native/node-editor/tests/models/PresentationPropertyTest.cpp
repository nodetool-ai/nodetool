#include "properties/PropertyFields.h"
#include "document/WorkflowDocument.h"
#include <QtTest>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QJSValue>
#include <QFile>
#include <QColor>
#include <memory>
using namespace nodetool::node_editor;
class PresentationPropertyTest final : public QObject {
 Q_OBJECT
 static QVariant unpack(const QVariant& value) { return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant() : value; }
 static std::unique_ptr<QObject> editor(QQmlComponent& component, const QString& kind, const QVariant& value) {
  return std::unique_ptr<QObject>(component.createWithInitialProperties({{"descriptor", QVariantMap{{"name", "value"}, {"kind", kind}}}, {"value", value}, {"writable", true}}));
 }
private slots:
 void colors() {
  QQmlEngine engine; QQmlComponent component(&engine, QUrl("qrc:/editor/ColorPropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading); QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  auto item = editor(component, "color", "#123456"); QVERIFY2(item, qPrintable(component.errorString()));
  QSignalSpy committed(item.get(), SIGNAL(valueCommitted(QVariant)));
  QVERIFY(QMetaObject::invokeMethod(item.get(), "choose", Q_ARG(QVariant, "#50FA7B"))); QCOMPARE(committed.count(), 1);
  QCOMPARE(unpack(committed.last().first()).toMap().value("type").toString(), "color");
  item->setProperty("value", QVariantMap{{"type", "color"}, {"value", "#abcdef"}, {"future", 7}});
  QVERIFY(QMetaObject::invokeMethod(item.get(), "choose", Q_ARG(QVariant, QVariant::fromValue(QJSValue(QJSValue::NullValue))))); QCOMPARE(committed.count(), 2);
  const auto empty = unpack(committed.last().first()).toMap(); QVERIFY(empty.value("value").isNull()); QCOMPARE(empty.value("future").toInt(), 7);
  QVariant alpha;
  QVERIFY(QMetaObject::invokeMethod(item.get(), "customColor", Q_RETURN_ARG(QVariant, alpha), Q_ARG(QVariant, QColor::fromRgbF(1, 0.5, 0, 0.5)))); QCOMPARE(alpha.toString(), "#ff800080");
  auto* hex = item->findChild<QObject*>("color-hex-value"); QVERIFY(hex);
  QVERIFY(QMetaObject::invokeMethod(hex, "textEdited")); hex->setProperty("text", "invalid"); QVERIFY(QMetaObject::invokeMethod(hex, "finishEdit")); QCOMPARE(committed.count(), 2);
  QVERIFY(QMetaObject::invokeMethod(hex, "cancelEdit")); QCOMPARE(hex->property("text").toString(), "#abcdef");
  QVERIFY(QMetaObject::invokeMethod(hex, "textEdited")); hex->setProperty("text", "#10203080"); QVERIFY(QMetaObject::invokeMethod(hex, "finishEdit")); QCOMPARE(committed.count(), 3);
  QCOMPARE(unpack(committed.last().first()).toMap().value("value").toString(), "#10203080");
  QVERIFY(QMetaObject::invokeMethod(hex, "textEdited")); hex->setProperty("text", "#556677"); QVERIFY(QMetaObject::invokeMethod(item.get(), "resetScope"));
  QVERIFY(QMetaObject::invokeMethod(hex, "valueCommitted", Q_ARG(QString, "#556677"))); QCOMPARE(committed.count(), 3);
  item->setProperty("writable", false); QVERIFY(QMetaObject::invokeMethod(item.get(), "choose", Q_ARG(QVariant, "#ff0000"))); QCOMPARE(committed.count(), 3);
 }
 void imageSizes() {
  QQmlEngine engine; QQmlComponent component(&engine, QUrl("qrc:/editor/ImageSizePropertyEditor.qml"));
  QTRY_VERIFY(component.status() != QQmlComponent::Loading); QVERIFY2(component.isReady(), qPrintable(component.errorString()));
  auto item = editor(component, "image_size", QVariant{}); QVERIFY2(item, qPrintable(component.errorString()));
  QSignalSpy committed(item.get(), SIGNAL(valueCommitted(QVariant)));
  QCOMPARE(unpack(item->property("current")).toMap().value("width").toInt(), 1024); QCOMPARE(committed.count(), 0);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "setDimension", Q_ARG(QVariant, "width"), Q_ARG(QVariant, 640))); QCOMPARE(committed.count(), 1);
  auto first = unpack(committed.last().first()).toMap(); QCOMPARE(first.value("width").toInt(), 640); QCOMPARE(first.value("height").toInt(), 1024); QVERIFY(!first.contains("type"));
  item->setProperty("value", QVariantMap{{"width", 1000}, {"height", 500}, {"preset", "old"}, {"future", 7}});
  QVERIFY(QMetaObject::invokeMethod(item.get(), "toggleLock")); QVERIFY(item->property("locked").toBool());
  QVERIFY(QMetaObject::invokeMethod(item.get(), "setDimension", Q_ARG(QVariant, "width"), Q_ARG(QVariant, 400))); QCOMPARE(committed.count(), 2);
  auto locked = unpack(committed.last().first()).toMap(); QCOMPARE(locked.value("height").toInt(), 200); QCOMPARE(locked.value("future").toInt(), 7); QVERIFY(!locked.contains("preset"));
  QVERIFY(QMetaObject::invokeMethod(item.get(), "choosePreset", Q_ARG(QVariant, "4K UHD"))); QCOMPARE(committed.count(), 3);
  const auto preset = unpack(committed.last().first()).toMap(); QCOMPARE(preset.value("width").toInt(), 3840); QCOMPARE(preset.value("height").toInt(), 2160); QCOMPARE(preset.value("preset").toString(), "4K UHD");
  item->setProperty("value", preset); QVERIFY(QMetaObject::invokeMethod(item.get(), "swap")); QCOMPARE(committed.count(), 4);
  const auto swapped = unpack(committed.last().first()).toMap(); QCOMPARE(swapped.value("width").toInt(), 2160); QCOMPARE(swapped.value("height").toInt(), 3840); QVERIFY(!swapped.contains("preset"));
  for (const auto bad : {0.0, -1.0, 1.5, std::numeric_limits<double>::infinity()}) { QVERIFY(QMetaObject::invokeMethod(item.get(), "setDimension", Q_ARG(QVariant, "height"), Q_ARG(QVariant, bad))); }
  QCOMPARE(committed.count(), 4);
  auto* width = item->findChild<QObject*>("image-width-value"); QVERIFY(width);
  QVERIFY(QMetaObject::invokeMethod(width, "begin")); width->setProperty("text", "1.5"); QVERIFY(QMetaObject::invokeMethod(width, "finishEdit")); QCOMPARE(committed.count(), 4);
  QVERIFY(QMetaObject::invokeMethod(item.get(), "resetScope")); QVERIFY(!item->property("locked").toBool());
  QVERIFY(QMetaObject::invokeMethod(width, "valueCommitted", Q_ARG(double, 777))); QCOMPARE(committed.count(), 4);
  item->setProperty("writable", false); QVERIFY(QMetaObject::invokeMethod(item.get(), "choosePreset", Q_ARG(QVariant, "720p HD"))); QCOMPARE(committed.count(), 4);
 }
 void presetsMatchWeb() {
  QQmlEngine engine; QQmlComponent colorComponent(&engine, QUrl("qrc:/editor/ColorPropertyEditor.qml"));
  QTRY_VERIFY(colorComponent.status() != QQmlComponent::Loading); auto color = editor(colorComponent, "color", QVariant{}); QVERIFY(color);
  QFile palette(QString(PROPERTY_WEB_ROOT) + "/constants/colors.ts"); QVERIFY(palette.open(QIODevice::ReadOnly));
  QJsonArray expectedColors{QJsonValue::Null}; auto colors = QRegularExpression("\\\"(#[0-9A-Fa-f]+)\\\"").globalMatch(QString::fromUtf8(palette.readAll()));
  while (colors.hasNext()) expectedColors.append(colors.next().captured(1));
  QCOMPARE(QJsonArray::fromVariantList(unpack(color->property("presets")).toList()), expectedColors);
  QQmlComponent sizeComponent(&engine, QUrl("qrc:/editor/ImageSizePropertyEditor.qml")); QTRY_VERIFY(sizeComponent.status() != QQmlComponent::Loading); auto size = editor(sizeComponent, "image_size", QVariant{}); QVERIFY(size);
  QFile source(QString(PROPERTY_WEB_ROOT) + "/config/constants.ts"); QVERIFY(source.open(QIODevice::ReadOnly));
  auto text = QString::fromUtf8(source.readAll()); text = text.mid(text.indexOf("export const IMAGE_SIZE_PRESETS")); text = text.left(text.indexOf("];"));
  const QRegularExpression row(R"rx(label:\s*("(?:\\.|[^"\\])*"),\s*width:\s*(\d+),\s*height:\s*(\d+),\s*aspectRatio:\s*("(?:\\.|[^"\\])*"))rx");
  auto matches = row.globalMatch(text); QJsonArray expected;
  while (matches.hasNext()) { const auto match = matches.next(); const auto label = QJsonDocument::fromJson(("[" + match.captured(1) + "]").toUtf8()).array().first(); const auto aspect = QJsonDocument::fromJson(("[" + match.captured(4) + "]").toUtf8()).array().first(); expected.append(QJsonObject{{"label", label}, {"width", match.captured(2).toInt()}, {"height", match.captured(3).toInt()}, {"aspectRatio", aspect}}); }
  QVERIFY(!expected.isEmpty()); QCOMPARE(QJsonArray::fromVariantList(unpack(size->property("presets")).toList()), expected);
 }
 void boundariesAndUndo() {
  for (const auto& kind : {QString("color"), QString("image_size")}) {
   const QJsonObject declaration{{"name", "value"}, {"type", QJsonObject{{"type", kind}}}, {"default", kind == "color" ? QJsonValue(QJsonObject{{"type", "color"}, {"value", "#fff"}}) : QJsonValue(QJsonObject{{"width", 1024}, {"height", 1024}})}};
   const QJsonObject metadata{{"node_type", "test"}, {"properties", QJsonArray{declaration}}};
   const QJsonObject node{{"id", "n"}, {"type", "test"}, {"data", QJsonObject{}}};
   const auto fields = propertyFields(node, metadata, {}); QCOMPARE(fields.first().toMap().value("kind").toString(), kind); QVERIFY(fields.first().toMap().value("hasDefault").toBool()); QVERIFY(!fields.first().toMap().value("hasValue").toBool());
   QVERIFY(!propertyFields(node, metadata, QJsonArray{QJsonObject{{"target", "n"}, {"targetHandle", "value"}}}).first().toMap().value("editable").toBool());
   const auto valid = kind == "color" ? QJsonObject{{"type", "color"}, {"value", "#12345680"}, {"future", 7}} : QJsonObject{{"width", 777}, {"height", 333}, {"future", 7}};
   WorkflowDocument document; document.setNodeMetadata({metadata}); QVERIFY(document.load({{"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}}));
   QVERIFY(!document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", 42}}));
   QVERIFY(document.applyCommand({{"op", "setProperty"}, {"id", "n"}, {"name", "value"}, {"value", valid}})); QCOMPARE(document.undoStack()->count(), 1);
   document.undo(); QVERIFY(!document.node("n").value("data").toObject().contains("value")); document.redo(); WorkflowDocument reopened; QVERIFY(reopened.load(document.snapshot())); QCOMPARE(reopened.node("n").value("data").toObject().value("value").toObject(), valid);
  }
  QVERIFY(validateColorValue("#abc").isEmpty()); QVERIFY(validateColorValue(QJsonObject{{"type", "color"}, {"value", QJsonValue::Null}}).isEmpty()); QVERIFY(!validateColorValue("javascript:bad").isEmpty());
  QVERIFY(!validateImageSizeValue(QJsonObject{{"width", 0}, {"height", 100}}).isEmpty()); QVERIFY(!validateImageSizeValue(QJsonObject{{"width", 1.5}, {"height", 100}}).isEmpty());
 }
};
QTEST_MAIN(PresentationPropertyTest)
#include "PresentationPropertyTest.moc"
