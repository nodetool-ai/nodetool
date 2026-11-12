#pragma once

// The state of the music panel's first parts (docs/MUSIC-MODE.md section 15,
// UI-2 parts 1 to 4): the target track and its role, the bar range and
// length, and the operation the planner infers for the selection (section 8,
// GN-4), with the operations that are valid and the one line that says why.
// Every selection or document change runs planMusicOperation again, so the
// panel shows what MusicPlan answers.
//
// Thread affinity: GUI thread only. QML creates it; its QML parent owns it.
// The timeline and the selection are held by QPointer.

#include "model/TimelineModel.h"
#include "music/MusicPlan.h"
#include "music/MusicSelection.h"

#include <QObject>
#include <QPointer>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MusicPanelModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY inputsChanged)
    Q_PROPERTY(MusicSelection* selection READ selection WRITE setSelection NOTIFY inputsChanged)
    // The operation the person picked ("text2music", "repaint", "lego"), or empty for the inferred one.
    Q_PROPERTY(QString operationChoice READ operationChoice WRITE setOperationChoice NOTIFY inputsChanged)

    Q_PROPERTY(bool hasTarget READ hasTarget NOTIFY changed)
    Q_PROPERTY(QString trackId READ trackId NOTIFY changed)
    Q_PROPERTY(QString trackName READ trackName NOTIFY changed)
    Q_PROPERTY(QString trackRole READ trackRole NOTIFY changed)
    Q_PROPERTY(double startFrame READ startFrame NOTIFY changed)
    Q_PROPERTY(double endFrame READ endFrame NOTIFY changed)
    Q_PROPERTY(QString rangeText READ rangeText NOTIFY changed)
    Q_PROPERTY(QString lengthText READ lengthText NOTIFY changed)
    // Task names, empty when there is none.
    Q_PROPERTY(QString inferred READ inferred NOTIFY changed)
    Q_PROPERTY(QString operation READ operation NOTIFY changed)
    // [{value, label, enabled, reason}] for Generate, Regenerate and Add instrument.
    Q_PROPERTY(QVariantList operations READ operations NOTIFY changed)
    Q_PROPERTY(QString reason READ reason NOTIFY changed)
    // The planner's refusal code, empty when a request can be built.
    Q_PROPERTY(QString refusal READ refusal NOTIFY changed)
    // [{value, label}] of the DiT models that can run the operation, the routed one first (BE-3).
    Q_PROPERTY(QVariantList modelOptions READ modelOptions NOTIFY changed)

public:
    explicit MusicPanelModel(QObject* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    MusicSelection* selection() const { return m_selection; }
    void setSelection(MusicSelection* selection);
    QString operationChoice() const { return m_choice; }
    void setOperationChoice(const QString& task);

    bool hasTarget() const { return !m_trackId.isEmpty(); }
    QString trackId() const { return m_trackId; }
    QString trackName() const { return m_trackName; }
    QString trackRole() const { return m_trackRole; }
    double startFrame() const { return m_startFrame; }
    double endFrame() const { return m_endFrame; }
    QString rangeText() const { return m_rangeText; }
    QString lengthText() const { return m_lengthText; }
    QString inferred() const { return m_inferred; }
    QString operation() const { return m_operation; }
    QVariantList operations() const { return m_operations; }
    QString reason() const { return m_reason; }
    QString refusal() const { return m_refusal; }
    QVariantList modelOptions() const { return m_modelOptions; }

    // Writes the target track's role through the `music.setTrackRole` edit, one undo step.
    // An empty role removes it.
    Q_INVOKABLE bool setTrackRole(const QString& role);

    // The planner's input for the current document and selection (also read by the tests).
    nt::music::PlanInput planInput(std::optional<nt::music::MusicTask> operation) const;

signals:
    void inputsChanged();
    void changed();

private:
    void refresh();

    QPointer<TimelineModel> m_timeline;
    QPointer<MusicSelection> m_selection;
    QString m_choice;
    QString m_trackId;
    QString m_trackName;
    QString m_trackRole;
    double m_startFrame = 0;
    double m_endFrame = 0;
    QString m_rangeText;
    QString m_lengthText;
    QString m_inferred;
    QString m_operation;
    QVariantList m_operations;
    QString m_reason;
    QString m_refusal;
    QVariantList m_modelOptions;
};
