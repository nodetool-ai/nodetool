// The tab bar notifications and settings, the inspector footer and its cost
// estimate, and the status bar tabs. Web sources: components/panels/NotificationButton.tsx,
// SettingsHeaderButton.tsx, inspector/RunSelectedNodesSection.tsx,
// costs/WorkflowCostEstimatePanel.tsx and panels/PanelBottom.tsx.
#include "EditorWindow.h"
#include <QtMath>
#include <QSettings>
#include "graph/CanvasDropController.h"
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QDateTime>
#include <QDockWidget>
#include <QGraphicsView>
#include <QJsonDocument>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QScreen>
#include <QSysInfo>
#include <QTimer>
#include <algorithm>
#include <cmath>

namespace nodetool {
namespace {
// formatUsd in packages/node-sdk/src/cost-estimate.ts: three decimals from a
// cent up, enough decimals to show a sub-cent figure, trailing zeros removed.
QString formatUsd(double usd) {
  const auto trim = [](QString text) {
    if (text.contains('.')) {
      while (text.endsWith('0')) { text.chop(1); }
      if (text.endsWith('.')) { text.chop(1); }
    }
    return text;
  };
  if (!std::isfinite(usd) || usd <= 0) { return QStringLiteral("$0"); }
  if (usd >= 0.01) { return '$' + trim(QString::number(usd, 'f', 3)); }
  const int places = std::min(12, int(std::ceil(-std::log10(usd))) + 2);
  return '$' + trim(QString::number(usd, 'f', places));
}

// The compact caption of WorkflowCostEstimatePanel.tsx, read from the
// preflight cost summary. The summary has no per-node rows, so a lower bound
// ("≥") cannot be told apart and an estimate reads as approximate ("~").
QString costCaption(const QJsonObject &cost) {
  const auto unknown = cost["unknown_cost_nodes"].toArray().size();
  const auto confidence = cost["confidence"].toString();
  const bool priced = cost["amount"].isDouble() && confidence != "unknown";
  const double amount = cost["amount"].toDouble();
  if (cost.isEmpty() || (unknown == 0 && confidence == "exact" && amount <= 0)) {
    return QObject::tr("Per run");
  }
  const auto total = (confidence == "estimate" ? QStringLiteral("~") : QString()) + (priced ? formatUsd(amount) : QStringLiteral("—"));
  return unknown > 0 ? QObject::tr("%1 · incomplete").arg(total) : QObject::tr("%1 / run").arg(total);
}

bool terminalStatus(const QString &status) {
  return status == "completed" || status == "finished" || status == "failed" || status == "cancelled" || status == "error";
}
} // namespace

void EditorWindow::initializePanels() {
  costTimer_ = new QTimer(this);
  costTimer_->setSingleShot(true);
  costTimer_->setInterval(300);
  connect(costTimer_, &QTimer::timeout, this, &EditorWindow::requestCostEstimate);
  connect(&session_, &node_editor::WorkflowSession::workflowOpened, costTimer_, qOverload<>(&QTimer::start));
  connect(&session_, &node_editor::WorkflowSession::saved, costTimer_, qOverload<>(&QTimer::start));
  connect(&session_, &node_editor::WorkflowSession::credentialsChanged, this, [this] {
    costTimer_->stop();
    costEstimate_.clear();
    emit costEstimateChanged();
  });
  connect(&session_, &node_editor::WorkflowSession::errorOccurred, this, [this](const QString &message) {
    notify(QStringLiteral("error"), message);
  });
  if (canvasDrops_) {
    connect(canvasDrops_, &CanvasDropController::errorOccurred, this, [this](const QString &message) {
      notify(QStringLiteral("error"), message);
    });
  }
  connect(&session_, &node_editor::WorkflowSession::runEvent, this, [this](const QString &id, const QJsonObject &event) {
    const auto status = event["status"].toString();
    if (event["type"] != "job_update" || !terminalStatus(status)) { return; }
    if (status == "failed" && !event["error"].toString().isEmpty()) {
      notify(QStringLiteral("error"), event["error"].toString());
    }
    if (id != runsJob_ || runsTotal_ == 0) { return; }
    // The web sequence stops at the first run that does not end idle.
    if ((status == "completed" || status == "finished") && runsCurrent_ < runsTotal_) {
      ++runsCurrent_;
      runsJob_.clear();
      QTimer::singleShot(0, this, [this] {
        const auto previous = run_;
        action(QStringLiteral("Run selected"));
        if (run_ != previous && !run_.isEmpty()) { runsJob_ = run_; } else { runsTotal_ = runsCurrent_ = 0; }
        schedulePanelChanged();
      });
    } else {
      runsTotal_ = runsCurrent_ = 0;
      runsJob_.clear();
    }
    schedulePanelChanged();
  });
  connect(this, &EditorWindow::documentEpochChanged, this, [this] {
    runsTotal_ = runsCurrent_ = 0;
    runsJob_.clear();
    costEstimate_.clear();
    emit costEstimateChanged();
  });
}

QVariantList EditorWindow::notifications() const {
  const auto *owner = tabOwner_ ? tabOwner_ : this;
  return owner->notifications_;
}

int EditorWindow::unreadNotifications() const {
  const auto *owner = tabOwner_ ? tabOwner_ : this;
  return int(std::count_if(owner->notifications_.cbegin(), owner->notifications_.cend(), [owner](const QVariant &entry) {
    return !owner->notificationsSeen_.isValid() || entry.toMap()["timestamp"].toDateTime() > owner->notificationsSeen_;
  }));
}

void EditorWindow::notify(const QString &type, const QString &content) {
  if (content.trimmed().isEmpty()) { return; }
  auto *owner = tabOwner_ ? tabOwner_ : this;
  owner->notifications_.append(QVariantMap{{"type", type}, {"content", content}, {"timestamp", QDateTime::currentDateTime()}});
  // A long session keeps the newest entries.
  while (owner->notifications_.size() > 200) { owner->notifications_.removeFirst(); }
  emit owner->notificationsChanged();
  for (auto *tab : owner->tabs_) { emit tab->notificationsChanged(); }
}

void EditorWindow::syncNotifications() {
  notificationList_.setEntries(notifications());
  notificationList_.setUnread(unreadNotifications());
}

void EditorWindow::showNotifications(const QPointF &global) {
  auto *owner = tabOwner_ ? tabOwner_ : this;
  owner->notificationsSeen_ = QDateTime::currentDateTime();
  emit owner->notificationsChanged();
  for (auto *tab : owner->tabs_) { emit tab->notificationsChanged(); }
  if (!engine_) { return; }
  if (!notificationPopup_) {
    auto *popup = new QQuickWidget(engine_, this);
    popup->setWindowFlags(Qt::Popup | Qt::FramelessWindowHint);
    // The QML panel draws its own rounded border, so the window stays transparent.
    popup->setAttribute(Qt::WA_TranslucentBackground);
    popup->setClearColor(Qt::transparent);
    popup->setAttribute(Qt::WA_DeleteOnClose);
    popup->setResizeMode(QQuickWidget::SizeRootObjectToView);
    popup->setInitialProperties({{"notifications", QVariant::fromValue(&notificationList_)}});
    popup->setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/NotificationsPanel.qml")));
    notificationPopup_ = popup;
  }
  auto *popup = notificationPopup_.data();
  const auto size = popup->rootObject() ? QSize(qCeil(popup->rootObject()->implicitWidth()), qCeil(popup->rootObject()->implicitHeight())) : QSize(600, 160);
  // The web popover hangs from the bell's right edge (placement="bottom-right").
  QPoint origin(qRound(global.x()) - size.width(), qRound(global.y()));
  if (const auto *screen = this->screen()) {
    const auto area = screen->availableGeometry();
    origin.setX(std::clamp(origin.x(), area.left(), std::max(area.left(), area.right() - size.width())));
  }
  popup->setGeometry(QRect(origin, size));
  popup->show();
  popup->raise();
}

void EditorWindow::openSettings() {
  if (!tabOwner_) { activeEditor_->openSettings(); return; }
  if (session_.serverUrl().isEmpty()) {
    message_ = tr("Connect to a server to open settings.");
    schedulePanelChanged();
    return;
  }
  QDesktopServices::openUrl(session_.serverUrl().resolved(QUrl(QStringLiteral("/settings"))));
}

void EditorWindow::copyText(const QString &text) {
  QGuiApplication::clipboard()->setText(text);
}

void EditorWindow::reportBug(node_editor::BugReportContext context) {
  if (context.workflowId.isEmpty()) { context.workflowId = document_.snapshot()["id"].toString(); }
  if (context.jobId.isEmpty()) { context.jobId = run_; }
  const auto system = QStringLiteral("NodeTool native editor\nQt %1\n%2 (%3)")
                          .arg(QString::fromLatin1(qVersion()), QSysInfo::prettyProductName(), QSysInfo::currentCpuArchitecture());
  QDesktopServices::openUrl(node_editor::bugReportUrl(context, system));
}

void EditorWindow::reportError(const QString &source, const QString &text) {
  reportBug({.source = source, .errorText = text});
}

QVariantMap EditorWindow::costEstimate() const {
  if (!tabOwner_) { return activeEditor_->costEstimate(); }
  return costEstimate_;
}

void EditorWindow::requestCostEstimate() {
  if (!session_.serverBound()) { return; }
  const auto documentEpoch = documentEpoch_, credentialsEpoch = credentialsEpoch_;
  session_.preflightCost([this, documentEpoch, credentialsEpoch](const QJsonObject &cost, const QString &error) {
    if (documentEpoch != documentEpoch_ || credentialsEpoch != credentialsEpoch_) { return; }
    costEstimate_ = error.isEmpty() ? QVariantMap{{"available", true}, {"caption", costCaption(cost)}} : QVariantMap{};
    emit costEstimateChanged();
  });
}

void EditorWindow::runSelectedNodes(int runs) {
  if (!tabOwner_) { activeEditor_->runSelectedNodes(runs); return; }
  // MIN_RUNS and MAX_RUNS in web/src/hooks/nodes/useRunSelectedNodes.ts.
  const int total = std::clamp(runs, 1, 32);
  const auto previous = run_;
  runsJob_.clear();
  runsTotal_ = runsCurrent_ = 0;
  action(QStringLiteral("Run selected"));
  if (run_ != previous && !run_.isEmpty()) {
    runsTotal_ = total;
    runsCurrent_ = 1;
    runsJob_ = run_;
  }
  schedulePanelChanged();
}

QVariantMap EditorWindow::runProgress() const {
  if (!tabOwner_) { return activeEditor_->runProgress(); }
  if (runsTotal_ == 0) { return {}; }
  return {{"current", runsCurrent_}, {"total", runsTotal_}};
}

bool EditorWindow::traceVisible() const {
  if (!tabOwner_) { return activeEditor_->traceVisible(); }
  const auto *dock = findChild<QDockWidget *>(QStringLiteral("run-trace-dock"));
  return dock && !dock->isHidden();
}

bool EditorWindow::versionsVisible() const {
  if (!tabOwner_) { return activeEditor_->versionsVisible(); }
  const auto *dock = findChild<QDockWidget *>(QStringLiteral("workflow-versions-dock"));
  return dock && !dock->isHidden();
}

bool EditorWindow::queueVisible() const {
  if (!tabOwner_) { return activeEditor_->queueVisible(); }
  const auto *queue = queueOverlay_ ? queueOverlay_->rootObject() : nullptr;
  return queue && queue->property("presented").toBool() && queue->property("showList").toBool();
}

QRect EditorWindow::queueArea() const {
  return {view_->mapTo(centralWidget(), QPoint(0, 0)), view_->size()};
}

QSize EditorWindow::queueSize(const QRect &area) const {
  using node_editor::docked_overlay::margin;
  constexpr int width = 304;
  const auto *root = queueOverlay_ ? queueOverlay_->rootObject() : nullptr;
  const int desired = root ? qCeil(root->property("contentHeight").toReal()) : 0;
  return {std::clamp(area.width() - 2 * margin, 0, width), std::clamp(area.height() - 2 * margin, 0, desired)};
}

void EditorWindow::moveQueue(double dx, double dy) {
  if (!queueOverlay_) { return; }
  using namespace node_editor::docked_overlay;
  const auto area = queueArea();
  const auto size = queueSize(area);
  const auto from = queueDragPoint_.value_or(queueOverlay_->pos());
  const QPoint to = from + QPoint(qRound(dx), qRound(dy));
  // Clamped at each step, so a pointer that went past an edge moves the
  // overlay again as soon as it comes back toward it.
  queueDragPoint_ = place({false, false, to.x() - area.left(), to.y() - area.top()}, area, size);
  queueOverlay_->move(*queueDragPoint_);
}

void EditorWindow::finishQueueMove() {
  if (!queueDragPoint_) { return; }
  const auto area = queueArea();
  const auto position = node_editor::docked_overlay::dockAt(*queueDragPoint_, area, queueSize(area));
  queueDragPoint_.reset();
  setQueuePosition(position);
}

void EditorWindow::nudgeQueue(double dx, double dy) {
  if (!queueOverlay_) { return; }
  const auto area = queueArea();
  setQueuePosition(node_editor::docked_overlay::dockAt(queueOverlay_->pos() + QPoint(qRound(dx), qRound(dy)), area, queueSize(area)));
}

void EditorWindow::resetQueuePosition() { setQueuePosition(std::nullopt); }

void EditorWindow::setQueuePosition(std::optional<node_editor::docked_overlay::Position> position) {
  QSettings settings;
  if (position) {
    settings.setValue("queueOverlay/position", node_editor::docked_overlay::toVariant(*position));
  } else {
    settings.remove("queueOverlay/position");
  }
  // The position holds for every workflow tab, as the web keeps one per user.
  const auto tabs = tabOwner_ ? tabOwner_->tabs_ : QList<EditorWindow *>{this};
  for (auto *tab : tabs) {
    tab->queuePosition_ = position;
    tab->layoutOverlays();
  }
  if (!tabs.contains(this)) {
    queuePosition_ = position;
    layoutOverlays();
  }
}

void EditorWindow::toggleQueue() {
  if (!tabOwner_) { activeEditor_->toggleQueue(); return; }
  auto *queue = queueOverlay_ ? queueOverlay_->rootObject() : nullptr;
  if (!queue) { return; }
  // The web Queue tab opens the queue at any time and closes it when it is the open view.
  const bool open = !queueVisible();
  queue->setProperty("opened", open);
  queue->setProperty("expanded", open);
  layoutOverlays();
  schedulePanelChanged();
}

bool EditorWindow::generationsVisible() const {
  if (!tabOwner_) { return activeEditor_->generationsVisible(); }
  const auto *dock = findChild<QDockWidget *>(QStringLiteral("generations-dock"));
  return dock && !dock->isHidden();
}

void EditorWindow::showGenerations() {
  for (auto *existing : findChildren<QDockWidget *>(QStringLiteral("generations-dock"))) { existing->close(); }
  // Parented to the dock host and deleted when it closes.
  auto *dock = new QDockWidget(tr("Generations"), dockHost_);
  dock->setObjectName(QStringLiteral("generations-dock"));
  dock->setAttribute(Qt::WA_DeleteOnClose);
  dock->setTitleBarWidget(new QWidget(dock));
  dock->setAllowedAreas(Qt::BottomDockWidgetArea);
  outputDock_->hide();
  auto *content = new QQuickWidget(engine_, dock);
  content->setResizeMode(QQuickWidget::SizeRootObjectToView);
  content->setInitialProperties({{"activity", QVariant::fromValue(generationActivity())},
                                 {"resolver", QVariant::fromValue<QObject *>(&mediaResolver_)}});
  content->setSource(QUrl(QStringLiteral("qrc:/qt/qml/NodeTool/NodeEditor/GenerationsPanel.qml")));
  dock->setWidget(content);
  if (content->rootObject()) { connect(content->rootObject(), SIGNAL(closeRequested()), dock, SLOT(close())); }
  connect(this, &EditorWindow::credentialsEpochChanged, dock, &QDockWidget::close);
  // The status bar Generations tab shows whether the panel is open.
  connect(dock, &QDockWidget::visibilityChanged, this, &EditorWindow::schedulePanelChanged);
  connect(dock, &QObject::destroyed, this, &EditorWindow::schedulePanelChanged);
  dockHost_->addDockWidget(Qt::BottomDockWidgetArea, dock);
  dockHost_->resizeDocks({dock}, {height() / 2}, Qt::Vertical);
  dock->show();
}

void EditorWindow::refreshGenerations() {
  if (!tabOwner_) { activeEditor_->refreshGenerations(); return; }
  auto *activity = generationActivity();
  // Open tabs name their workflows on the tiles.
  QHash<QString, QString> names;
  for (const auto *tab : tabOwner_->tabs_) {
    const auto workflow = tab->session_.workflow();
    if (!workflow["id"].toString().isEmpty()) { names.insert(workflow["id"].toString(), workflow["name"].toString(QStringLiteral("Untitled"))); }
  }
  activity->setWorkflowNames(names);
  activity->setLoading(true);
  const QPointer<node_editor::GenerationActivity> target(activity);
  session_.listGenerations([target](const QJsonArray &records, const QString &error) {
    if (!target) { return; }
    target->setLoading(false, error);
    if (error.isEmpty()) { target->replaceHistory(records, QDateTime::currentMSecsSinceEpoch()); }
  });
}

void EditorWindow::openWorkflowDocument(const QJsonObject &workflow) {
  if (!tabOwner_) { activeEditor_->openWorkflowDocument(workflow); return; }
  auto *owner = tabOwner_;
  if (!file_.isEmpty() || !document_.nodes().isEmpty() || hasUnsavedChanges() || session_.serverBound()) { owner->newTab(); }
  // An unsaved tab: Save asks for a file, as for an opened example.
  owner->activeEditor_->openDocument(QJsonDocument(workflow).toJson(QJsonDocument::Compact), {});
}

void EditorWindow::reportJob(const QString &jobId) {
  for (const auto &value : session_.queue()) {
    const auto job = value.toMap();
    if (job["jobId"].toString() != jobId) { continue; }
    // ReportBugButton on a failed JobItem.tsx.
    const auto name = job["name"].toString().isEmpty() ? QStringLiteral("Untitled") : job["name"].toString();
    const auto error = job["error"].toString();
    reportBug({.source = QStringLiteral("Job failure"),
               .summary = QStringLiteral("Job failed: %1").arg(name),
               .errorText = error.isEmpty() ? QStringLiteral("Job failed") : error,
               .workflowId = job["workflow_id"].toString(),
               .jobId = jobId});
    return;
  }
}

void EditorWindow::openJobOutput(const QString &url) {
  // AssetThumb in JobItem.tsx opens the asset's get_url in a new browser tab.
  const auto target = session_.serverUrl().resolved(QUrl(url));
  if (url.isEmpty() || (target.scheme() != QLatin1String("http") && target.scheme() != QLatin1String("https"))) { return; }
  QDesktopServices::openUrl(target);
}

void EditorWindow::toggleStatusView(const QString &view) {
  if (!tabOwner_) { activeEditor_->toggleStatusView(view); return; }
  if (view == "logs") {
    action(QStringLiteral("Output"));
  } else if (view == "queue") {
    toggleQueue();
  } else if (view == "generations") {
    if (auto *dock = findChild<QDockWidget *>(QStringLiteral("generations-dock")); dock && !dock->isHidden()) { dock->close(); }
    else { showGenerations(); }
  } else if (view == "trace") {
    if (auto *dock = findChild<QDockWidget *>(QStringLiteral("run-trace-dock")); dock && !dock->isHidden()) { dock->close(); }
    else { action(QStringLiteral("Run trace")); }
  } else if (view == "versions") {
    if (auto *dock = findChild<QDockWidget *>(QStringLiteral("workflow-versions-dock")); dock && !dock->isHidden()) { dock->close(); }
    else { action(QStringLiteral("Version history")); }
  }
  schedulePanelChanged();
}
} // namespace nodetool
