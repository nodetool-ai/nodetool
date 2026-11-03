#pragma once
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::inspector {
// Sections are small components, and `panel` names the panel that hosts one. "inspector" lists its
// sections in order: Text 5, Shape 6, Media 10, Timing 20, Caption 25, Transition 80,
// and Animate at the end, which it hosts directly. Effect Controls places each section it hosts as
// a group, by id, so moving a section between the two is this one argument.
bool registerInspectorSection(QString id, QUrl source, int order, QString title, QString panel = QStringLiteral("inspector"));
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
