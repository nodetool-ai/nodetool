#pragma once
#include <QTimer>
#include <functional>
namespace nodetool::node_editor {
// Timing only. The session checks binding, revisions and request scope.
class WorkflowAutosave final {
public:
  explicit WorkflowAutosave(QObject *context, std::function<void()> save) {
    m_timer.setSingleShot(true);
    m_timer.setInterval(750);
    QObject::connect(&m_timer, &QTimer::timeout, context, std::move(save));
  }
  void changed() { if (m_enabled) m_timer.start(); }
  void later(int milliseconds) { if (m_enabled) m_timer.start(milliseconds); }
  void cancel() { m_timer.stop(); }
  void setEnabled(bool enabled) { m_enabled = enabled; if (!enabled) cancel(); }
  bool enabled() const { return m_enabled; }
  void setDelay(int milliseconds) { m_timer.setInterval(qBound(1, milliseconds, 3600000)); }
private:
  QTimer m_timer;
  bool m_enabled = true;
};
}
