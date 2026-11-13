#include "EditorWindow.h"
#include <QJsonDocument>
#include "document/ChildPorts.h"
#include <QMenu>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QUrlQuery>
#include <QMessageBox>
#include <QSettings>
#include <QQuickWidget>
#include <QShortcut>
#include <QStackedWidget>
#include <QTimer>
#include <QToolTip>
#include <functional>

namespace nodetool {
EditorWindow *EditorWindow::activeEditor() const {
  return tabOwner_ ? const_cast<EditorWindow *>(this) : activeEditor_;
}
QVariantList EditorWindow::workflowTabs() const {
    const auto owner = tabOwner_ ? tabOwner_ : this;
    QVariantList result;
    for (auto tab : owner->visibleTabs()) {
        const auto title = tab->childParent_
            ? tab->childParent_->workflowName() + " › " + tab->workflowName()
            : tab->workflowName();
        // The web hides the per-run spinner while instant update reruns the graph.
        result.append(QVariantMap{{"title", title},
                                  {"dirty", tab->hasUnsavedChanges()},
                                  {"running", tab->runActive() && !tab->instantUpdate_ && !tab->scrubbing_},
                                  {"renamable", !tab->childParent_}});
    }
    return result;
}
int EditorWindow::activeTab() const {
    const auto owner = tabOwner_ ? tabOwner_ : this;
    auto host = owner->activeEditor_;
    while (host && host->inlineChild_ && host->childParent_) {
        host = host->childParent_;
    }
    return owner->visibleTabs().indexOf(host);
}
QString EditorWindow::projectKey() const {
    auto root = this;
    while (root->childParent_) {
        root = root->childParent_;
    }
    const auto id = root->session_.serverBound()
        ? root->document_.snapshot()["project_id"].toString()
        : QString();
    if (id.isEmpty()) {
        return root->assignedProject_;
    }
    // The web reads the Personal project and the loose bucket as one scope.
    if (id == "default" || id.startsWith("personal:")) {
        return {};
    }
    return id;
}
QString EditorWindow::activeProject() const {
    const auto owner = tabOwner_ ? tabOwner_ : this;
    return owner->activeEditor_ ? owner->activeEditor_->projectKey() : QString();
}
QList<EditorWindow *> EditorWindow::visibleTabs() const {
    const auto owner = tabOwner_ ? tabOwner_ : this;
    const auto project = owner->activeProject();
    QList<EditorWindow *> result;
    for (auto tab : owner->tabs_) {
        if (!tab->inlineChild_ && tab->projectKey() == project) {
            result.append(tab);
        }
    }
    return result;
}
QString EditorWindow::projectName() const {
    const auto owner = tabOwner_ ? tabOwner_ : this;
    const auto project = owner->activeProject();
    if (project.isEmpty()) {
        return tr("Personal");
    }
    for (const auto &value : owner->projects_) {
        if (value.toObject()["id"].toString() == project) {
            return value.toObject()["name"].toString();
        }
    }
    // An unlisted project takes its active document's name, as on the web.
    auto root = owner->activeEditor_;
    while (root && root->childParent_) {
        root = root->childParent_;
    }
    return root ? root->workflowName() : tr("Project");
}
void EditorWindow::schedulePanelChanged() {
  if (!panelChangePending_) {
    panelChangePending_ = true;
    QMetaObject::invokeMethod(this, &EditorWindow::flushPanelChanged, Qt::QueuedConnection);
  }
  // Panels bound to the owner window follow the active tab in the same pass.
  if (tabOwner_ && tabOwner_->activeEditor_ == this) {
    tabOwner_->setWindowTitle(windowTitle());
    tabOwner_->setWindowModified(isWindowModified());
    tabOwner_->schedulePanelChanged();
  }
}
void EditorWindow::flushPanelChanged() {
  if (!panelChangePending_) return;
  // The session's queued edit notification and a queued projection run first,
  // so that their changes share this emit.
  session_.flushDocumentNotification();
  if (refreshPending_) { refresh(); }
  panelChangePending_ = false;
  emit panelChanged();
}
void EditorWindow::notifyTabs() {
    auto owner = tabOwner_ ? tabOwner_ : this;
    // Every tab hosts a strip, and each model change rebuilds its delegates,
    // which would also end a tab drag in progress.
    const QVariantList signature{owner->workflowTabs(), owner->activeTab(),
                                 owner->canvasStrips(), owner->projectName()};
    if (signature == owner->tabSignature_) {
        return;
    }
    owner->tabSignature_ = signature;
    emit owner->tabsChanged();
    for (auto tab : owner->tabs_) {
        emit tab->tabsChanged();
    }
}
void EditorWindow::newTab() {
  if (tabOwner_) { tabOwner_->newTab(); return; }
  // A new document joins the project on screen, as web creationProjectId does.
  const auto project = activeProject();
  auto tab = new EditorWindow(tabStack_, this);
    tab->assignedProject_ = project;
    connect(&tab->browser_, &node_editor::WorkflowBrowser::changed, this, [this, tab] {
        harvestProjects(QJsonArray::fromVariantList(tab->browser_.projects()));
    });
    connect(&tab->session_, &node_editor::WorkflowSession::credentialsChanged, this,
            [this](const QUrl &origin, const QString &, const QString &user) {
        const auto account = origin.toString() + '\n' + user;
        if (account != projectsAccount_) {
            projectsAccount_ = account;
            projects_ = {};
        }
    });
  tab->setWindowFlags(Qt::Widget);
  // Only a top-level window fills its background, and translucent dock dividers
  // would otherwise blend with the outer window.
  tab->setAutoFillBackground(true);
  tabs_.append(tab);
  tabStack_->addWidget(tab);
    // Cards warn about a missing provider key from the account's secrets.
    const auto syncSecrets = [this, tab] { tab->model_.setConfiguredSecrets(packSetup_.configuredKeys(), packSetup_.secretsLoaded()); };
    connect(&packSetup_, &node_editor::PackSetup::changed, tab, syncSecrets);
    syncSecrets();
    connect(&packSetup_, &node_editor::PackSetup::registryRefreshRequested, tab, [this, tab] {
        if (tab->packOrigin_ == activeEditor_->packOrigin_
            && tab->packToken_ == activeEditor_->packToken_ && tab->packUser_ == activeEditor_->packUser_) {
            tab->session_.loadCatalog();
        }
    });
  tab->setCatalog(metadata_);
  tab->setDarkTheme(tabsDark_);
  if (!tabsOrigin_.isEmpty()) tab->session_.connectToServer(tabsOrigin_, tabsToken_, tabsUser_);
  connect(&tab->session_, &node_editor::WorkflowSession::saved, tab, [this, tab] {
    const bool close = tab->closeAfterServerSave_ && !tab->hasUnsavedChanges();
    tab->closeAfterServerSave_ = false;
    if (close) {
      QPointer<EditorWindow> target = tab;
      QTimer::singleShot(0, this, [this, target] { if (target) closeSurface(tabs_.indexOf(target)); });
    }
  });
  connect(&tab->session_, &node_editor::WorkflowSession::errorOccurred, tab, [tab] { tab->closeAfterServerSave_ = false; });
  connect(&tab->session_, &node_editor::WorkflowSession::credentialsChanged, tab, [tab] { tab->closeAfterServerSave_ = false; });
  activateSurface(tabs_.size() - 1);
}
void EditorWindow::activateTab(int index) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    const auto tab = owner->visibleTabs().value(index);
    if (!tab) {
        return;
    }
    auto shown = tab->shownSurface_ ? tab->shownSurface_.data() : tab;
    owner->activateSurface(owner->tabs_.indexOf(shown));
}
bool EditorWindow::closeTab(int index) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    const auto tab = owner->visibleTabs().value(index);
    return tab && closeSurface(owner->tabs_.indexOf(tab));
}
QVariantList EditorWindow::canvasStrips() const {
    auto owner = tabOwner_ ? tabOwner_ : this;
    QList<EditorWindow *> chain;
    auto host = owner->activeEditor_;
    while (host) {
        chain.prepend(host);
        host = host->inlineChild_ ? host->childParent_.data() : nullptr;
    }
    QVariantList strips;
    for (int depth = 0; depth < chain.size(); ++depth) {
        host = chain[depth];
        QVariantList entries;
        entries.append(QVariantMap{{"title", host->inlineChild_ ? host->workflowName() : tr("Workflow")},
                                   {"surface", owner->tabs_.indexOf(host)},
                                   {"host", true},
                                   {"selected", depth == chain.size() - 1}});
        for (auto child : owner->tabs_) {
            if (!child->inlineChild_ || child->childParent_ != host) {
                continue;
            }
            entries.append(QVariantMap{{"title", child->workflowName()},
                                       {"surface", owner->tabs_.indexOf(child)},
                                       {"host", false},
                                       {"selected", chain.value(depth + 1) == child}});
        }
        if (entries.size() > 1) {
            strips.append(QVariantMap{{"entries", entries}, {"depth", depth}});
        }
    }
    return strips;
}
void EditorWindow::flushChild() {
    if (childWriteTimer_ && childWriteTimer_->isActive()) {
        childWriteTimer_->stop();
        syncChild();
    }
    if (inlineChild_ && childParent_) {
        childParent_->flushChild();
    }
}
void EditorWindow::closeChildSurfaces() {
    if (!tabOwner_) {
        return;
    }
    auto owner = tabOwner_;
    for (int i = owner->tabs_.size() - 1; i >= 0; --i) {
        if (owner->tabs_[i]->inlineChild_ && owner->tabs_[i]->childParent_ == this) {
            owner->closeSurface(i);
        }
    }
}
void EditorWindow::activateSurface(int index) {
    if (tabOwner_) {
        tabOwner_->activateSurface(index);
        return;
    }
    if (index < 0 || index >= tabs_.size() ||
        (activeEditor_ == tabs_[index] && tabStack_->currentWidget() == activeEditor_)) {
        return;
    }
    if (activeEditor_) {
        activeEditor_->flushChild();
        // A tab switch cancels editable drafts, but retains its graph and view.
        activeEditor_->invalidateGesture();
        emit activeEditor_->documentEpochChanged();
    }
    auto target = tabs_[index];
    if (target->childParent_ && target->childParentEpoch_ == target->childParent_->documentEpoch_) {
        const auto stored =
            node_editor::childGraph(target->childParent_->document_.node(target->childNode_));
        if (stored != target->syncedChildGraph_) {
            target->closeChildSurfaces();
            auto snapshot = target->document_.snapshot();
            snapshot["graph"] = stored;
            target->childSyncing_ = true;
            (void)target->document_.load(snapshot);
            target->childSyncing_ = false;
            target->syncedChildGraph_ = stored;
        }
    }
    if (target->inlineChild_ && target->childParent_ &&
        target->childParent_->document_.node(target->childNode_).isEmpty()) {
        closeSurface(index);
        return;
    }
    activeEditor_ = target;
    auto host = target;
    while (host->inlineChild_ && host->childParent_) {
        host = host->childParent_;
    }
    host->shownSurface_ = target;
    projectActive_.insert(host->projectKey(), host);
    target->syncPackSetup();
    packSetup_.activeEditorChanged();
    tabStack_->setCurrentWidget(activeEditor_);
    // The previous strip's hover tooltip belongs to a hidden tab.
    QToolTip::hideText();
    setWindowTitle(activeEditor_->windowTitle());
    setWindowModified(activeEditor_->isWindowModified());
    notifyTabs();
    schedulePanelChanged();
    emit mediaChanged();
    emit zoomChanged();
    emit catalogChanged();
}
bool EditorWindow::confirmTabClose(bool closeAfterSave) {
    if (discardApproved_) {
        return true;
    }
    if (childParent_ &&
        node_editor::childGraphKey(childParent_->document_.node(childNode_)) == "graph" &&
        document_.graph() == node_editor::childGraph(childParent_->document_.node(childNode_))) {
        return true;
    }
    if (!hasUnsavedChanges()) {
        return true;
    }
    tabOwner_->activateSurface(tabOwner_->tabs_.indexOf(this));
    const auto choice = QMessageBox::warning(
        this, tr("Unsaved workflow"), tr("Save changes before closing?"),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel, QMessageBox::Cancel);
    if (choice == QMessageBox::Discard) {
        return true;
    }
    if (choice != QMessageBox::Save) {
        return false;
    }
    if (session_.serverBound()) {
        closeAfterServerSave_ = closeAfterSave;
        session_.save();
        return false;
    }
    action("Save");
    return !hasUnsavedChanges();
}
bool EditorWindow::closeSurface(int index) {
    if (tabOwner_) {
        auto owner = tabOwner_;
        QPointer<EditorWindow> target = owner->tabs_.value(index);
        QTimer::singleShot(0, owner, [owner, target] {
            if (target) {
                owner->closeSurface(owner->tabs_.indexOf(target));
            }
        });
        return true;
    }
    if (index < 0 || index >= tabs_.size()) {
        return false;
    }
    auto tab = tabs_[index];
    if (activeEditor_) {
        activeEditor_->flushChild();
    }
    if (!tab->inlineChild_ && !tab->confirmTabClose(true)) {
        return false;
    }
    // Inline descendants are already written into this document. Closing the
    // owning workflow closes their canvases, as the web subgraph strip does.
    for (int i = tabs_.size() - 1; i >= 0; --i) {
        const auto child = tabs_[i];
        if (child->childParent_ == tab && child->inlineChild_) {
            if (!closeSurface(i)) {
                return false;
            }
        }
    }
    QPointer<EditorWindow> fallback = tab->inlineChild_ ? tab->childParent_ : nullptr;
    if (fallback) {
        const auto position = tabs_.indexOf(tab);
        for (int i = position + 1; i < tabs_.size(); ++i) {
            if (tabs_[i]->inlineChild_ && tabs_[i]->childParent_ == tab->childParent_) {
                fallback = tabs_[i];
                break;
            }
        }
        if (fallback == tab->childParent_) {
            for (int i = position - 1; i >= 0; --i) {
                if (tabs_[i]->inlineChild_ && tabs_[i]->childParent_ == tab->childParent_) {
                    fallback = tabs_[i];
                    break;
                }
            }
        }
    }
    // The web activates the visible neighbour, right before left.
    QPointer<EditorWindow> neighbour;
    if (!tab->inlineChild_) {
        const auto visible = visibleTabs();
        const auto at = visible.indexOf(tab);
        if (at >= 0) {
            neighbour = visible.value(at + 1, visible.value(at - 1));
        }
        if (neighbour && neighbour->shownSurface_) {
            neighbour = neighbour->shownSurface_;
        }
    }
    index = tabs_.indexOf(tab);
    const bool wasActive = activeEditor_ == tab;
    tabs_.removeAt(index);
    tabStack_->removeWidget(tab);
    if (wasActive) {
        activeEditor_ = nullptr;
    }
    if (tab->chat_.hasActiveTurns()) {
        retainedChatHosts_.append(tab);
        tab->hide();
        connect(&tab->chat_, &nt::chat::ChatSession::stateChanged, tab, [tab] {
            if (!tab->chat_.hasActiveTurns()) {
                tab->deleteLater();
            }
        });
        connect(&session_, &node_editor::WorkflowSession::credentialsChanged, tab,
            [tab] { tab->chat_.disconnectFromServer(); });
    } else {
        // native-rules #2: naked delete on a Qt child that also has a parent or scene owner
        delete tab;
    }
    if (tabs_.isEmpty()) {
        newTab();
    } else if (wasActive) {
        const auto next = fallback ? fallback : neighbour;
        activateSurface(next ? tabs_.indexOf(next) : qMin(index, int(tabs_.size()) - 1));
    } else {
        notifyTabs();
    }
    return true;
}
void EditorWindow::persistTabs() const {
    if (tabOwner_) {
        tabOwner_->persistTabs();
        return;
    }
    QJsonArray entries;
    auto active = activeEditor_;
    while (active && active->childParent_) {
        active = active->childParent_;
    }
    int activeEntry = 0;
    for (auto tab : tabs_) {
        if (tab->childParent_) {
            continue;
        }
        if (tab == active) {
            activeEntry = entries.size();
        }
        entries.append(QJsonObject{{"file", tab->file_},
                                   {"workflow", tab->session_.serverBound()
                                                    ? tab->session_.workflow()["id"].toString()
                                                    : tab->requestedWorkflow_},
                                   {"origin", tab->session_.serverUrl().toString()},
                                   {"project", tab->projectKey()}});
    }
    QSettings settings;
    settings.setValue("workflowTabs/documents",
                      QJsonDocument(entries).toJson(QJsonDocument::Compact));
    settings.setValue("workflowTabs/active", activeEntry);
}
void EditorWindow::restoreTabs() {
    if (tabOwner_) {
        tabOwner_->restoreTabs();
        return;
    }
    QSettings settings;
    const auto entries =
        QJsonDocument::fromJson(settings.value("workflowTabs/documents").toByteArray()).array();
    if (entries.isEmpty()) {
        return;
    }
    QList<EditorWindow *> restored;
    for (int i = 0; i < entries.size(); ++i) {
        if (i)
            newTab();
        auto tab = activeEditor_;
        restored.append(tab);
        const auto entry = entries[i].toObject();
        tab->assignedProject_ = entry["project"].toString();
        const auto path = entry["file"].toString();
        const auto id = entry["workflow"].toString();
        if (!path.isEmpty())
            tab->openFile(path);
        else if (!id.isEmpty()) {
            tab->session_.connectToServer(QUrl(entry["origin"].toString()),
                                          qEnvironmentVariable("NODETOOL_TOKEN"));
            tab->requestedWorkflow_ = id;
            tab->session_.openWorkflow(id);
        }
    }
    const auto active = restored.value(settings.value("workflowTabs/active", 0).toInt(), restored.first());
    activateSurface(tabs_.indexOf(active));
    notifyTabs();
}
QQuickWidget *EditorWindow::tabBarWidget() const {
    for (auto widget : findChildren<QQuickWidget *>()) {
        if (widget->source().fileName() == "TabBar.qml") {
            return widget;
        }
    }
    return nullptr;
}
void EditorWindow::dropTab(int source, int target, bool after) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    const auto visible = owner->visibleTabs();
    if (source < 0 || target < 0 || source >= visible.size() || target >= visible.size() || source == target) {
        return;
    }
    // Tabs of other projects keep their places, as web gatherProjectTabs does.
    const auto moved = visible[source];
    owner->tabs_.removeOne(moved);
    owner->tabs_.insert(owner->tabs_.indexOf(visible[target]) + (after ? 1 : 0), moved);
    owner->notifyTabs();
    // The web store persists every reorder, so a restart restores the order.
    owner->persistTabs();
}
void EditorWindow::showTabMenu(int index, const QPointF &global) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    QPointer<EditorWindow> target = owner->visibleTabs().value(index);
    if (!target) {
        return;
    }
    auto menu = new QMenu(this);
    menu->setObjectName("workflow-tab-menu");
    menu->setAttribute(Qt::WA_DeleteOnClose);
    // The menu belongs to a tab that a choice may close, so choices run later.
    const auto later = [owner](std::function<void()> work) {
        return [owner, work] { QTimer::singleShot(0, owner, work); };
    };
    // web/src/components/workspace/WorkspaceTabItem.tsx lists these entries.
    if (!target->childParent_) {
        menu->addAction(tr("Rename"), owner, later([owner, target] {
            if (!target) {
                return;
            }
            auto shown = target->shownSurface_ ? target->shownSurface_.data() : target.data();
            owner->activateSurface(owner->tabs_.indexOf(shown));
            auto surface = owner->activeEditor_;
            if (auto bar = surface->tabBarWidget()) {
                bar->setFocus(Qt::OtherFocusReason);
            }
            surface->documentTabs_.beginRename(owner->visibleTabs().indexOf(target));
        }));
    }
    menu->addAction(tr("Close tab"), owner, later([owner, target] {
        if (target) {
            owner->closeSurface(owner->tabs_.indexOf(target));
        }
    }));
    menu->addAction(tr("Close other tabs"), owner, later([owner, target] {
        if (target) {
            owner->closeOtherTabs(owner->visibleTabs().indexOf(target));
        }
    }));
    menu->addAction(tr("Close all tabs"), owner, later([owner] { owner->closeAllTabs(); }));
    menu->popup(global.toPoint());
}
void EditorWindow::closeOtherTabs(int index) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    auto targets = owner->visibleTabs();
    const auto keep = targets.value(index);
    if (!keep) {
        return;
    }
    targets.removeOne(keep);
    owner->closeTabs(targets, keep);
}
void EditorWindow::closeAllTabs() {
    auto owner = tabOwner_ ? tabOwner_ : this;
    QList<EditorWindow *> targets;
    for (auto tab : owner->tabs_) {
        if (!tab->inlineChild_) {
            targets.append(tab);
        }
    }
    owner->closeTabs(targets, nullptr);
}
void EditorWindow::closeTabs(const QList<EditorWindow *> &targets, EditorWindow *keep) {
    const QList<QPointer<EditorWindow>> pending(targets.cbegin(), targets.cend());
    QPointer<EditorWindow> kept = keep;
    if (activeEditor_) {
        activeEditor_->flushChild();
    }
    // The web asks about every unsaved document before it closes any of them.
    QList<EditorWindow *> approved;
    for (const auto &tab : pending) {
        if (!tab || !tab->hasUnsavedChanges()) {
            continue;
        }
        if (!tab->confirmTabClose(true)) {
            return;
        }
        if (tab) {
            approved.append(tab);
        }
    }
    if (kept) {
        activateSurface(tabs_.indexOf(kept->shownSurface_ ? kept->shownSurface_.data() : kept.data()));
    }
    for (const auto &tab : pending) {
        if (!tab) {
            continue;
        }
        // A document that changed after the question was not approved.
        tab->discardApproved_ = approved.contains(tab.data());
        const auto closed = closeSurface(tabs_.indexOf(tab));
        if (tab) {
            tab->discardApproved_ = false;
        }
        if (!closed) {
            return;
        }
    }
}
void EditorWindow::renameTab(int index, const QString &name) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    const auto target = owner->visibleTabs().value(index);
    const auto trimmed = name.trimmed();
    if (!target || target->childParent_ || trimmed.isEmpty() || trimmed == target->workflowName()) {
        return;
    }
    if (target->session_.serverBound()) {
        target->versions_.saveMetadata({{"name", trimmed}});
        target->schedulePanelChanged();
        return;
    }
    auto workflow = target->document_.snapshot();
    workflow.insert("name", trimmed);
    target->document_.reconcileMetadata(workflow);
    if (!target->file_.isEmpty()) {
        (void)target->saveFile(target->file_);
    }
    target->schedulePanelChanged();
}
void EditorWindow::showTabToolTip(const QString &text, const QPointF &global) {
    if (text.isEmpty()) {
        QToolTip::hideText();
        return;
    }
    // A hover that began in a strip that is now hidden shows nothing.
    if (tabOwner_ && tabOwner_->activeEditor_ != this) {
        return;
    }
    QToolTip::showText(global.toPoint(), text, this);
}
void EditorWindow::setTabStripOffset(qreal offset) {
    // Only the shown strip scrolls. Hidden strips keep stale widths.
    if (tabOwner_ && tabOwner_->activeEditor_ != this) {
        return;
    }
    auto owner = tabOwner_ ? tabOwner_ : this;
    owner->tabStripOffset_ = offset;
    for (auto tab : owner->tabs_) {
        tab->documentTabs_.setStripOffset(offset);
    }
}
void EditorWindow::syncDocumentTabs() {
    documentTabs_.setTabs(workflowTabs(), activeTab(), projectName(), canvasStrips());
    documentTabs_.setStripOffset(tabStripOffset());
}
qreal EditorWindow::tabStripOffset() const {
    return (tabOwner_ ? tabOwner_ : this)->tabStripOffset_;
}
void EditorWindow::selectAdjacentTab(int step) {
    const auto count = visibleTabs().size();
    if (count == 0) {
        return;
    }
    // web/src/hooks/useNodeEditorShortcuts.ts wraps at either end.
    const auto current = activeTab();
    if (step < 0) {
        activateTab(current <= 0 ? count - 1 : current - 1);
    } else {
        activateTab(current >= count - 1 ? 0 : current + 1);
    }
}
void EditorWindow::installTabShortcuts() {
    const auto bind = [this](const QString &keys, const std::function<void()> &work) {
        auto shortcut = new QShortcut(QKeySequence(keys), this);
        shortcut->setContext(Qt::WindowShortcut);
        connect(shortcut, &QShortcut::activated, this, work);
    };
    // web/src/config/shortcuts.ts: prevTab, nextTab, switchToTab1-9,
    // newWorkflow and closeWorkflow.
    for (const auto &keys : {"Ctrl+PgUp", "Ctrl+Shift+[", "Ctrl+Alt+Left"}) {
        bind(QString::fromLatin1(keys), [this] { selectAdjacentTab(-1); });
    }
    for (const auto &keys : {"Ctrl+PgDown", "Ctrl+Shift+]", "Ctrl+Alt+Right"}) {
        bind(QString::fromLatin1(keys), [this] { selectAdjacentTab(1); });
    }
    for (int n = 1; n <= 9; ++n) {
        bind(QString("Ctrl+%1").arg(n), [this, n] { activateTab(n - 1); });
    }
    bind("Ctrl+T", [this] { newTab(); });
    bind("Ctrl+W", [this] { closeTab(activeTab()); });
}
void EditorWindow::harvestProjects(const QJsonArray &projects) {
    QJsonArray named;
    for (const auto &value : projects) {
        const auto row = value.toObject();
        const auto id = row["id"].toString();
        if (id.isEmpty() || id == "default" || id.startsWith("personal:") || row["isPersonal"].toBool()) {
            continue;
        }
        named.append(QJsonObject{{"id", id}, {"name", row["name"].toString()}});
    }
    if (named.isEmpty() || named == projects_) {
        return;
    }
    projects_ = named;
    notifyTabs();
    populateProjectMenu();
}
void EditorWindow::showProjectMenu(const QPointF &global) {
    auto owner = tabOwner_ ? tabOwner_ : this;
    if (owner->projectMenu_) {
        owner->projectMenu_->close();
    }
    auto menu = new QMenu(this);
    menu->setObjectName("project-menu");
    menu->setAttribute(Qt::WA_DeleteOnClose);
    owner->projectMenu_ = menu;
    owner->populateProjectMenu();
    menu->popup(global.toPoint());
    auto active = owner->activeEditor_;
    if (active && !active->session_.serverUrl().isEmpty()) {
        active->browser_.loadProjects();
    }
}
void EditorWindow::populateProjectMenu() {
    auto menu = projectMenu_.data();
    if (!menu) {
        return;
    }
    menu->clear();
    // Personal comes first, then the named projects and any project with an
    // open document, as in web/src/components/projects/ProjectSelector.tsx.
    QStringList keys{QString()};
    QHash<QString, QString> names;
    for (const auto &value : projects_) {
        const auto row = value.toObject();
        keys.append(row["id"].toString());
        names.insert(row["id"].toString(), row["name"].toString());
    }
    for (auto tab : tabs_) {
        const auto key = tab->projectKey();
        if (tab->inlineChild_ || keys.contains(key)) {
            continue;
        }
        keys.append(key);
        names.insert(key, tab->workflowName());
    }
    const auto active = activeProject();
    for (const auto &key : keys) {
        auto action = menu->addAction(key.isEmpty() ? tr("Personal") : names.value(key));
        action->setCheckable(true);
        action->setChecked(key == active);
        connect(action, &QAction::triggered, this, [this, key] {
            QTimer::singleShot(0, this, [this, key] { selectProject(key); });
        });
    }
}
void EditorWindow::selectProject(const QString &project) {
    if (tabOwner_) {
        tabOwner_->selectProject(project);
        return;
    }
    if (project == activeProject()) {
        return;
    }
    QPointer<EditorWindow> target = projectActive_.value(project);
    if (!target || !tabs_.contains(target) || target->projectKey() != project) {
        target = nullptr;
        for (auto tab : tabs_) {
            if (!tab->inlineChild_ && tab->projectKey() == project) {
                target = tab;
                break;
            }
        }
    }
    if (target) {
        activateSurface(tabs_.indexOf(target->shownSurface_ ? target->shownSurface_.data() : target.data()));
        return;
    }
    // Native has no project home, so a project without open documents gets a
    // blank workflow.
    newTab();
    activeEditor_->assignedProject_ = project;
    notifyTabs();
    activeEditor_->schedulePanelChanged();
}
} // namespace nodetool

