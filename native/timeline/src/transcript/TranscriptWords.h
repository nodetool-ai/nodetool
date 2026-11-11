#pragma once
// The words of one transcript paragraph, drawn as one text layout and one scene graph node. A
// paragraph of QML Text items per word costs far more to create while a long transcript scrolls,
// and a single QML Text cannot say which word is under the pointer.
#include <QColor>
#include <QFont>
#include <QPointer>
#include <QQuickItem>
#include <QTextLayout>
#include <QtQmlIntegration/qqmlintegration.h>
#include <memory>
#include <vector>

class TranscriptSession;

class TranscriptWords : public QQuickItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TranscriptSession* session READ session WRITE setSession NOTIFY appearanceChanged)
    Q_PROPERTY(int firstWord READ firstWord WRITE setFirstWord NOTIFY appearanceChanged)
    Q_PROPERTY(int wordCount READ wordCount WRITE setWordCount NOTIFY appearanceChanged)
    // The row's text. A change means the words changed.
    Q_PROPERTY(QString text READ text WRITE setText NOTIFY appearanceChanged)
    Q_PROPERTY(QFont font READ font WRITE setFont NOTIFY appearanceChanged)
    Q_PROPERTY(qreal lineScale READ lineScale WRITE setLineScale NOTIFY appearanceChanged)
    Q_PROPERTY(QColor color READ color WRITE setColor NOTIFY appearanceChanged)
    Q_PROPERTY(QColor selectionColor READ selectionColor WRITE setSelectionColor NOTIFY appearanceChanged)
    Q_PROPERTY(QColor matchColor READ matchColor WRITE setMatchColor NOTIFY appearanceChanged)

public:
    explicit TranscriptWords(QQuickItem* parent = nullptr);
    TranscriptSession* session() const { return m_session; }
    void setSession(TranscriptSession* session);
    int firstWord() const { return m_first; }
    void setFirstWord(int first);
    int wordCount() const { return m_count; }
    void setWordCount(int count);
    QString text() const { return m_text; }
    void setText(const QString& text);
    QFont font() const { return m_font; }
    void setFont(const QFont& font);
    qreal lineScale() const { return m_lineScale; }
    void setLineScale(qreal lineScale);
    QColor color() const { return m_color; }
    void setColor(const QColor& color);
    QColor selectionColor() const { return m_selectionColor; }
    void setSelectionColor(const QColor& color);
    QColor matchColor() const { return m_matchColor; }
    void setMatchColor(const QColor& color);

    // The word under a point in this item, or -1 off the text.
    Q_INVOKABLE int wordAt(qreal x, qreal y) const;
    // The rectangle of a word of this paragraph, on the word's first line.
    Q_INVOKABLE QRectF wordRect(int word) const;
    // Counts scene graph rebuilds, so a test can see that playback repaints nothing.
    Q_INVOKABLE int paintCount() const { return m_paints; }

signals:
    void appearanceChanged();

protected:
    void componentComplete() override;
    void geometryChange(const QRectF& next, const QRectF& previous) override;
    QSGNode* updatePaintNode(QSGNode* old, UpdatePaintNodeData*) override;

private:
    void relayout();
    QList<QRectF> spanRects(int fromWord, int toWord) const;

    QPointer<TranscriptSession> m_session;
    int m_first = 0;
    int m_count = 0;
    QString m_text;
    QFont m_font;
    qreal m_lineScale = 1;
    QColor m_color;
    QColor m_selectionColor;
    QColor m_matchColor;
    std::unique_ptr<QTextLayout> m_layout;
    std::vector<int> m_offsets;  // the character offset of each word, then the text length + 1
    qreal m_lineStep = 0;
    int m_paints = 0;
};
