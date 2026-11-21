// The project lock of one window (WP2.13, AC25, TC105). The window names
// its project folder on this computer and the project id. This object takes
// `.nodetool/open.lock` through the app's ProjectLocks and says whether the
// window may write. ProjectLockBanner.qml shows it.
#pragma once

#include <QObject>
#include <QString>

#include <optional>

namespace nodetool::account {
class ProjectLocks;
} // namespace nodetool::account

namespace nodetool::account::qt {

// Thread affinity: UI thread only. The file checks run on the UI thread:
// each reads and writes one small file under `.nodetool/` of a folder on
// this computer.
//
// Ownership: borrows the app's ProjectLocks, which outlives every window.
// The object gives back its count when the target changes and in its
// destructor.
class ProjectLockState : public QObject {
  Q_OBJECT
  // Empty while no folder on this computer is named. Otherwise "writing",
  // "heldHere" (another app on this computer), "heldElsewhere" (another
  // computer) or "failed" (the file could not be written).
  Q_PROPERTY(QString state READ state NOTIFY changed)
  // True for the two held states. The window refuses every edit.
  Q_PROPERTY(bool readOnly READ readOnly NOTIFY changed)
  Q_PROPERTY(QString holderApp READ holderApp NOTIFY changed)
  Q_PROPERTY(QString holderHost READ holderHost NOTIFY changed)
  // The sentence the banner and the read-only reason show. Empty while writing.
  Q_PROPERTY(QString message READ message NOTIFY changed)
public:
  // `locks` may be null, which leaves every window writable.
  explicit ProjectLockState(ProjectLocks* locks, QObject* parent = nullptr);
  ~ProjectLockState() override;

  // Gives back the count held through the old locks and checks again.
  void setLocks(ProjectLocks* locks);
  // The project's folder on this computer and its id. An empty folder or id
  // gives back the lock. A change checks at once.
  void setTarget(const QString& folder, const QString& projectId);

  QString state() const { return m_state; }
  bool readOnly() const { return m_state == QLatin1String("heldHere") || m_state == QLatin1String("heldElsewhere"); }
  QString holderApp() const { return m_holderApp; }
  QString holderHost() const { return m_holderHost; }
  QString message() const;

  // Checks again, after the other app closed the project.
  Q_INVOKABLE void retry();
  // Takes the lock from another computer's app. The banner asks the person
  // first whether that computer still has the project open.
  Q_INVOKABLE void takeOver();

  // The name the person knows an app by, from the `app` field of a lock.
  static QString appLabel(const QString& app);

signals:
  void changed();

private:
  enum class Call { Acquire, TakeOver };
  void check(Call call);
  void releaseHeld();

  ProjectLocks* m_locks = nullptr;
  QString m_folder;
  QString m_projectId;
  bool m_counted = false;  // m_locks counts this window for m_folder and m_projectId
  QString m_state;
  QString m_holderApp;
  QString m_holderHost;
  QString m_error;
};

} // namespace nodetool::account::qt