namespace nodetool {
void EditorWindow::openChild() {
  if (!tabOwner_) {
    activeEditor_->openChild();
    return;
  }
  const auto node = document_.node(selected_);
  if (!node_editor::isChildNode(node)) {
    message_ = tr("Select a subgraph, workflow or app node.");
    schedulePanelChanged();
    return;
  }
  auto owner = tabOwner_;
  for (int i = 0; i < owner->tabs_.size(); ++i) {
    auto tab = owner->tabs_[i];
    if (tab->childParent_ == this && tab->childNode_ == selected_ &&
        tab->childParentEpoch_ == documentEpoch_) {
      owner->activateSurface(i);
      return;
    }
  }
  const auto key = node_editor::childGraphKey(node);
  const auto data = node["data"].toObject();
  const auto snapshot = data[key].toObject();
  const auto graph = node_editor::childGraph(node);
  const auto id = key == "workflow_json"
                      ? data["workflow_id"].toString(snapshot["id"].toString())
                      : snapshot["workflow_id"].toString();
  if (key == "app_json" && graph.isEmpty() && id.isEmpty() &&
      !data["app_id"].toString().isEmpty() && !owner->tabsOrigin_.isEmpty()) {
    const auto epoch = documentEpoch_, credentials = credentialsEpoch_;
    const auto nodeId = selected_;
    auto network = new QNetworkAccessManager(this);
    auto url = owner->tabsOrigin_.resolved(QUrl("/trpc/applications.get"));
    QUrlQuery query;
    query.addQueryItem(
        "input",
        QString::fromUtf8(QJsonDocument(QJsonObject{{"id", data["app_id"]}})
                              .toJson(QJsonDocument::Compact)));
    url.setQuery(query);
    QNetworkRequest request(url);
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader("Authorization",
                         "Bearer " + owner->tabsToken_.toUtf8());
    auto reply = network->get(request);
    message_ = tr("Loading app workflow…");
    schedulePanelChanged();
    connect(
        reply, &QNetworkReply::finished, this,
        [this, reply, network, epoch, credentials, nodeId] {
          const auto bytes = reply->readAll();
          const auto error = reply->error();
          network->deleteLater();
          if (epoch != documentEpoch_ || credentials != credentialsEpoch_ ||
              document_.node(nodeId).isEmpty()) {
            return;
          }
          if (error != QNetworkReply::NoError) {
            message_ = tr(
                "App could not be loaded. Check the account and connection.");
            schedulePanelChanged();
            return;
          }
          const auto application = QJsonDocument::fromJson(bytes)
                                       .object()["result"]
                                       .toObject()["data"]
                                       .toObject();
          auto document = application["document"].toObject();
          if (application["document"].isString()) {
            document = QJsonDocument::fromJson(
                           application["document"].toString().toUtf8())
                           .object();
          }
          const auto old =
              document_.node(nodeId)["data"].toObject()["app_json"].toObject();
          QJsonObject operation;
          for (const auto &v : document["operations"].toArray()) {
            const auto op = v.toObject();
            if (!op["workflowId"].toString().isEmpty() &&
                (operation.isEmpty() || op["id"] == old["operation_id"])) {
              operation = op;
            }
          }
          if (operation.isEmpty()) {
            message_ = tr("App has no workflow operation.");
            schedulePanelChanged();
            return;
          }
          auto snapshot = old;
          snapshot["name"] = application["name"];
          snapshot["operation_id"] = operation["id"];
          snapshot["workflow_id"] = operation["workflowId"];
          QJsonObject constants;
          // Input names are resolved once the workflow has loaded in the child.
          snapshot["input_bindings"] = operation["inputs"];
          snapshot["variables"] = document["variables"];
          snapshot["constants"] = constants;
          const auto result =
              document_.applyCommand({{"op", "setChildSnapshot"},
                                      {"id", nodeId},
                                      {"graph", QJsonObject{}},
                                      {"snapshot", snapshot}},
                                     tr("Load app workflow"));
          if (!result) {
            message_ = result.error;
            schedulePanelChanged();
            return;
          }
          selected_ = nodeId;
          openChild();
        });
    return;
  }
  if (key != "graph" && graph.isEmpty() && id.isEmpty()) {
    message_ =
        tr("Child workflow is missing. Select a workflow in the web editor.");
    schedulePanelChanged();
    return;
  }
  owner->newTab();
  auto child = owner->activeEditor_;
  child->childParent_ = this;
    child->inlineChild_ = key == "graph";
    if (child->inlineChild_) {
        connect(this, &EditorWindow::panelChanged, child, &EditorWindow::schedulePanelChanged);
    }
  child->childNode_ = selected_;
  child->childParentEpoch_ = documentEpoch_;
  child->syncedChildGraph_ = graph;
  child->childSyncing_ = true;
  auto workflow = snapshot;
  workflow["name"] = node["ui_properties"].toObject()["title"].toString(
      snapshot["name"].toString(key == "graph" ? tr("Subgraph")
                                               : tr("Linked workflow")));
  workflow["graph"] =
      graph.isEmpty() ? QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}} : graph;
  (void)child->document_.load(workflow);
  child->childSyncing_ = false;
    child->childWriteTimer_ = new QTimer(child);
    child->childWriteTimer_->setSingleShot(true);
    child->childWriteTimer_->setInterval(300);
    connect(child->childWriteTimer_, &QTimer::timeout, child, &EditorWindow::syncChild);
    connect(&child->document_, &node_editor::WorkflowDocument::changed, child, [child] {
        if (child->childSyncing_) {
            return;
        }
        if (child->inlineChild_) {
            child->childWriteTimer_->start();
        } else {
            child->syncChild();
        }
    });
    connect(&child->session_, &node_editor::WorkflowSession::credentialsChanged, child, [child] {
        if (!child->inlineChild_) {
            child->childParent_.clear();
        }
    });
  if (key != "graph" && !id.isEmpty() && !owner->tabsOrigin_.isEmpty()) {
      child->requestedWorkflow_ = id;
      child->session_.openWorkflow(id);
  }
  child->fit();
    auto host = child;
    while (host->inlineChild_ && host->childParent_) {
        host = host->childParent_;
    }
    host->shownSurface_ = child;
    owner->notifyTabs();
}
void EditorWindow::syncChild() {
    if (childSyncing_ || !childParent_ || childParentEpoch_ != childParent_->documentEpoch_) {
        return;
    }
    const auto node = childParent_->document_.node(childNode_);
    if (node.isEmpty()) {
        message_ = tr("The parent node was removed. Child edits are retained in this tab.");
        schedulePanelChanged();
        return;
    }
    const auto graph = document_.graph();
    if (graph == syncedChildGraph_) {
        return;
    }
    const auto result = childParent_->document_.applyCommand(
        {{"op", "setChildGraph"}, {"id", childNode_}, {"graph", graph}},
        tr("Edit child graph and synchronize ports"));
    if (!result) {
        message_ = result.error;
        schedulePanelChanged();
        return;
    }
    syncedChildGraph_ = graph;
}
void EditorWindow::showLinkedWorkflows() {
  auto menu = new QMenu(this);
  menu->setObjectName("linked-workflows-menu");
  menu->setAttribute(Qt::WA_DeleteOnClose);
  connect(this, &EditorWindow::documentEpochChanged, menu, &QMenu::close);
  connect(this, &EditorWindow::credentialsEpochChanged, menu, &QMenu::close);
  for (const auto &v : document_.nodes()) {
    const auto node = v.toObject();
    const auto key = node_editor::childGraphKey(node);
    if (key != "workflow_json" && key != "app_json") {
      continue;
    }
    auto entry =
        menu->addAction(node["ui_properties"].toObject()["title"].toString(
            node["data"].toObject()[key].toObject()["name"].toString(
                node["id"].toString())));
    connect(entry, &QAction::triggered, this, [this, node] {
      selectNode(node["id"].toString());
      openChild();
    });
  }
  if (menu->actions().isEmpty()) {
    menu->addAction(tr("No linked workflows"))->setEnabled(false);
  }
  menu->popup(mapToGlobal(rect().center()));
}
} // namespace nodetool

