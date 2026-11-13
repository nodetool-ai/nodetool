#pragma once

// The choices and the refusal text of the New music project dialog
// (docs/MUSIC-MODE.md section 15, MD9), for QML.
//
// Thread affinity: GUI thread only. A stateless QML singleton the engine owns.

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class MusicProjectRules : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    // [{label: "4/4", value: "4/4", beatsPerBar, beatUnit}] in the dialog's order.
    Q_PROPERTY(QVariantList signatures READ signatures CONSTANT)
    // [{label, value}]: "No key", then the tonics the model accepts.
    Q_PROPERTY(QVariantList keyTonics READ keyTonics CONSTANT)
    // [{label, value}] for "major" and "minor".
    Q_PROPERTY(QVariantList keyModes READ keyModes CONSTANT)
    // [{label, value}] of the twelve track roles, after "No role".
    Q_PROPERTY(QVariantList roles READ roles CONSTANT)

public:
    explicit MusicProjectRules(QObject* parent = nullptr) : QObject(parent) {}
    QVariantList signatures() const;
    QVariantList keyTonics() const;
    QVariantList keyModes() const;
    QVariantList roles() const;
    // Why {bpm, beatsPerBar, beatUnit, keyTonic, keyMode} cannot make a music project, or empty.
    Q_INVOKABLE QString refusal(const QVariantMap& settings) const;
    // What the track chip shows for a role ("Drums"), or empty.
    Q_INVOKABLE QString roleLabel(const QString& role) const;
};
