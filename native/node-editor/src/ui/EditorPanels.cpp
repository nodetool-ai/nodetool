// The tab bar notifications and settings, the inspector footer and its cost
// estimate, and the status bar tabs. Web sources: components/panels/NotificationButton.tsx,
// SettingsHeaderButton.tsx, inspector/RunSelectedNodesSection.tsx,
// costs/WorkflowCostEstimatePanel.tsx and panels/PanelBottom.tsx.
#include "EditorWindow.h"
#include "graph/CanvasDropController.h"
#include <QClipboard>
#include <QDesktopServices>
#include <QGuiApplication>
#include <QDockWidget>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWidget>
#include <QScreen>
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

void EditorWindow::toggleStatusView(const QString &view) {
  if (!tabOwner_) { activeEditor_->toggleStatusView(view); return; }
  if (view == "logs") {
    action(QStringLiteral("Output"));
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