void nodetool::EditorWindow::syncPackSetup() {
  if (!tabOwner_ || tabOwner_->activeEditor_ != this) {
    return;
  }
  QStringList types;
  for (const auto &value : document_.nodes()) {
    types.append(value.toObject()["type"].toString());
  }
  packSetup()->configure(packOrigin_, packToken_, packUser_);
  packSetup()->setNodeTypes(types);
}

namespace nodetool {
void EditorWindow::refreshChildReferences() {
  if (!tabOwner_ || tabOwner_->tabsOrigin_.isEmpty()) {
    return;
  }
  const auto epoch = documentEpoch_, credentials = credentialsEpoch_;
  for (const auto &v : document_.nodes()) {
    const auto node = v.toObject();
    const auto key = node_editor::childGraphKey(node);
    if (key != "workflow_json" && key != "app_json") {
      continue;
    }
    const auto data = node["data"].toObject(), stored = data[key].toObject();
    const auto id = key == "workflow_json"
                        ? data["workflow_id"].toString(stored["id"].toString())
                        : stored["workflow_id"].toString();
    if (id.isEmpty() || id == document_.snapshot()["id"].toString()) {
      continue;
    }
    auto network = new QNetworkAccessManager(this);
    QNetworkRequest request(tabOwner_->tabsOrigin_.resolved(QUrl(
        "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)))));
    request.setTransferTimeout(30000);
    request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
    request.setRawHeader("Authorization",
                         "Bearer " + tabOwner_->tabsToken_.toUtf8());
    auto reply = network->get(request);
    connect(
        reply, &QNetworkReply::finished, this,
        [this, reply, network, epoch, credentials, node, key, stored, id] {
          const auto bytes = reply->readAll();
          const auto error = reply->error();
          network->deleteLater();
          if (epoch != documentEpoch_ || credentials != credentialsEpoch_ ||
              document_.node(node["id"].toString())["data"] != node["data"]) {
            return;
          }
          const auto workflow = QJsonDocument::fromJson(bytes).object();
          if (error != QNetworkReply::NoError || workflow["id"] != id ||
              !workflow["graph"].isObject()) {
            message_ = tr("Linked workflow %1 could not be loaded. The stored "
                          "child graph is retained.")
                           .arg(id);
            schedulePanelChanged();
            return;
          }
          auto snapshot = stored;
          snapshot["graph"] = workflow["graph"];
          if (key == "workflow_json") {
            snapshot["id"] = id;
            snapshot["name"] = workflow["name"];
          }
          const auto result =
              document_.applyCommand({{"op", "setChildSnapshot"},
                                      {"id", node["id"]},
                                      {"graph", workflow["graph"]},
                                      {"snapshot", snapshot}},
                                     tr("Synchronize linked workflow ports"));
          if (!result) {
            message_ = result.error;
            schedulePanelChanged();
          }
        });
  }
}
} // namespace nodetool
