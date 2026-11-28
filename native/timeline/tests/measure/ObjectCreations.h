#pragma once
#include <QChildEvent>
#include <QHash>
#include <QObject>
#include <QPointer>
#include <QQuickItem>
#include <QSet>
#include <QThread>
#include <functional>
#include <private/qquickitem_p.h>
#include <private/qquickitemchangelistener_p.h>

// UI thread only. Counts first attachment to the observed trees. Seed every
// existing tree before measuring. Unparented objects outside those trees are
// excluded. No callback dereferences an object after its derived destructor.
class ObjectCreations final : public QObject, private QQuickItemChangeListener {
public:
    ObjectCreations() = default;
    ObjectCreations(const ObjectCreations&) = delete;
    ObjectCreations& operator=(const ObjectCreations&) = delete;
    ObjectCreations(ObjectCreations&&) = delete;
    ObjectCreations& operator=(ObjectCreations&&) = delete;
    // Retried when derived construction or QML setup changes the meta-object.
    std::function<void(QObject&)> onObject;
    QSet<QString> delegateNames;
    qint64 objects = 0;
    qint64 delegates = 0;
    qint64 menus = 0;

    ~ObjectCreations() override {
        for (auto it = m_objects.begin(); it != m_objects.end(); ++it) {
            if (it->item) {
                QQuickItemPrivate::get(it->item)->removeItemChangeListener(this, QQuickItemPrivate::Children);
            }
        }
    }
    void observe(QObject& root) {
        attach(&root, false);
        for (auto* child : root.findChildren<QObject*>()) { attach(child, false); }
    }
    // Measurement interceptors belong to the observer, not the scene workload.
    void excludeFromCount(QObject& object) {
        auto it = m_objects.find(&object);
        if (it != m_objects.end() && it->measured) {
            --objects;
            it->measured = false;
        }
        // The interceptor may be created before its target joins the measured tree.
        attach(&object, false);
    }
    void classify() {
        for (auto it = m_objects.begin(); it != m_objects.end(); ++it) { classify(it.key(), it.value()); }
    }

protected:
    bool eventFilter(QObject* watched, QEvent* event) override {
        Q_ASSERT(QThread::currentThread() == thread());
        if (event->type() == QEvent::ChildAdded || event->type() == QEvent::ChildPolished) {
            auto* child = static_cast<QChildEvent*>(event)->child();
            if (watched->children().contains(child)) { attach(child, true); }
        } else if (event->type() == QEvent::ThreadChange) {
            // ThreadChange is delivered on the old owning thread. Stop observing
            // before the handoff, including direct destruction notifications.
            auto it = m_objects.find(watched);
            if (it != m_objects.end()) {
                if (it->item) { QQuickItemPrivate::get(it->item)->removeItemChangeListener(this, QQuickItemPrivate::Children); }
                QObject::disconnect(watched, nullptr, this, nullptr);
                watched->removeEventFilter(this);
                m_objects.erase(it);
            }
        }
        return false;
    }

private:
    struct Entry { bool measured = false; bool classified = false; QPointer<QQuickItem> item; const QMetaObject* type = nullptr; };
    QHash<QObject*, Entry> m_objects;

    void classify(QObject* object, Entry& entry) {
        if (!entry.measured || entry.classified) { return; }
        if (delegateNames.contains(object->objectName())) {
            ++delegates;
            entry.classified = true;
        } else if (object->inherits("QQuickMenuItem")) {
            ++menus;
            entry.classified = true;
        }
    }
    void notify(QObject* object) {
        auto it = m_objects.find(object);
        if (!onObject || it == m_objects.end() || it->type == object->metaObject()) { return; }
        it->type = object->metaObject();
        const QPointer<QObject> guard(object);
        onObject(*object);
        if (guard) {
            // Interceptors can replace the dynamic meta-object during notification.
            m_objects[object].type = object->metaObject();
        }
    }
    void itemChildAdded(QQuickItem*, QQuickItem* child) override { attach(child, true); }
    void attach(QObject* object, bool measured) {
        Q_ASSERT(QThread::currentThread() == thread());
        if (!object || object->thread() != thread()) { return; }
        auto existing = m_objects.find(object);
        if (existing != m_objects.end()) {
            classify(object, existing.value());
            // ChildAdded can arrive during QObject construction. Retry installing
            // the visual listener when the derived QQuickItem is available.
            if (existing->item || !qobject_cast<QQuickItem*>(object)) { notify(object); return; }
        } else {
            m_objects.insert(object, {measured, false, {}, nullptr});
            if (measured) { ++objects; }
            object->installEventFilter(this);
            const QPointer<ObjectCreations> self(this);
            const QPointer<QObject> watched(object);
            // ChildAdded can precede derived construction and QML property setup.
            if (onObject) {
                QMetaObject::invokeMethod(this, [self, watched] {
                    if (self && watched) { self->attach(watched, true); }
                }, Qt::QueuedConnection);
            }
            QObject::connect(object, &QObject::objectNameChanged, this, [self, watched] {
                if (!self || !watched) { return; }
                auto it = self->m_objects.find(watched);
                if (it != self->m_objects.end()) { self->classify(watched, it.value()); }
            }, Qt::DirectConnection);
            QObject::connect(object, &QObject::destroyed, this, [self](QObject* dying) {
                if (self) { self->m_objects.remove(dying); }
            }, Qt::DirectConnection);
        }
        if (auto* item = qobject_cast<QQuickItem*>(object)) {
            m_objects[object].item = item;
            QQuickItemPrivate::get(item)->addItemChangeListener(this, QQuickItemPrivate::Children);
            for (auto* child : item->childItems()) { attach(child, measured); }
        }
        auto it = m_objects.find(object);
        classify(object, it.value());
        if (onObject) {
            for (auto* child : object->children()) { attach(child, measured); }
        }
        notify(object);
    }
};
