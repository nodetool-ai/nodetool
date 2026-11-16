#pragma once

#include "server/AutosaveController.h"
#include "server/TimelineList/TimelineListController.h"
#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::app { class ShellMenus; }
namespace nt::server {
class TimelineDocumentController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* anchor READ anchor WRITE setAnchor NOTIFY anchorChanged)
    Q_PROPERTY(QObject* controller READ controller CONSTANT)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
    // The list is on screen. A `documentfile` push of the open timeline's
    // socket refreshes it only then: opening the list refreshes it anyway.
    Q_PROPERTY(bool listShown READ listShown WRITE setListShown NOTIFY listShownChanged)
public:
    explicit TimelineDocumentController(QObject* parent = nullptr);
    QQuickItem* anchor() const { return m_anchor; }
    void setAnchor(QQuickItem* anchor);
    QObject* controller() { return &m_list; }
    QString error() const { return m_error; }
    Q_INVOKABLE void createAndOpen();
    bool listShown() const { return m_listShown; }
    void setListShown(bool shown);
    // Follows the open timeline's socket (bind() finds it above the anchor).
    void watch(AutosaveController* autosave);
signals:
    void listShownChanged();
    void openRequested();
    void anchorChanged();
    void errorChanged();
private:
    void bind();
    void switchTo(const QString& source);
    void fail(const QString& error);
    AutosaveController* findAutosave() const;
    QPointer<QQuickItem> m_anchor;
    QPointer<nt::app::ShellMenus> m_menus;
    QPointer<AutosaveController> m_autosave;
    bool m_listShown = false;
    TimelineListController m_list;
    QString m_error;
    bool m_switching = false;
};
}
