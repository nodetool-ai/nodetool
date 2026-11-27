#pragma once
#include "model/TimelineModel.h"
#include "Keyframes.h"
#include <map>
#include "playback/PlaybackClock.h"
#include <QPointer>
#include <QUuid>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

// UI thread only. Document state changes on edits only. The separate playhead notification
// feeds inspector values, never TimelineModel or a lane delegate.
class ClipInspectorController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY playheadChanged)
    Q_PROPERTY(QString clipId READ clipId WRITE setClipId NOTIFY changed)
    Q_PROPERTY(QVariantMap clip READ clip NOTIFY changed)
    // Changes with `clip`, for a binding that must rerun on an edit but needs no copy of the clip.
    Q_PROPERTY(int revision READ revision NOTIFY changed)
    Q_PROPERTY(bool locked READ locked NOTIFY changed)
    // While false, `clip` and `locked` hold their last value and no model change reaches them.
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    Q_PROPERTY(double playheadMs READ playheadMs NOTIFY playheadChanged)
    Q_PROPERTY(bool playheadOnClip READ playheadOnClip NOTIFY playheadOnClipChanged)
    Q_PROPERTY(QVariantList rows READ rows CONSTANT)
  public:
    explicit ClipInspectorController(QObject* parent = nullptr) : QObject(parent) {
        connect(this, &ClipInspectorController::changed, this, [this] { ++m_revision; m_playbackRows.clear(); m_documentRows.clear(); m_graphRows.clear(); }, Qt::DirectConnection);
    }
    TimelineModel* timeline() const { return m_timeline; }
    PlaybackClock* clock() const { return m_clock; }
    QString clipId() const { return m_clipId; }
    void setTimeline(TimelineModel* model);
    void setClock(PlaybackClock* clock);
    void setClipId(const QString& id);
    QVariantMap clip() const;
    int revision() const { return m_revision; }
    int preparedRowCount() const { return m_preparedRowCount; }
    int graphBuildCount() const { return m_graphBuildCount; }
    bool locked() const { return m_locked; }
    bool active() const { return m_active; }
    void setActive(bool active);
    double playheadMs() const;
    bool playheadOnClip() const { return m_playheadOnClip; }
    QVariantList rows() const;
    Q_INVOKABLE QVariantMap rowState(const QString& row) const;
    // The Effect Controls rows split rowState so a seek reads no keyframe list: `rowDocument`
    // changes on edits only and `rowLive` on the playhead. Both read a switched-off group too.
    Q_INVOKABLE QVariantMap rowDocument(const QString& row) const;
    Q_INVOKABLE QVariantMap rowLive(const QString& row) const;
    Q_INVOKABLE QVariantMap rowGraph(const QString& row, double fromMs, double toMs, int samples) const;
    Q_INVOKABLE QVariantMap rowGraphKeys(const QString& row) const;
    Q_INVOKABLE QString bezierEasing(double x1, double y1, double x2, double y2) const;
    // False while the Motion, Opacity or Volume group is switched off.
    Q_INVOKABLE bool groupEnabled(const QString& group) const;
    Q_INVOKABLE double fieldValue(const QString& field) const;
    Q_INVOKABLE bool write(const QVariantMap& payload);
    Q_INVOKABLE void beginGesture();
    Q_INVOKABLE void preview(const QVariantMap& payload);
    Q_INVOKABLE void commit(const QVariantMap& payload);
    Q_INVOKABLE void cancelGesture();
    Q_INVOKABLE void seek(double relativeMs);
    Q_INVOKABLE void step(const QString& row, int direction);
    Q_INVOKABLE QString newAnimationId() const { return QUuid::createUuid().toString(QUuid::WithoutBraces); }
    Q_INVOKABLE QString easingAt(const QString& row, double atMs) const;
    Q_INVOKABLE bool validEasing(const QString& easing) const;
    Q_INVOKABLE QVariantMap effectParamSpec(const QString& type, const QString& key) const;
  signals:
    void changed();
    void playheadChanged();
    void playheadOnClipChanged();
    void activeChanged();
    // The user changed this row: the keyframe key now keys it.
    void rowEdited(const QString& row);

  private:
    QJsonObject selected() const;
    QJsonObject rowClip() const;
    mutable QJsonObject m_rowClip;
    // Re-reads the selected clip and its lock. Emits `changed` only when either differs, or when forced.
    void refresh(bool force = false);
    void updatePlayhead(bool forcePlayheadSignal = false);
    bool computeLocked(const QJsonObject& clip) const;
    QJsonObject payload(const QVariantMap& value) const;
    QPointer<TimelineModel> m_timeline;
    QPointer<PlaybackClock> m_clock;
    QString m_clipId;
    int m_revision = 0;
    QJsonObject m_clip;
    mutable QVariantMap m_clipMap;
    mutable std::map<QString, std::unique_ptr<nt::keyframes::RowPlayback>> m_playbackRows;
    mutable QHash<QString, QVariantMap> m_documentRows;
    mutable QHash<QString, QVariantMap> m_graphRows;
    mutable int m_preparedRowCount = 0;
    mutable int m_graphBuildCount = 0;
    mutable bool m_clipMapValid = false;
    bool m_locked = true;
    bool m_active = true;
    double m_lastPlayheadMs = -1.0;
    bool m_playheadOnClip = false;
    bool m_gesturing = false;
    bool m_ignoreCommit = false;
    quint64 m_generation = 0;
    QJsonArray m_before;
    QJsonArray m_preview;
};
