#include "graph/EditorScene.h"
#include "ui/EditorWindow.h"
#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QFile>
#include <QFont>
#include <QFontInfo>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QLocale>
#include <QPainter>
#include <QQmlContext>
#include <QQmlProperty>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSaveFile>
#include <QTest>
#include <QtNodes/internal/AbstractNodeGeometry.hpp>
#include <QtNodes/internal/NodeGraphicsObject.hpp>
#include <QtNodes/internal/ConnectionGraphicsObject.hpp>
#include <stdexcept>

namespace {
QString rgba(const QColor &c) {
  return c.name(QColor::HexRgb) + QString::number(c.alpha(), 16).rightJustified(2, '0');
}
QJsonObject emptyMetrics() {
  QJsonObject result;
  for (auto key : {"width", "height", "color", "background.color", "border.color", "border.width", "border.radius", "padding.top", "padding.right", "padding.bottom", "padding.left", "gap", "font.family", "font.size", "font.weight"}) {
    result[key] = QJsonValue::Null;
  }
  return result;
}
QJsonValue observed(QObject *object, const QString &path) {
  auto value = QQmlProperty::read(object, path);
  if (!value.isValid()) { return QJsonValue::Null; }
  if (value.metaType() == QMetaType::fromType<QColor>()) { return rgba(value.value<QColor>()); }
  return QJsonValue::fromVariant(value);
}
QJsonObject metrics(QQuickItem *item) {
  auto m = emptyMetrics();
  m["width"] = item->width(); m["height"] = item->height();
  for (auto key : {"color", "font.family", "font.pixelSize", "font.weight", "topPadding", "rightPadding", "bottomPadding", "leftPadding", "spacing"}) {
    const QMap<QString, QString> names{{"font.pixelSize", "font.size"}, {"topPadding", "padding.top"}, {"rightPadding", "padding.right"}, {"bottomPadding", "padding.bottom"}, {"leftPadding", "padding.left"}, {"spacing", "gap"}};
    m[names.value(key, key)] = observed(item, key);
  }
  auto background = item->property("background").value<QObject *>();
  if (!background && item->property("radius").isValid()) {
    background = item;
    // A plain surface's color is its fill, not a text color.
    m["color"] = QJsonValue::Null;
  }
  if (background) {
    m["background.color"] = observed(background, "color");
    m["border.color"] = observed(background, "border.color");
    m["border.width"] = observed(background, "border.width");
    m["border.radius"] = observed(background, "radius");
  }
  // Only a control's own label describes it. A container may hold other buttons.
  if (auto label = item->property("background").isValid() ? item->findChild<QQuickItem *>("nativeButtonLabel") : nullptr) {
    m["color"] = observed(label, "color");
    m["font.family"] = observed(label, "font.family");
    m["font.size"] = observed(label, "font.pixelSize");
    m["font.weight"] = observed(label, "font.weight");
  }
  return m;
}
QQuickItem *findControl(QQuickItem *root, const char *property, const QString &value) {
  if (root->property(property).toString() == value && root->property("background").isValid()) { return root; }
  for (auto child : root->childItems()) {
    if (auto found = findControl(child, property, value)) { return found; }
  }
  return nullptr;
}
void require(bool condition, const QString &message) {
  if (!condition) { throw std::runtime_error(message.toStdString()); }
}
}
int main(int argc, char **argv) {
  qputenv("QT_SCALE_FACTOR", "1");
  QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
  QLocale::setDefault(QLocale(QLocale::English, QLocale::UnitedStates));
  QApplication app(argc, argv);
  QCommandLineParser parser;
  parser.addHelpOption();
  parser.addOption({"out", "Output directory", "directory"});
  parser.addOption({"require-case", "Fail if a required capture is absent", "id"});
  parser.addOption({"state", "Capture all supported states", "state", "all"});
  parser.process(app);
  try {
    require(parser.isSet("out") && !parser.value("out").isEmpty(), "--out is required");
    require(parser.value("state") == "all", "Only --state all is supported");
    QDir out(parser.value("out"));
    require(out.mkpath("."), "Cannot create output directory");
    QFile::remove(out.filePath("manifest.json"));
    nodetool::EditorWindow editor;
    QJsonObject port{{"name", "Prompt"}, {"type", "str"}};
    editor.setCatalog({QJsonObject{{"node_type", "Text"}, {"title", "Text"}, {"input_fields", QJsonArray{"Prompt"}}, {"properties", QJsonArray{port}}, {"outputs", QJsonArray{QJsonObject{{"name", "output"}, {"type", "str"}}}}}});
    QJsonArray nodes;
    for (int i = 0; i < 2; ++i) {
      nodes.append(QJsonObject{{"id", QString::number(i)}, {"type", "Text"}, {"data", QJsonObject{{"Prompt", "Sample text"}}}, {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 40 + i * 370}, {"y", 40 + i * 40}}}}}});
    }
    require(editor.document()->load(QJsonObject{{"graph", QJsonObject{{"nodes", nodes}, {"edges", QJsonArray{QJsonObject{{"id", "edge"}, {"source", "0"}, {"target", "1"}, {"sourceHandle", "output"}, {"targetHandle", "Prompt"}}}}}}}).ok, "Fixture document rejected");
    QTest::qWait(50);
    auto view = editor.findChild<QGraphicsView *>();
    auto scene = editor.scene();
    auto model = editor.findChild<nodetool::WorkflowGraphModel *>();
    require(model && model->allNodeIds().size() == 2, "Missing graph fixture");
    QtNodes::NodeId first = 0, second = 0;
    for (auto id : model->allNodeIds()) { if (model->resourceId(id) == "0") { first = id; } else { second = id; } }
    scene->nodeClicked(first);
    // Declared before the widget, so the widget's QML dies first.
    nodetool::node_editor::NodeInspector inspectorFixture;
    inspectorFixture.setSelection("metadata-fixture");
    inspectorFixture.fields()->setSelection("metadata-fixture");
    inspectorFixture.setCanRun(false);
    inspectorFixture.setProperties(QJsonDocument::fromJson(R"([
      {"name": "field-default", "label": "Field", "kind": "text", "value": "Sample text", "editable": true, "hasValue": true},
      {"name": "field-focus", "label": "Focused field", "kind": "text", "value": "Sample text", "editable": true, "hasValue": true},
      {"name": "field-disabled", "label": "Disabled field", "kind": "text", "value": "Sample text", "editable": false, "hasValue": true},
      {"name": "Prompt", "label": "Prompt", "description": "Describe the image to generate.", "kind": "text", "value": "A quiet mountain lake", "editable": true, "hasValue": true},
      {"name": "seed", "label": "Seed", "kind": "integer", "value": 42, "min": 0, "max": 1000, "step": 1, "editable": true, "hasValue": true},
      {"name": "enabled", "label": "Enabled", "kind": "boolean", "value": true, "editable": true, "hasValue": true},
      {"name": "quality", "label": "Quality", "kind": "choice", "value": 2, "options": [{"label": "Standard", "value": 1}, {"label": "High", "value": 2}], "editable": true, "hasValue": true},
      {"name": "input", "label": "Input image", "kind": "unsupported", "value": {"uri": "asset://fixture"}, "editable": false, "connected": true, "hasValue": true}
    ])").array().toVariantList());
    QQuickWidget fixture;
    fixture.setResizeMode(QQuickWidget::SizeRootObjectToView);
    fixture.rootContext()->setContextProperty("editor", &editor);
    fixture.setInitialProperties({{"nodeCatalog", QVariant::fromValue(editor.nodeCatalog())},
                                  {"packSetup", QVariant::fromValue(editor.packSetup())},
                                  {"inspectorFixture", QVariant::fromValue(&inspectorFixture)},
                                  {"commands", QVariant::fromValue(editor.editorCommands())},
                                  {"runs", QVariant::fromValue(editor.runState())},
                                  {"viewport", QVariant::fromValue(editor.viewport())}});
    fixture.setSource(QUrl("qrc:/editor/Fixture.qml"));
    require(fixture.status() == QQuickWidget::Ready, "Cannot load production QML fixture");
    fixture.resize(1000, 1200); fixture.show();
    QJsonArray cases;
    QString scheme;
    // Every Qt metric names its evidence, so the report separates values read
    // from a live control from constants the canvas painter declares. The report
    // measures rendered pixels itself, with one algorithm for both surfaces.
    auto append = [&](const QString &id, const QString &state, const QString &source, const QImage &image, const QJsonObject &m, const QString &evidence) {
      require(!image.isNull() && image.width() > 0 && image.height() > 0, "Empty capture: " + id);
      auto name = scheme + "-" + id + ".png";
      require(image.save(out.filePath(name)), "Cannot save " + name);
      cases.append(QJsonObject{{"id", id}, {"scheme", scheme}, {"state", state}, {"source", source}, {"image", name}, {"captureBounds", QJsonObject{{"width", image.width()}, {"height", image.height()}}}, {"metrics", m}, {"evidence", evidence}});
    };
    for (const auto &current : {QString("dark"), QString("light")}) {
      scheme = current;
      auto root = fixture.rootObject();
      root->setProperty("scheme", scheme);
      auto inspector = root->findChild<QQuickItem *>("inspector");
      require(inspector, "Missing inspector");
      auto focus = findControl(inspector, "accessibleName", "Focused field");
      require(focus, "Missing focus field"); focus->forceActiveFocus();
      QTest::qWait(100);
      require(focus->hasActiveFocus(), "Focus state was not applied");
      auto framebuffer = fixture.grabFramebuffer();
      require(framebuffer.devicePixelRatio() == 1, "Capture requires DPR 1");
      auto captureQuick = [&](const QString &id, QQuickItem *item, const QString &source) {
        require(item, "Missing capture target " + id);
        // The two-pixel margin matches the web crop and keeps the outline.
        const auto bounds = item->mapRectToItem(root, QRectF(0, 0, item->width(), item->height())).toAlignedRect().adjusted(-2, -2, 2, 2);
        require(framebuffer.rect().contains(bounds), "Target outside framebuffer " + id);
        auto state = id == "button-primary" ? "primary" : id.contains("disabled") ? "disabled" : id.contains("focus") ? "focus" : "default";
        append(id, state, source, framebuffer.copy(bounds), metrics(item), "live-property");
      };
      for (auto id : {"button-default", "button-primary", "button-disabled"}) {
        captureQuick(id, root->findChild<QQuickItem *>(id), "native/node-editor/qml/NodeButton.qml");
      }
      for (auto id : {"text-label", "text-caption"}) {
        captureQuick(id, root->findChild<QQuickItem *>(id), "native/ui_primitives/qml/Text.qml");
      }
      // Canvas values are painted, so the live field states come from the inspector.
      captureQuick("text-field", findControl(inspector, "accessibleName", "Field"), "native/node-editor/qml/PropertyField.qml");
      captureQuick("text-field-focus", focus, "native/node-editor/qml/PropertyField.qml");
      captureQuick("text-field-disabled", findControl(inspector, "accessibleName", "Disabled field"), "native/node-editor/qml/PropertyField.qml");
      captureQuick("surface-panel", root->findChild<QQuickItem *>("viewport-frame"), "native/node-editor/qml/ViewportIndicator.qml");
      captureQuick("catalog-row", findControl(root->findChild<QQuickItem *>("catalog"), "text", "Text"), "native/node-editor/qml/Catalog.qml");
      captureQuick("inspector-field", findControl(root->findChild<QQuickItem *>("inspector"), "accessibleName", "Prompt"), "native/node-editor/qml/Inspector.qml");
      auto render = [&](const QRectF &bounds) {
        require(!bounds.isEmpty(), "Empty graph bounds");
        auto rect = bounds.toAlignedRect();
        QImage image(rect.size(), QImage::Format_ARGB32_Premultiplied); image.fill(Qt::transparent);
        QPainter painter(&image); painter.setRenderHint(QPainter::Antialiasing);
        scene->render(&painter, QRectF(QPointF(0, 0), rect.size()), rect, Qt::IgnoreAspectRatio);
        return image;
      };
      auto node = scene->nodeGraphicsObject(first);
      require(node, "Missing node graphics object");
      namespace nm = nodetool::node_metrics;
      QCoreApplication::processEvents();
      const auto &theme = scene->theme();
      const auto portType = model->portData<QtNodes::NodeDataType>(first, QtNodes::PortType::Out, 0, QtNodes::PortRole::DataType).id;
      const auto accent = nodetool::typeColor(portType);
      // Inherited font of the card. Titles and labels add a medium weight.
      const auto withCardFont = [&](QJsonObject m) {
        m["font.family"] = theme.sansFamily;
        m["font.size"] = nm::fontLabel;
        m["font.weight"] = 400;
        m["color"] = rgba(theme.textPrimary);
        return m;
      };
      for (bool selected : {false, true}) {
        node->setSelected(selected);
        auto m = withCardFont(emptyMetrics());
        const auto size = scene->nodeGeometry().size(first);
        m["width"] = size.width(); m["height"] = size.height();
        m["qt.titleWeight"] = 500;
        m["border.radius"] = nm::radius;
        m["border.width"] = nm::borderWidth;
        m["border.color"] = rgba(selected ? accent : theme.divider);
        m["background.color"] = rgba(theme.node);
        for (auto side : {"padding.top", "padding.right", "padding.bottom", "padding.left"}) { m[side] = nm::padding; }
        append(selected ? "node-selected" : "node-card", selected ? "selected" : "default", "native/node-editor/src/graph/EditorScene.cpp", render(node->sceneTransform().mapRect(QRectF(QPointF(0, 0), size)).adjusted(-2, -2, 2, 2)), m, "painter-constant");
      }
      node->setSelected(false);
      for (auto type : {QtNodes::PortType::In, QtNodes::PortType::Out}) {
        auto point = scene->nodeGeometry().portScenePosition(first, type, 0, node->sceneTransform());
        const auto diameter = nm::handleDiameter;
        auto m = withCardFont(emptyMetrics());
        m["width"] = diameter; m["height"] = diameter;
        m["border.width"] = nm::handleRing;
        m["border.color"] = rgba(theme.node);
        m["border.radius"] = 100;
        m["background.color"] = rgba(accent);
        for (auto side : {"padding.top", "padding.right", "padding.bottom", "padding.left"}) { m[side] = 0; }
        append(type == QtNodes::PortType::In ? "port-input" : "port-output", type == QtNodes::PortType::In ? "default" : "connected", "native/node-editor/src/graph/EditorScene.cpp", render(QRectF(point.x() - diameter, point.y() - diameter, diameter * 2, diameter * 2)), m, "painter-constant");
      }
      auto connection = scene->connectionGraphicsObject({first, 0, second, 0});
      require(connection, "Missing connection graphics object");
      auto m = emptyMetrics();
      auto stroke = accent;
      stroke.setAlphaF(nm::wireOpacity);
      m["stroke.color"] = rgba(stroke); m["stroke.width"] = nm::wireWidth;
      append("connection", "default", "native/node-editor/src/graph/EditorScene.cpp", render(connection->mapRectToScene(nodetool::wireCurve(connection->endPoint(QtNodes::PortType::Out), connection->endPoint(QtNodes::PortType::In)).boundingRect()).adjusted(0, -4, 0, 4)), m, "painter-constant");
    }
    require(cases.size() == 32, "Incomplete capture coverage");
    if (parser.isSet("require-case")) {
      for (const auto &requiredScheme : {QString("dark"), QString("light")}) {
        bool found = false;
        for (const auto &value : cases) {
          auto c = value.toObject();
          found |= c["id"].toString() == parser.value("require-case") && c["scheme"].toString() == requiredScheme;
        }
        require(found, "Missing required capture: " + parser.value("require-case") + "/" + requiredScheme);
      }
    }
    QSaveFile manifest(out.filePath("manifest.json"));
    require(manifest.open(QIODevice::WriteOnly), "Cannot open manifest");
    auto bytes = QJsonDocument(QJsonObject{{"version", 1}, {"surface", "qt"}, {"environment", QJsonObject{{"qt", qVersion()}, {"platform", QGuiApplication::platformName()}, {"dpr", 1}, {"uiScale", 1}, {"textScale", 1}, {"renderer", "software"}, {"locale", QLocale().name().replace('_', '-')}}}, {"cases", cases}}).toJson();
    require(manifest.write(bytes) == bytes.size() && manifest.commit(), "Cannot commit manifest");
    return 0;
  } catch (const std::exception &error) {
    qCritical() << error.what(); return 1;
  }
}
