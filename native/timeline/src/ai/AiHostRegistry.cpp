#include "ai/AiHostRegistry.h"

void AiHostRegistry::registerHost(QObject* gestures, QObject* host) {
    if (!gestures || !host || m_hosts.value(gestures) == host) return;
    m_hosts.insert(gestures, host);
    connect(gestures, &QObject::destroyed, this, [this, gestures] {
        if (m_hosts.remove(gestures)) { ++m_revision; emit changed(); }
    });
    connect(host, &QObject::destroyed, this, [this, gestures] {
        if (m_hosts.contains(gestures) && m_hosts.value(gestures).isNull()) {
            m_hosts.remove(gestures); ++m_revision; emit changed();
        }
    });
    ++m_revision; emit changed();
}
void AiHostRegistry::unregisterHost(QObject* gestures, QObject* host) {
    if (gestures && m_hosts.value(gestures) == host && m_hosts.remove(gestures)) { ++m_revision; emit changed(); }
}
QObject* AiHostRegistry::host(QObject* gestures) const { return m_hosts.value(gestures); }
