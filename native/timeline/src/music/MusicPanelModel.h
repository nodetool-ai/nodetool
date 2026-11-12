#pragma once

// The state of the music panel (docs/MUSIC-MODE.md section 15, UI-2): the
// target track and its role, the bar range and length, the operation the
// planner infers for the selection (section 8, GN-4) with the operations that
// are valid and the one line that says why, the plan summary and the label of
// the primary action, and the takes of the clip under the range with their
// generation records (part 7, TK-2, TK-3, AL-5). Every selection or document
// change runs planMusicOperation again, so the panel shows what MusicPlan
// answers. Wording follows the music mode mockup
// (native/timeline/docs/music-mode-mockup.html).
//
// Thread affinity: GUI thread only. QML creates it; its QML parent owns it.
// The timeline and the selection are held by QPointer.

#include "model/TimelineModel.h"
#include "music/MusicPlan.h"
#include "music/MusicSelection.h"

#include <QObject>
#include <QPointer>
#include <QStringList>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

class MusicPanelModel : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY inputsChanged)
    Q_PROPERTY(MusicSelection* selection READ selection WRITE setSelection NOTIFY inputsChanged)
    // The operation the person picked ("text2music", "repaint", "lego"), or empty for the inferred one.
    Q_PROPERTY(QString operationChoice READ operationChoice WRITE setOperationChoice NOTIFY inputsChanged)
    // The candidate count the summary and the action label count with.
    Q_PROPERTY(int candidates READ candidates WRITE setCandidates NOTIFY inputsChanged)

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
    // "Keyboard · bars 9–12" and "4 bars · 8.0 s · role Keyboard".
    Q_PROPERTY(QString targetTitle READ targetTitle NOTIFY changed)
    Q_PROPERTY(QString targetDetail READ targetDetail NOTIFY changed)
    // The plan summary, one line each; empty with no operation.
    Q_PROPERTY(QStringList planSummary READ planSummary NOTIFY changed)
    // "Generate 4 takes", "Regenerate bars 3–4", "Add bass".
    Q_PROPERTY(QString actionLabel READ actionLabel NOTIFY changed)
    // "Model hears bars 1–5" for Regenerate and Add instrument, else empty.
    Q_PROPERTY(QString contextLabel READ contextLabel NOTIFY changed)
    Q_PROPERTY(double contextStartFrame READ contextStartFrame NOTIFY changed)
    Q_PROPERTY(double contextEndFrame READ contextEndFrame NOTIFY changed)
    // The audio clip on the target track that holds the whole range; empty when none.
    Q_PROPERTY(QString takeClipId READ takeClipId NOTIFY changed)
    // "Drums · bars 1–8".
    Q_PROPERTY(QString takeClipTitle READ takeClipTitle NOTIFY changed)
    // The clip still waits for its first result.
    Q_PROPERTY(bool takeClipPending READ takeClipPending NOTIFY changed)
    // [{id, label, task, meta, drifting, driftText, active, canDelete,
    //   canRegenerate, record: [{name, value}]}], in document order.
    Q_PROPERTY(QVariantList takes READ takes NOTIFY changed)

public:
    explicit MusicPanelModel(QObject* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    MusicSelection* selection() const { return m_selection; }
    void setSelection(MusicSelection* selection);
    QString operationChoice() const { return m_choice; }
    void setOperationChoice(const QString& task);
    int candidates() const { return m_candidates; }
    void setCandidates(int candidates);

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
    QString targetTitle() const { return m_targetTitle; }
    QString targetDetail() const { return m_targetDetail; }
    QStringList planSummary() const { return m_planSummary; }
    QString actionLabel() const { return m_actionLabel; }
    QString contextLabel() const { return m_contextLabel; }
    double contextStartFrame() const { return m_contextStart; }
    double contextEndFrame() const { return m_contextEnd; }
    QString takeClipId() const { return m_takeClipId; }
    QString takeClipTitle() const { return m_takeClipTitle; }
    bool takeClipPending() const { return m_takeClipPending; }
    QVariantList takes() const { return m_takes; }

    // Writes the target track's role through the `music.setTrackRole` edit, one undo step.
    // An empty role removes it.
    Q_INVOKABLE bool setTrackRole(const QString& role);
    // Makes take `takeId` of the clip under the range active (`music.selectTake`, TK-2).
    Q_INVOKABLE bool selectTake(const QString& takeId);
    // Removes the take from the clip (`music.deleteTake`); its asset stays (TK-5).
    Q_INVOKABLE bool deleteTake(const QString& takeId);
    // Records the prompt in the sequence's prompt history (`music.recordPrompt`, TK-6).
    Q_INVOKABLE bool recordPrompt(const QString& prompt);

    // The planner's input for the current document and selection (also read by the tests).
    nt::music::PlanInput planInput(std::optional<nt::music::MusicTask> operation) const;

signals:
    void inputsChanged();
    void changed();

private:
    void refresh();
    void refreshSummary(const nt::music::MusicPlan& plan, const QJsonObject& raw);
    void refreshTakes(const QJsonObject& raw);

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
    int m_candidates = 2;
    QString m_targetTitle;
    QString m_targetDetail;
    QStringList m_planSummary;
    QString m_actionLabel;
    QString m_contextLabel;
    double m_contextStart = 0;
    double m_contextEnd = 0;
    QString m_takeClipId;
    QString m_takeClipTitle;
    bool m_takeClipPending = false;
    QVariantList m_takes;
};
