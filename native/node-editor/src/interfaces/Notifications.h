#pragma once
#include <QObject>
#include <QPointF>
#include <QString>
#include <QVariantList>

namespace nodetool::node_editor {

// What the tab bar's bell (TabBar.qml) and the notification list
// (NotificationsPanel.qml) read and do: the notifications, the unread count,
// and the open, copy and report requests.
//
// The owner fills the state with the setters and handles the *Requested
// signals. A test can use a plain instance and a QSignalSpy. QML gets a
// non-owning pointer through a required property.
//
// UI thread only.
class Notifications : public QObject {
    Q_OBJECT
    // One map per notification, oldest first: type, content, timestamp.
    Q_PROPERTY(QVariantList entries READ entries NOTIFY entriesChanged)
    Q_PROPERTY(int unread READ unread NOTIFY unreadChanged)
public:
    explicit Notifications(QObject *parent = nullptr);
    ~Notifications() override;

    QVariantList entries() const { return entries_; }
    int unread() const { return unread_; }

    void setEntries(const QVariantList &entries);
    void setUnread(int unread);

    // Opens the list below `global` and marks every notification read.
    Q_INVOKABLE void open(const QPointF &global) { emit openRequested(global); }
    Q_INVOKABLE void copy(const QString &text) { emit copyRequested(text); }
    // Report on an error notification opens a prefilled bug report.
    Q_INVOKABLE void report(const QString &text) { emit reportRequested(text); }

signals:
    void entriesChanged();
    void unreadChanged();
    void openRequested(const QPointF &global);
    void copyRequested(const QString &text);
    void reportRequested(const QString &text);

private:
    QVariantList entries_;
    int unread_ = 0;
};

}  // namespace nodetool::node_editor
