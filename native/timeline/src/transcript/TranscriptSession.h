#pragma once
// What the Text panel shows and does: the words and caption cues derived from the document, the
// word selection and its In and Out, and the search. Nothing here listens to the clock. The panel
// asks for the word at the playhead, so playback updates no model.
#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "transcript/TranscriptDocument.h"

#include <QAbstractListModel>
#include <QPointer>
#include <QTimer>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

// Rows of named values. A refresh with the same row count updates only the rows that differ, so
// delegates and their edit fields survive an edit. Any other refresh resets the model.
class TranscriptRows : public QAbstractListModel {
    Q_OBJECT
public:
    TranscriptRows(QStringList roles, QObject* parent);
    int rowCount(const QModelIndex& parent = {}) const override;
    QVariant data(const QModelIndex& index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;
    void setRows(QList<QVariantMap> rows);

private:
    QStringList m_roles;
    QList<QVariantMap> m_rows;
};

class TranscriptSession : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(ClipGestureController* gestures READ gestures WRITE setGestures NOTIFY gesturesChanged)
    // Refreshes only while the panel shows.
    Q_PROPERTY(bool active READ active WRITE setActive NOTIFY activeChanged)
    Q_PROPERTY(QAbstractListModel* paragraphs READ paragraphs CONSTANT)
    Q_PROPERTY(QAbstractListModel* cues READ cues CONSTANT)
    Q_PROPERTY(int wordCount READ wordCount NOTIFY wordsChanged)
    Q_PROPERTY(int cueCount READ cueCount NOTIFY cuesChanged)
    Q_PROPERTY(int hiddenWords READ hiddenWords NOTIFY wordsChanged)
    Q_PROPERTY(QString transcribeClipId READ transcribeClipId NOTIFY transcribeTargetChanged)
    Q_PROPERTY(QString transcribeClipName READ transcribeClipName NOTIFY transcribeTargetChanged)
    Q_PROPERTY(int selectionFirst READ selectionFirst NOTIFY selectionChanged)
    Q_PROPERTY(int selectionLast READ selectionLast NOTIFY selectionChanged)
    Q_PROPERTY(QString selectionText READ selectionText NOTIFY selectionChanged)
    Q_PROPERTY(QString query READ query WRITE setQuery NOTIFY matchesChanged)
    Q_PROPERTY(int matchCount READ matchCount NOTIFY matchesChanged)
    Q_PROPERTY(int currentMatch READ currentMatch NOTIFY matchesChanged)
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)

public:
    explicit TranscriptSession(QObject* parent = nullptr);
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    ClipGestureController* gestures() const { return m_gestures; }
    void setGestures(ClipGestureController* gestures);
    bool active() const { return m_active; }
    void setActive(bool active);
    QAbstractListModel* paragraphs() const { return m_paragraphRows; }
    QAbstractListModel* cues() const { return m_cueRows; }
    int wordCount() const { return static_cast<int>(m_words.size()); }
    int cueCount() const { return static_cast<int>(m_cues.size()); }
    int hiddenWords() const { return m_hiddenWords; }
    QString transcribeClipId() const { return m_transcribeId; }
    QString transcribeClipName() const { return m_transcribeName; }
    int selectionFirst() const { return m_first; }
    int selectionLast() const { return m_last; }
    QString selectionText() const;
    QString query() const { return m_query; }
    void setQuery(const QString& query);
    int matchCount() const { return static_cast<int>(m_matches.size()); }
    int currentMatch() const;
    QString status() const { return m_status; }

    const std::vector<nt::transcript::Word>& words() const { return m_words; }
    const std::vector<nt::transcript::WordRange>& matches() const { return m_matches; }

    // Applies a pending document change now rather than after the short settle delay.
    Q_INVOKABLE void flush();
    Q_INVOKABLE int wordAt(double timeMs) const { return nt::transcript::wordAt(m_words, timeMs); }
    Q_INVOKABLE double wordStartMs(int word) const;
    Q_INVOKABLE double wordEndMs(int word) const;
    Q_INVOKABLE int paragraphOfWord(int word) const { return nt::transcript::paragraphOfWord(m_paragraphs, word); }
    Q_INVOKABLE int cueAt(double timeMs) const;
    Q_INVOKABLE double cueStartMs(int row) const;
    Q_INVOKABLE double cueEndMs(int row) const;
    // What Split, Merge and Delete may do with a row. `count` makes a QML binding depend on it.
    Q_INVOKABLE QVariantMap cueFlags(int row, int count) const;

    // A click on a word, with `extend` for Shift. Sets In and Out and moves the playhead there.
    Q_INVOKABLE void selectWord(int word, bool extend);
    // The word before or after the selection, or the playhead when nothing is selected.
    Q_INVOKABLE void moveSelection(int delta, bool extend);
    Q_INVOKABLE void clearSelection();
    Q_INVOKABLE bool lift() { return cut(false); }
    Q_INVOKABLE bool extract() { return cut(true); }
    Q_INVOKABLE void stepMatch(int delta);

    Q_INVOKABLE bool setCueText(int row, const QString& text);
    Q_INVOKABLE bool setCueTimes(int row, double startMs, double endMs);
    Q_INVOKABLE bool splitCue(int row);
    Q_INVOKABLE bool mergeCue(int row);
    Q_INVOKABLE bool deleteCue(int row);
    // Adds a cue at the playhead. Returns its row, or -1.
    Q_INVOKABLE int addCue(const QString& text);
    Q_INVOKABLE void setStatus(const QString& status);

signals:
    void timelineChanged();
    void gesturesChanged();
    void activeChanged();
    void wordsChanged();
    void cuesChanged();
    void selectionChanged();
    void matchesChanged();
    void statusChanged();
    void transcribeTargetChanged();
    // The panel should bring this word into view.
    void revealWord(int word);

private:
    void scheduleRefresh();
    void refresh();
    void refreshTranscribeTarget();
    void select(int anchor, int focus);
    void markRange();
    void setMatches();
    void rangeChanged();
    void dropSelection();
    bool cut(bool ripple);
    bool applyCueEdit(const QString& name, int row, QJsonObject payload, const QString& refusal);
    QJsonObject document() const;
    double fps() const;
    double playheadMs() const;

    QPointer<TimelineModel> m_timeline;
    QPointer<ClipGestureController> m_gestures;
    TranscriptRows* m_paragraphRows;
    TranscriptRows* m_cueRows;
    QTimer m_settle;
    bool m_active = false;
    bool m_dirty = true;
    bool m_settingRange = false;
    std::vector<nt::transcript::Word> m_words;
    std::vector<nt::transcript::Paragraph> m_paragraphs;
    std::vector<nt::transcript::Cue> m_cues;
    std::vector<nt::transcript::WordRange> m_matches;
    int m_hiddenWords = 0;
    QString m_transcribeId;
    QString m_transcribeName;
    int m_anchor = -1;
    int m_focus = -1;
    int m_first = -1;
    int m_last = -1;
    nt::transcript::TimeSpan m_span;
    QString m_query;
    QString m_status;
};
