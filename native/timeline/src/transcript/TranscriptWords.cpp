#include "transcript/TranscriptWords.h"

#include "transcript/TranscriptSession.h"

#include <QFontMetricsF>
#include <QQuickWindow>
#include <QSGRectangleNode>
#include <QSGTextNode>
#include <QTextOption>
#include <algorithm>

TranscriptWords::TranscriptWords(QQuickItem* parent) : QQuickItem(parent) { setFlag(ItemHasContents, true); }

void TranscriptWords::setSession(TranscriptSession* session) {
    if (m_session == session) { return; }
    if (m_session) { disconnect(m_session, nullptr, this, nullptr); }
    m_session = session;
    if (session) {
        connect(session, &TranscriptSession::selectionChanged, this, [this] { update(); });
        connect(session, &TranscriptSession::matchesChanged, this, [this] { update(); });
    }
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setFirstWord(int first) {
    if (m_first == first) { return; }
    m_first = first;
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setWordCount(int count) {
    if (m_count == count) { return; }
    m_count = count;
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setText(const QString& text) {
    if (m_text == text) { return; }
    m_text = text;
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setFont(const QFont& font) {
    if (m_font == font) { return; }
    m_font = font;
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setLineScale(qreal lineScale) {
    if (qFuzzyCompare(m_lineScale, lineScale)) { return; }
    m_lineScale = lineScale;
    relayout();
    emit appearanceChanged();
}
void TranscriptWords::setColor(const QColor& color) {
    if (m_color == color) { return; }
    m_color = color;
    update();
    emit appearanceChanged();
}
void TranscriptWords::setSelectionColor(const QColor& color) {
    if (m_selectionColor == color) { return; }
    m_selectionColor = color;
    update();
    emit appearanceChanged();
}
void TranscriptWords::setMatchColor(const QColor& color) {
    if (m_matchColor == color) { return; }
    m_matchColor = color;
    update();
    emit appearanceChanged();
}

void TranscriptWords::componentComplete() {
    QQuickItem::componentComplete();
    relayout();
}

void TranscriptWords::geometryChange(const QRectF& next, const QRectF& previous) {
    QQuickItem::geometryChange(next, previous);
    if (!qFuzzyCompare(next.width(), previous.width())) { relayout(); }
}

void TranscriptWords::relayout() {
    if (!isComponentComplete() || !m_session || width() <= 0) { return; }
    const auto& words = m_session->words();
    if (m_first < 0 || m_first + m_count > static_cast<int>(words.size())) { return; }
    QString joined;
    m_offsets.clear();
    m_offsets.reserve(static_cast<size_t>(m_count) + 1);
    for (int i = m_first; i < m_first + m_count; ++i) {
        m_offsets.push_back(static_cast<int>(joined.size()));
        joined += words[static_cast<size_t>(i)].text;
        joined += u' ';
    }
    m_offsets.push_back(static_cast<int>(joined.size()));
    joined.chop(1);
    m_layout = std::make_unique<QTextLayout>(joined, m_font);
    QTextOption option;
    option.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
    m_layout->setTextOption(option);
    m_layout->setCacheEnabled(true);
    const qreal natural = QFontMetricsF(m_font).height();
    m_lineStep = std::ceil(natural) * m_lineScale;
    const qreal leading = (m_lineStep - natural) / 2;
    qreal y = 0;
    m_layout->beginLayout();
    for (QTextLine line = m_layout->createLine(); line.isValid(); line = m_layout->createLine()) {
        line.setLineWidth(width());
        line.setPosition({0, y + leading});
        y += m_lineStep;
    }
    m_layout->endLayout();
    setImplicitHeight(y);
    update();
}

int TranscriptWords::wordAt(qreal x, qreal y) const {
    if (!m_layout || m_lineStep <= 0 || y < 0) { return -1; }
    const int lineNumber = static_cast<int>(y / m_lineStep);
    if (lineNumber >= m_layout->lineCount()) { return -1; }
    const QTextLine line = m_layout->lineAt(lineNumber);
    if (x < line.x() || x > line.x() + line.naturalTextWidth()) { return -1; }
    const int cursor = line.xToCursor(x);
    const auto it = std::upper_bound(m_offsets.begin(), m_offsets.end() - 1, cursor);
    const int offset = static_cast<int>(it - m_offsets.begin()) - 1;
    return offset >= 0 && offset < m_count ? m_first + offset : -1;
}

QList<QRectF> TranscriptWords::spanRects(int fromWord, int toWord) const {
    QList<QRectF> rects;
    if (!m_layout || m_offsets.size() != static_cast<size_t>(m_count) + 1) { return rects; }
    const int start = m_offsets[static_cast<size_t>(fromWord - m_first)];
    const int end = m_offsets[static_cast<size_t>(toWord - m_first) + 1] - 1;
    for (int i = 0; i < m_layout->lineCount(); ++i) {
        const QTextLine line = m_layout->lineAt(i);
        const int lineStart = line.textStart();
        const int lineEnd = lineStart + line.textLength();
        if (end <= lineStart || start >= lineEnd) { continue; }
        // Both edges of both end characters, which holds whichever way the run reads.
        const int from = std::max(start, lineStart);
        const int to = std::min(end, lineEnd) - 1;
        const std::initializer_list<qreal> edges{line.cursorToX(from, QTextLine::Leading), line.cursorToX(from, QTextLine::Trailing),
                                                 line.cursorToX(to, QTextLine::Leading), line.cursorToX(to, QTextLine::Trailing)};
        const qreal left = std::min(edges);
        rects.append(QRectF(left, i * m_lineStep, std::max(edges) - left, m_lineStep));
    }
    return rects;
}

QRectF TranscriptWords::wordRect(int word) const {
    if (word < m_first || word >= m_first + m_count) { return {}; }
    const auto rects = spanRects(word, word);
    return rects.isEmpty() ? QRectF{} : rects.first();
}

QSGNode* TranscriptWords::updatePaintNode(QSGNode* old, UpdatePaintNodeData*) {
    ++m_paints;
    // native-rules #2: naked new, no documented owner for the node returned to the scene graph
    auto* root = old ? old : new QSGNode;
    // native-rules #2: naked delete of a scene graph child node
    while (auto* child = root->firstChild()) { delete child; }
    if (!m_layout || !m_session) { return root; }
    const auto addRects = [this, root](const QList<QRectF>& rects, const QColor& color) {
        for (const auto& rect : rects) {
            auto* node = window()->createRectangleNode();
            node->setRect(rect);
            node->setColor(color);
            node->setFlag(QSGNode::OwnedByParent);
            root->appendChildNode(node);
        }
    };
    const int last = m_first + m_count - 1;
    const auto& matches = m_session->matches();
    auto match = std::lower_bound(matches.begin(), matches.end(), m_first, [](const auto& range, int first) { return range.first + range.count - 1 < first; });
    for (; match != matches.end() && match->first <= last; ++match) {
        addRects(spanRects(std::max(match->first, m_first), std::min(match->first + match->count - 1, last)), m_matchColor);
    }
    if (m_session->selectionFirst() >= 0 && m_session->selectionFirst() <= last && m_session->selectionLast() >= m_first) {
        addRects(spanRects(std::max(m_session->selectionFirst(), m_first), std::min(m_session->selectionLast(), last)), m_selectionColor);
    }
    auto* text = window()->createTextNode();
    text->setColor(m_color);
    text->setRenderType(QSGTextNode::QtRendering);
    text->setFlag(QSGNode::OwnedByParent);
    root->appendChildNode(text);
    text->addTextLayout({0, 0}, m_layout.get());
    return root;
}
