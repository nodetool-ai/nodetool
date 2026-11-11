#pragma once
#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

class TempoGridQml : public QObject {
    Q_OBJECT
    QML_NAMED_ELEMENT(TempoGrid)
    QML_SINGLETON
    Q_PROPERTY(QVariantList divisionOptions READ divisionOptions CONSTANT)
  public:
    using QObject::QObject;
    [[nodiscard]] QVariantList divisionOptions() const;
    Q_INVOKABLE QVariantList barRulerTicks(const QVariantMap& rawTempoOrDocument, double msPerPx, double fromMs,
                                           double toMs) const;
    Q_INVOKABLE QVariantList visibleTempoGrid(const QVariantMap& spec) const;
    Q_INVOKABLE QVariantMap snapGridSpecFrom(const QVariantMap& document, const QVariantMap& ui) const;
    Q_INVOKABLE bool gridSnapApplies(const QVariantMap& spec) const;
    Q_INVOKABLE QVariantList mergeSnapCandidates(const QVariantList& candidates, const QVariantMap& spec) const;
};
