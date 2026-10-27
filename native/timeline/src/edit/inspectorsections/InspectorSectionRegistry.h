#pragma once
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::inspector {
// Web sequence: Media 10, Timing 20, Render 30, Transform 40, Color 50,
// Effects 60, Mask 70, Transition 80, Animate 90. Render/Transform/Animate
// are hosted directly. Register other sections before 30 or between 40 and 90.
bool registerInspectorSection(QString id, QUrl source, int order, QString title);
}

class InspectorSectionRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantList sections READ sections CONSTANT)
public:
    explicit InspectorSectionRegistry(QObject* parent = nullptr) : QObject(parent) {}
    QVariantList sections() const;
};
