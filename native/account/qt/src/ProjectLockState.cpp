#include "nodetool/account/qt/ProjectLockState.h"

#include "nodetool/account/project_lock.h"

#include <QDir>
#include <filesystem>

namespace nodetool::account::qt {

namespace {

std::filesystem::path pathOf(const QString& folder) { return std::filesystem::path(folder.toStdU16String()); }

} // namespace

ProjectLockState::ProjectLockState(ProjectLocks* locks, QObject* parent) : QObject(parent), m_locks(locks) {}

ProjectLockState::~ProjectLockState() { releaseHeld(); }

QString ProjectLockState::appLabel(const QString& app) {
  if (app == QLatin1String("node-editor")) {
    return tr("The node editor");
  }
  if (app == QLatin1String("timeline")) {
    return tr("The timeline app");
  }
  if (app == QLatin1String("desktop")) {
    return tr("The NodeTool desktop app");
  }
  return app.isEmpty() ? tr("Another app") : app;
}

QString ProjectLockState::message() const {
  if (m_state == QLatin1String("heldHere")) {
    return tr("Read-only: %1 has this project open. Close it there, then choose Check again.")
        .arg(appLabel(m_holderApp));
  }
  if (m_state == QLatin1String("heldElsewhere")) {
    return tr("Read-only: %1 on %2 has this project open.").arg(appLabel(m_holderApp), m_holderHost);
  }
  if (m_state == QLatin1String("failed")) {
    return tr("The project lock could not be written, so another app may also change this project. %1")
        .arg(m_error);
  }
  return {};
}

void ProjectLockState::setLocks(ProjectLocks* locks) {
  if (locks == m_locks) {
    return;
  }
  releaseHeld();
  m_locks = locks;
  check(Call::Acquire);
}

void ProjectLockState::setTarget(const QString& folder, const QString& projectId) {
  const QString normal = folder.isEmpty() ? QString() : QDir::cleanPath(folder);
  if (normal == m_folder && projectId == m_projectId) {
    return;
  }
  releaseHeld();
  m_folder = normal;
  m_projectId = projectId;
  check(Call::Acquire);
}

void ProjectLockState::retry() {
  if (!m_counted) {
    check(Call::Acquire);
  }
}

void ProjectLockState::takeOver() {
  if (m_state == QLatin1String("heldElsewhere")) {
    check(Call::TakeOver);
  }
}

void ProjectLockState::releaseHeld() {
  if (m_counted && m_locks) {
    m_locks->release(pathOf(m_folder), m_projectId.toStdString());
  }
  m_counted = false;
}

void ProjectLockState::check(Call call) {
  QString state;
  QString holderApp;
  QString holderHost;
  QString error;
  if (m_locks && !m_folder.isEmpty() && !m_projectId.isEmpty() && QDir(m_folder).exists()) {
    const auto path = pathOf(m_folder);
    const auto id = m_projectId.toStdString();
    const auto result = call == Call::TakeOver ? m_locks->takeOver(path, id) : m_locks->acquire(path, id);
    switch (result.outcome) {
    case ProjectLockOutcome::Acquired:
      m_counted = true;
      state = QStringLiteral("writing");
      break;
    case ProjectLockOutcome::HeldOnThisHost:
      state = QStringLiteral("heldHere");
      break;
    case ProjectLockOutcome::HeldOnOtherHost:
      state = QStringLiteral("heldElsewhere");
      break;
    case ProjectLockOutcome::Failed:
      state = QStringLiteral("failed");
      error = QString::fromStdString(result.error);
      break;
    }
    if (result.holder) {
      holderApp = QString::fromStdString(result.holder->app);
      holderHost = QString::fromStdString(result.holder->host);
    }
  }
  if (state == m_state && holderApp == m_holderApp && holderHost == m_holderHost && error == m_error) {
    return;
  }
  m_state = state;
  m_holderApp = holderApp;
  m_holderHost = holderHost;
  m_error = error;
  emit changed();
}

} // namespace nodetool::account::qt
