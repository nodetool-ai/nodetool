// The application menu bar, modeled on the desktop app's menu (electron/src/menu.ts).
// UI thread only. The window that owns the tabs builds it once in its
// constructor, and QMainWindow owns the bar and its menus. An entry that names
// an editor command runs it on the active tab, as the More menu does.
#include "EditorWindow.h"

#include <QAction>
#include <QApplication>
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QKeyEvent>
#include <QMenu>
#include <QMenuBar>
#include <QMessageBox>
#include <QPushButton>
#include <QQuickItem>
#include <QQuickWidget>
#include <QQuickWindow>
#include <QSysInfo>
#include <QUrl>

namespace nodetool {
namespace {
// The property that holds an entry's editor command. Menus enable these entries
// from the active tab while they are open.
constexpr auto CommandProperty = "editorCommand";

// Gives the keys of the canvas commands (the Edit and View menus) to a focused
// Qt Quick panel of the window, such as the inspector or the chat, as before the
// menu bar existed. A text field there handles them itself, and other panel
// controls ignore them. Everywhere else the menu entries take the keys.
// UI thread only. Parented to the window, installed on the application, and
// removed by its destructor.
class PanelKeyGuard final : public QObject {
public:
    PanelKeyGuard(QWidget *window, QList<QKeySequence> keys) : QObject(window), window_(window), keys_(std::move(keys)) {
        qApp->installEventFilter(this);
    }
    ~PanelKeyGuard() override { qApp->removeEventFilter(this); }

protected:
    bool eventFilter(QObject *target, QEvent *event) override {
        if (event->type() != QEvent::ShortcutOverride) { return false; }
        const QKeySequence pressed(static_cast<QKeyEvent *>(event)->keyCombination());
        if (!keys_.contains(pressed) || !inPanel(target)) { return false; }
        event->accept();
        return true;
    }

private:
    bool inPanel(QObject *target) const {
        QQuickWindow *quick = qobject_cast<QQuickWindow *>(target);
        if (!quick) {
            if (auto *item = qobject_cast<QQuickItem *>(target)) { quick = item->window(); }
        }
        for (auto *panel : window_->findChildren<QQuickWidget *>()) {
            if (panel == target || (quick && panel->quickWindow() == quick)) { return true; }
        }
        return false;
    }
    QWidget *window_;
    QList<QKeySequence> keys_;
};
}

void EditorWindow::installApplicationMenu() {
    auto *bar = menuBar();
    bar->setObjectName(QStringLiteral("application-menu"));
    const auto command = [this](QMenu *menu, const QString &label, const QString &name, const QList<QKeySequence> &keys = {}) {
        auto *item = menu->addAction(label);
        item->setProperty(CommandProperty, name);
        item->setShortcuts(keys);
        connect(item, &QAction::triggered, this, [this, name] {
            auto *editor = activeEditor();
            if (editor && editor->menuActionEnabled(name)) { editor->userAction(name); }
        });
        return item;
    };
    const auto entry = [this](QMenu *menu, const QString &label, const std::function<void()> &work, const QList<QKeySequence> &keys = {}) {
        auto *item = menu->addAction(label);
        item->setShortcuts(keys);
        connect(item, &QAction::triggered, this, work);
        return item;
    };
    // A closed menu leaves every entry enabled, so a shortcut always reaches its
    // command, which checks its own state. An open menu shows the active tab's state.
    const auto track = [this](QMenu *menu) {
        connect(menu, &QMenu::aboutToShow, this, [this, menu] {
            auto *editor = activeEditor();
            for (auto *item : menu->actions()) {
                const auto name = item->property(CommandProperty).toString();
                if (!name.isEmpty()) { item->setEnabled(editor && editor->menuActionEnabled(name)); }
            }
        });
        connect(menu, &QMenu::aboutToHide, this, [menu] {
            for (auto *item : menu->actions()) {
                if (item->property(CommandProperty).isValid()) { item->setEnabled(true); }
            }
        });
    };

    auto *file = bar->addMenu(tr("File"));
    file->setObjectName(QStringLiteral("application-menu-file"));
    entry(file, tr("New Workflow"), [this] { newTab(); }, {QKeySequence(QStringLiteral("Ctrl+T"))});
    command(file, tr("Open…"), QStringLiteral("Open file"), {QKeySequence(QStringLiteral("Ctrl+O"))});
    auto *examples = file->addMenu(tr("Open Example"));
    examples->setObjectName(QStringLiteral("application-menu-examples"));
    addExampleActions(examples);
    file->addSeparator();
    command(file, tr("Save"), QStringLiteral("Save"), {QKeySequence(QStringLiteral("Ctrl+S"))});
    command(file, tr("Save As…"), QStringLiteral("Save local copy as"), {QKeySequence(QStringLiteral("Ctrl+Shift+S"))});
    file->addSeparator();
    auto *settings = entry(file, tr("Settings…"), [this] { openSettings(); }, {QKeySequence(QStringLiteral("Ctrl+,"))});
    settings->setMenuRole(QAction::PreferencesRole);
    file->addSeparator();
    entry(file, tr("Close Tab"), [this] { closeTab(activeTab()); }, {QKeySequence(QStringLiteral("Ctrl+W"))});
    auto *quit = entry(file, tr("Quit"), [this] { close(); }, {QKeySequence(QStringLiteral("Ctrl+Q"))});
    quit->setMenuRole(QAction::QuitRole);
    track(file);

    auto *edit = bar->addMenu(tr("Edit"));
    edit->setObjectName(QStringLiteral("application-menu-edit"));
    command(edit, tr("Undo"), QStringLiteral("Undo"), {QKeySequence(QStringLiteral("Ctrl+Z"))});
    command(edit, tr("Redo"), QStringLiteral("Redo"), {QKeySequence(QStringLiteral("Ctrl+Shift+Z")), QKeySequence(QStringLiteral("Ctrl+Y"))});
    edit->addSeparator();
    command(edit, tr("Cut"), QStringLiteral("Cut"), {QKeySequence(QStringLiteral("Ctrl+X"))});
    command(edit, tr("Copy"), QStringLiteral("Copy"), {QKeySequence(QStringLiteral("Ctrl+C"))});
    command(edit, tr("Paste"), QStringLiteral("Paste"), {QKeySequence(QStringLiteral("Ctrl+V"))});
    command(edit, tr("Select All"), QStringLiteral("Select all"), {QKeySequence(QStringLiteral("Ctrl+A"))});
    edit->addSeparator();
    command(edit, tr("Duplicate"), QStringLiteral("Duplicate"), {QKeySequence(QStringLiteral("Ctrl+D"))});
    command(edit, tr("Duplicate Vertical"), QStringLiteral("Duplicate vertical"), {QKeySequence(QStringLiteral("Ctrl+Shift+D"))});
    command(edit, tr("Group"), QStringLiteral("Group selection"), {QKeySequence(QStringLiteral("Ctrl+G"))});
    edit->addSeparator();
    // A and Shift+A stay canvas keys, so typing in a field never triggers them.
    command(edit, tr("Align"), QStringLiteral("Align"));
    command(edit, tr("Align with Spacing"), QStringLiteral("Align with spacing"));
    track(edit);

    auto *view = bar->addMenu(tr("View"));
    view->setObjectName(QStringLiteral("application-menu-view"));
    command(view, tr("Fit View"), QStringLiteral("Fit"));
    view->addSeparator();
    command(view, tr("Reset Zoom"), QStringLiteral("Reset zoom"), {QKeySequence(QStringLiteral("Ctrl+0"))});
    command(view, tr("Zoom In"), QStringLiteral("Zoom in"), {QKeySequence(QStringLiteral("Ctrl+="))});
    command(view, tr("Zoom Out"), QStringLiteral("Zoom out"), {QKeySequence(QStringLiteral("Ctrl+-"))});
    view->addSeparator();
    command(view, tr("Nodes"), QStringLiteral("Toggle nodes"));
    command(view, tr("Inspector"), QStringLiteral("Toggle inspector"));
    command(view, tr("Mini-Map"), QStringLiteral("Toggle mini-map"));
    view->addSeparator();
    entry(view, tr("Toggle Full Screen"), [this] { isFullScreen() ? showNormal() : showFullScreen(); }, {QKeySequence::FullScreen});
    track(view);

    // The Node and Workflow menus bind no keys. The canvas keeps Ctrl+F and
    // Ctrl+Return, so an inline property editor still commits with Ctrl+Return.
    auto *node = bar->addMenu(tr("Node"));
    node->setObjectName(QStringLiteral("application-menu-node"));
    command(node, tr("Find Node…"), QStringLiteral("Find node"));
    node->addSeparator();
    command(node, tr("Rename Node…"), QStringLiteral("Rename node"));
    command(node, tr("Edit Note…"), QStringLiteral("Edit note"));
    command(node, tr("Add Comment"), QStringLiteral("Add comment"));
    command(node, tr("Edit Comment…"), QStringLiteral("Edit comment"));
    node->addSeparator();
    command(node, tr("Disable"), QStringLiteral("Disable selected"));
    command(node, tr("Enable"), QStringLiteral("Enable selected"));
    command(node, tr("Link Selected"), QStringLiteral("Link selected"));
    node->addSeparator();
    command(node, tr("Auto Layout"), QStringLiteral("Auto layout"));
    command(node, tr("Layout Selection"), QStringLiteral("Layout selection"));
    command(node, tr("Arrange Selection"), QStringLiteral("Arrange selection"));
    node->addSeparator();
    command(node, tr("Group into Subgraph"), QStringLiteral("Group into subgraph"));
    command(node, tr("Open Subgraph"), QStringLiteral("Open child"));
    command(node, tr("Rename Group…"), QStringLiteral("Rename group"));
    command(node, tr("Ungroup"), QStringLiteral("Ungroup"));
    command(node, tr("Remove from Group"), QStringLiteral("Remove from group"));
    track(node);

    auto *workflow = bar->addMenu(tr("Workflow"));
    workflow->setObjectName(QStringLiteral("application-menu-workflow"));
    command(workflow, tr("Run"), QStringLiteral("Run"));
    command(workflow, tr("Run Selected"), QStringLiteral("Run selected"));
    command(workflow, tr("Stop"), QStringLiteral("Stop"));
    workflow->addSeparator();
    command(workflow, tr("Open from Server…"), QStringLiteral("Server Open"));
    command(workflow, tr("Save to Server"), QStringLiteral("Server Save"));
    command(workflow, tr("Sync with Server…"), QStringLiteral("Server sync"));
    command(workflow, tr("Reconnect"), QStringLiteral("Reconnect"));
    workflow->addSeparator();
    command(workflow, tr("Linked Workflows…"), QStringLiteral("Linked workflows"));
    command(workflow, tr("Share…"), QStringLiteral("Share workflow"));
    command(workflow, tr("Metadata…"), QStringLiteral("Workflow metadata"));
    command(workflow, tr("Canvas Uploads…"), QStringLiteral("Canvas uploads"));
    track(workflow);

    // The desktop app's Tools menu, with the native panel for each tool that has one.
    auto *tools = bar->addMenu(tr("Tools"));
    tools->setObjectName(QStringLiteral("application-menu-tools"));
    entry(tools, tr("Chat"), [this] { toggleChat(); });
    entry(tools, tr("Logs"), [this] { toggleStatusView(QStringLiteral("logs")); });
    entry(tools, tr("Run Trace"), [this] { toggleStatusView(QStringLiteral("trace")); });
    entry(tools, tr("Version History"), [this] { toggleStatusView(QStringLiteral("versions")); });
    entry(tools, tr("Package Manager"), [this] { setupAction(QStringLiteral("runtimes")); });

    auto *window = bar->addMenu(tr("Window"));
    window->setObjectName(QStringLiteral("application-menu-window"));
    entry(window, tr("Minimize"), [this] { showMinimized(); }, {QKeySequence(QStringLiteral("Ctrl+M"))});
    window->addSeparator();
    // web/src/config/shortcuts.ts: prevTab and nextTab.
    entry(window, tr("Previous Tab"), [this] { selectAdjacentTab(-1); },
          {QKeySequence(QStringLiteral("Ctrl+Shift+[")), QKeySequence(QStringLiteral("Ctrl+PgUp")), QKeySequence(QStringLiteral("Ctrl+Alt+Left"))});
    entry(window, tr("Next Tab"), [this] { selectAdjacentTab(1); },
          {QKeySequence(QStringLiteral("Ctrl+Shift+]")), QKeySequence(QStringLiteral("Ctrl+PgDown")), QKeySequence(QStringLiteral("Ctrl+Alt+Right"))});

    auto *help = bar->addMenu(tr("Help"));
    help->setObjectName(QStringLiteral("application-menu-help"));
    entry(help, tr("Learn More"), [] { QDesktopServices::openUrl(QUrl(QStringLiteral("https://nodetool.ai"))); });
    command(help, tr("Keyboard Shortcuts"), QStringLiteral("Keyboard shortcuts"), {QKeySequence(QStringLiteral("Ctrl+/"))});
    help->addSeparator();
    entry(help, tr("System Information"), [this] { showSystemInformation(); });
    auto *about = entry(help, tr("About NodeTool"), [this] {
        QMessageBox::about(this, tr("About NodeTool"),
                           tr("NodeTool workflow editor %1\nQt %2").arg(QCoreApplication::applicationVersion(), QString::fromLatin1(qVersion())));
    });
    about->setMenuRole(QAction::AboutRole);
    track(help);

    QList<QKeySequence> canvasKeys;
    for (auto *menu : {edit, view}) {
        for (auto *item : menu->actions()) {
            if (item->property(CommandProperty).isValid()) { canvasKeys += item->shortcuts(); }
        }
    }
    // Parented to this window, which destroys it.
    new PanelKeyGuard(this, canvasKeys);
}

void EditorWindow::showSystemInformation() {
    auto *editor = activeEditor();
    const auto server = editor ? editor->session()->serverUrl().toString() : QString();
    const auto version = QCoreApplication::applicationVersion();
    const auto text = tr("NodeTool workflow editor %1\n\n"
                         "Application\n  Qt: %2\n\n"
                         "Operating System\n  OS: %3\n  Kernel: %4 %5\n  Architecture: %6\n\n"
                         "Runs\n  Server: %7\n  Local runner: %8")
                          .arg(version.isEmpty() ? tr("(development build)") : version, QString::fromLatin1(qVersion()),
                               QSysInfo::prettyProductName(), QSysInfo::kernelType(), QSysInfo::kernelVersion(),
                               QSysInfo::currentCpuArchitecture(), server.isEmpty() ? tr("not connected") : server,
                               editor && editor->session()->localRunnerReady() ? tr("ready") : tr("not loaded"));
    // Parented to this window and deleted when it closes.
    auto *box = new QMessageBox(QMessageBox::Information, tr("System Information"), text, QMessageBox::Ok, this);
    box->setObjectName(QStringLiteral("system-information"));
    box->setAttribute(Qt::WA_DeleteOnClose);
    auto *copy = box->addButton(tr("Copy to Clipboard"), QMessageBox::ActionRole);
    connect(copy, &QPushButton::clicked, box, [text] { QGuiApplication::clipboard()->setText(text); });
    box->open();
}
}
