#include "EditorWindow.h"
#include "graph/EditorScene.h"
#include <QApplication>
#include <QClipboard>
#include <QJsonDocument>
#include <QMenu>
#include <QDialog>
#include <QVBoxLayout>
#include <QQuickWidget>
#include <QQuickItem>
#include <QQmlEngine>
#include <functional>
namespace nodetool {
class MenuDispatch final : public QObject {
 Q_OBJECT
public:
 using QObject::QObject;
 std::function<void(QString)> invoke;
 Q_INVOKABLE void choose(const QString &name) { if (invoke) { invoke(name); } }
};
namespace {
struct Shortcut { const char *command; const char *keys; };
const Shortcut shortcuts[] = {
 {"Align", "A"}, {"Align with spacing", "Shift+A"}, {"Move left", "Left"}, {"Move right", "Right"}, {"Move up", "Up"}, {"Move down", "Down"}, {"Cancel gesture", "Esc"}, {"Copy", "Ctrl+C"}, {"Cut", "Ctrl+X"}, {"Paste", "Ctrl+V"},
 {"Undo", "Ctrl+Z"}, {"Redo", "Ctrl+Shift+Z"}, {"Redo", "Ctrl+Y"},
 {"Duplicate vertical", "Ctrl+Shift+D"}, {"Select all", "Ctrl+A"}, {"Duplicate", "Ctrl+D"}, {"Delete", "Delete"}, {"Delete", "Backspace"},
 {"Fit", "F"}, {"Group selection", "Ctrl+G"}, {"Add node", "Space"},
 {"Disable toggle", "B"}, {"Toggle inspector", "I"}, {"Workflows", "1"},
 {"Reset zoom", "Ctrl+0"}, {"Zoom in", "Ctrl+="}, {"Zoom out", "Ctrl+-"}, {"Save", "Ctrl+S"}, {"Open", "Ctrl+O"}, {"Find node", "Ctrl+F"},
 {"Run", "Ctrl+Return"}, {"Command menu", "Ctrl+K"}, {"Keyboard shortcuts", "Ctrl+/"}, {"Keyboard shortcuts", "Shift+?"},
 {"Align left", "Shift+Left"}, {"Align right", "Shift+Right"},
 {"Align top", "Shift+Up"}, {"Align bottom", "Shift+Down"},
 {"Align center", "Shift+H"}, {"Align middle", "Shift+E"},
 {"Distribute horizontally", "Shift+D"}, {"Stack selection", "V"}, {"Arrange grid", "G"}
};
}
QString EditorWindow::shortcutCommand(int key, Qt::KeyboardModifiers modifiers) const {
 const QKeySequence pressed(QKeyCombination(modifiers, Qt::Key(key)));
 for (const auto &entry : shortcuts) {
  if (pressed == QKeySequence(QString::fromLatin1(entry.keys))) { return QString::fromLatin1(entry.command); }
 }
 return {};
}
bool EditorWindow::menuActionEnabled(const QString &name) const {
 const auto count = selectedCount();
 if (name == "Link selected") { return !readOnly() && count == 2; }
 if (name == "Stop") { return runActive() && session_.connected(); }
 if (name == "Undo") { return !readOnly() && document_.undoStack()->canUndo(); }
 if (name == "Redo") { return !readOnly() && document_.undoStack()->canRedo(); }
 if (name == "Copy") { return count > 0; }
 if (name == "Paste") { return !readOnly() && QJsonDocument::fromJson(QApplication::clipboard()->text().toUtf8()).isObject(); }
 if (name == "Run") { return !readOnly() && session_.connected(); }
 if (name == "Run selected") { return !readOnly() && count > 0 && !runActive() && session_.connected(); }
 if (name.startsWith("Align") || name.startsWith("Distribute") || name == "Stack selection" || name == "Arrange grid" || name == "Layout selection" || name == "Arrange selection") { return !readOnly() && count >= 2; }
 if (name == "Delete" || name == "Cut" || name == "Duplicate" || name == "Duplicate vertical" || name == "Group selection" || name == "Disable toggle" || name == "Disable selected" || name == "Enable selected") { return !readOnly() && count > 0; }
 if (name == "Remove from group") {
  if (readOnly()) { return false; }
  for (const auto &id : selectedIds()) { if (!document_.node(id)["parent_id"].toString().isEmpty()) { return true; } }
  return false;
 }
 if (name == "Ungroup" || name == "Rename group") {
  if (readOnly() || count != 1) { return false; }
  return document_.node(selectedIds().first())["type"].toString().endsWith(".Group");
 }
 if (name == "Edit note" || name == "Rename node" || name == "Edit comment") {
  if (readOnly() || count != 1) { return false; }
  const auto type = document_.node(selectedIds().first())["type"].toString();
  if (name == "Edit comment") { return type.endsWith(".Comment") && !document_.node(selectedIds().first())["data"].toObject()["comment"].isObject(); }
  if (name == "Edit note") { return !type.endsWith(".Group") && !type.endsWith(".Comment") && type != "nodetool.code.Code"; }
  return true;
 }
 if (name == "Add comment" || name == "Add node" || name == "Auto layout") { return !readOnly(); }
 return true;
}
void EditorWindow::showActionMenu(const QString &kind, const QPoint &position) {
 auto *menu = new QMenu(this);
 menu->setObjectName(kind + "-menu"); menu->setAttribute(Qt::WA_DeleteOnClose);
 const auto epoch = documentEpoch_, credentials = credentialsEpoch_;
 const auto selection = selectedIds();
 connect(this, &EditorWindow::documentEpochChanged, menu, &QMenu::close);
 connect(this, &EditorWindow::credentialsEpochChanged, menu, &QMenu::close);
 if (kind == "command" || kind == "shortcuts") {
  delete menu;
  auto *panel = new QDialog(this, Qt::Popup);
  panel->setObjectName(kind + "-panel");
  panel->setAttribute(Qt::WA_DeleteOnClose);
  auto *dispatch = new MenuDispatch(panel);
  dispatch->invoke = [this, panel, epoch, credentials, selection](const QString &name) {
   if (!panel->isVisible() || epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds()) { return; }
   if (name.isEmpty()) { panel->close(); return; }
   if (!menuActionEnabled(name)) { return; }
   panel->close(); action(name);
  };
  connect(this, &EditorWindow::documentEpochChanged, panel, &QDialog::close);
  connect(this, &EditorWindow::credentialsEpochChanged, panel, &QDialog::close);
  QStringList names;
  QMap<QString, QStringList> keys;
  for (const auto &entry : shortcuts) {
   const auto name = QString::fromLatin1(entry.command);
   if (!names.contains(name)) { names.append(name); }
   keys[name].append(QKeySequence(QString::fromLatin1(entry.keys)).toString(QKeySequence::NativeText));
  }
  if (kind == "command") { names += QStringList{"Add comment", "Run selected", "Disable selected", "Enable selected", "Auto layout", "Zoom in", "Zoom out", "Reset zoom", "Stop", "Open file", "Layout selection", "Remove from group", "Ungroup", "Rename group", "Edit note", "Rename node", "Edit comment", "Output", "Toggle nodes", "Fit selection", "Zoom presets", "Connect", "Server Open", "Server Save", "Reconnect", "Server sync", "Version history", "Share workflow", "Workflow metadata", "Canvas uploads", "Link selected", "Open child", "Linked workflows"}; }
  names.removeDuplicates();
  const auto group = [](const QString &name) {
   if (name.startsWith("Align") || name.startsWith("Distribute") || name == "Stack selection" || name == "Arrange grid") { return QString("Layout & Alignment"); }
   if (name == "Output" || name == "Toggle nodes" || name == "Toggle inspector" || name == "Workflows") { return QString("Panels"); }
   if (name.startsWith("Move") || name.startsWith("Fit") || name.startsWith("Zoom") || name.startsWith("Toggle") || name == "Workflows") { return QString("View"); }
   if (name == "Run" || name == "Stop" || name == "Save" || name.startsWith("Open")) { return QString("Workflow"); }
   return QString("Edit");
  };
  QVariantList rows;
  for (const auto &section : {QString("Workflow"), QString("Edit"), QString("Layout & Alignment"), QString("View"), QString("Panels")}) {
   for (const auto &name : names) { if (group(name) == section) { rows.append(QVariantMap{{"label", name}, {"section", section}, {"keys", keys[name].join(" / ")}, {"available", menuActionEnabled(name)}}); } }
  }
  auto *quick = new QQuickWidget(engine_, panel);
  quick->setResizeMode(QQuickWidget::SizeRootObjectToView);
  quick->setInitialProperties({{"dispatch", QVariant::fromValue(dispatch)}, {"rows", rows}, {"help", kind == "shortcuts"}});
  quick->setSource(QUrl("qrc:/editor/ActionPanel.qml"));
  auto *layout = new QVBoxLayout(panel); layout->setContentsMargins(0,0,0,0); layout->addWidget(quick);
  panel->resize(560, 620); panel->move(mapToGlobal(rect().center()) - QPoint(280,310));
  panel->show(); quick->setFocus();
  QMetaObject::invokeMethod(quick->rootObject(), "activate");
  return;
 }
 {
  QStringList names;
  if (kind == "pane") { names = {"Add node", "Add comment", "Paste", "Select all", "Fit", "Command menu", "Keyboard shortcuts"}; }
  else if (kind == "more") { names = {instantUpdate_ ? "Instant Update: On" : "Instant Update: Off", "Open child", "Linked workflows","Stop", "Run selected", "Disable selected", "Enable selected", "Find node", "Auto layout", "Layout selection", "Arrange selection", "Link selected", "Group selection", "Ungroup", "Remove from group", "Rename group", "Rename node", "Edit note", "Add comment", "Edit comment", "Open file", "Server Open", "Server Save", "Server sync", "Version history", "Share workflow", "Workflow metadata", "Reconnect", "Canvas uploads", "Command menu", "Keyboard shortcuts"}; }
  else { names = {"Copy", "Cut", "Duplicate", "Delete", "Run selected", "Disable selected", "Enable selected", "Group selection", "Remove from group", "Ungroup", "Rename group", "Edit note", "Rename node", "Edit comment", "Layout selection", "Align left", "Align center", "Align right", "Align top", "Align middle", "Align bottom", "Distribute horizontally", "Stack selection", "Arrange grid"}; }
  for (const auto &name : names) {
   auto *item = menu->addAction(name);
   item->setEnabled(menuActionEnabled(name));
   connect(item, &QAction::triggered, this, [this, name, epoch, credentials, selection] {
    if (epoch != documentEpoch_ || credentials != credentialsEpoch_ || selection != selectedIds() || !menuActionEnabled(name)) { return; }
    action(name);
   });
  }
 }
 menu->popup(position);
}
}

#include "EditorMenus.moc"
