#pragma once

#include <QPointer>
#include <QQuickItem>
#include <QtQmlIntegration/qqmlintegration.h>

class TooltipTracker : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QQuickItem* trigger READ trigger WRITE setTrigger NOTIFY triggerChanged)
    Q_PROPERTY(QQuickItem* overlay READ overlay WRITE setOverlay NOTIFY geometryChanged)
    Q_PROPERTY(QPointF anchor READ anchor NOTIFY geometryChanged)
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
public:
    explicit TooltipTracker(QObject* parent = nullptr);
    ~TooltipTracker() override;
    QQuickItem* trigger() const { return m_trigger; }
    QQuickItem* overlay() const { return m_overlay; }
    QPointF anchor() const;
    bool active() const { return m_active; }
    void setTrigger(QQuickItem* trigger);
    void setOverlay(QQuickItem* overlay);
    void setActive(bool active);
    Q_INVOKABLE void prepare();
signals:
    void triggerChanged();
    void geometryChanged();
    void activeChanged();
    void dismissed();
protected:
    bool eventFilter(QObject* watched, QEvent* event) override;
private:
    void watchAncestors();
    void dismiss();
    QPointer<QQuickItem> m_trigger;
    QPointer<QQuickItem> m_overlay;
    QList<QMetaObject::Connection> m_connections;
    bool m_active = false;
    static QPointer<TooltipTracker> s_current;
};
