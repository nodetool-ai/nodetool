#pragma once
#include <QObject>
#include <QPointer>
#include <QString>
#include <QStringList>

namespace nodetool::node_editor {

// What the inspector's History tab (GenerationHistory.qml) reads and does: the
// selected node's generation history, the pinned generation, the generations
// queued for replay, and the pin and replay requests.
//
// The owner fills the state with the setters and handles the *Requested
// signals. The history object is borrowed and must outlive its use here; the
// pointer clears itself if it does not. QML gets a non-owning pointer through
// a required property.
//
// UI thread only.
class GenerationReplay : public QObject {
    Q_OBJECT
    // A node_editor::GenerationHistory, or null.
    Q_PROPERTY(QObject *generationHistory READ generationHistory NOTIFY generationHistoryChanged)
    Q_PROPERTY(QString selection READ selection NOTIFY selectionChanged)
    Q_PROPERTY(QString pinnedGeneration READ pinnedGeneration NOTIFY pinnedGenerationChanged)
    Q_PROPERTY(QStringList replayGenerations READ replayGenerations NOTIFY replayGenerationsChanged)
    Q_PROPERTY(bool readOnly READ readOnly NOTIFY readOnlyChanged)
public:
    explicit GenerationReplay(QObject *parent = nullptr);
    ~GenerationReplay() override;

    QObject *generationHistory() const { return generationHistory_; }
    QString selection() const { return selection_; }
    QString pinnedGeneration() const { return pinnedGeneration_; }
    QStringList replayGenerations() const { return replayGenerations_; }
    bool readOnly() const { return readOnly_; }

    void setGenerationHistory(QObject *history);
    void setSelection(const QString &selection);
    void setPinnedGeneration(const QString &id);
    void setReplayGenerations(const QStringList &ids);
    void setReadOnly(bool readOnly);

    // An empty id returns the node to its latest generation.
    Q_INVOKABLE void pinGeneration(const QString &id) { emit pinRequested(id); }
    Q_INVOKABLE void toggleReplayGeneration(const QString &id) { emit toggleReplayRequested(id); }
    Q_INVOKABLE void clearReplayGenerations() { emit clearReplayRequested(); }

signals:
    void generationHistoryChanged();
    void selectionChanged();
    void pinnedGenerationChanged();
    void replayGenerationsChanged();
    void readOnlyChanged();
    void pinRequested(const QString &id);
    void toggleReplayRequested(const QString &id);
    void clearReplayRequested();

private:
    QPointer<QObject> generationHistory_;
    QString selection_;
    QString pinnedGeneration_;
    QStringList replayGenerations_;
    bool readOnly_ = false;
};

}  // namespace nodetool::node_editor
