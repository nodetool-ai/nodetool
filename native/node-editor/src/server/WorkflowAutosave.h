#pragma once
#include <QTimer>
#include <functional>
namespace nodetool::node_editor {
// Timing only. The session checks binding, revisions and request scope.
class WorkflowAutosave final {
public:
  explicit WorkflowAutosave(QObject *context, std::function<void()> save) {
    m_timer.setSingleShot(true);
    QObject::connect(&m_timer, &QTimer::timeout, context, std::move(save));
  }
  // QTimer::start(ms) also replaces the interval, so every start names its delay.
  void changed() { if (m_enabled) m_timer.start(m_delay); }
  void later(int milliseconds) { if (m_enabled) m_timer.start(milliseconds); }
  void cancel() { m_timer.stop(); }
  void setEnabled(bool enabled) { m_enabled = enabled; if (!enabled) cancel(); }
  bool enabled() const { return m_enabled; }
  void setDelay(int milliseconds) { m_delay = qBound(1, milliseconds, 3600000); }
private:
  QTimer m_timer;
  int m_delay = 750;
  bool m_enabled = true;
};
}
