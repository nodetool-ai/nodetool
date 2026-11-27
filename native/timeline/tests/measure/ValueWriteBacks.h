#pragma once

#include <QMetaProperty>
#include <QPointer>
#include <QQmlProperty>
#include <private/qqmldata_p.h>
#include <private/qqmlproperty_p.h>
#include <private/qqmlvmemetaobject_p.h>

#include <memory>

// UI thread only. Counts whole gadget writes, including QML field write-backs.
// Whole-value assignments also count. Forward without removing bindings.
// The target owns each interceptor. The counter can die before its targets.
class ValueWriteBacks final : public QObject {
public:
    qint64 writes = 0;

    void observe(QObject& object) {
        auto* meta = QQmlInterceptorMetaObject::get(&object);
        for (auto* child : object.children()) { observe(*child); }
        const auto* type = object.metaObject();
        for (int i = 0; i < type->propertyCount(); ++i) {
            const auto property = type->property(i);
            const auto valueType = property.metaType();
            if (!property.isWritable() || !valueType.flags().testFlag(QMetaType::IsGadget)) { continue; }
            if (!meta) {
                // QObject's dynamic meta-object machinery owns and destroys this wrapper.
                auto wrapper = std::make_unique<QQmlInterceptorMetaObject>(
                    &object, QQmlData::ensurePropertyCache(&object));
                meta = wrapper.release();
            }
            const QQmlProperty target(&object, QString::fromLatin1(property.name()));
            const auto index = QQmlPropertyPrivate::propertyIndex(target);
            if (meta->intercepts(index)) { continue; }
            // NOLINTNEXTLINE(cppcoreguidelines-owning-memory): parented to object
            auto* interceptor = new GadgetWrite(&object, *this, target);
            meta->registerInterceptor(index, interceptor);
        }
    }

private:
    class GadgetWrite final : public QObject, public QQmlPropertyValueInterceptor {
    public:
        GadgetWrite(QObject* parent, ValueWriteBacks& counter, const QQmlProperty& target)
            : QObject(parent), m_counter(&counter), m_target(target) {}
        void setTarget(const QQmlProperty& target) override { m_target = target; }
        void write(const QVariant& value) override {
            if (m_counter) { ++m_counter->writes; }
            QQmlPropertyPrivate::write(m_target, value,
                QQmlPropertyData::BypassInterceptor | QQmlPropertyData::DontRemoveBinding);
        }
    private:
        QPointer<ValueWriteBacks> m_counter;
        QQmlProperty m_target;
    };
};
