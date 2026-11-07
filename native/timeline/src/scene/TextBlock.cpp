#include "scene/TextBlock.h"

#include <QTextBoundaryFinder>

#include <algorithm>
#include <cmath>
#include <limits>
#include <vector>

namespace nt::scene {
namespace {

std::optional<double> number(const QJsonObject& o, const char* key) {
    const QJsonValue v = o.value(QLatin1String(key));
    if (!v.isDouble()) return std::nullopt;
    return v.toDouble();
}

// `paragraph.split(/\s+/).filter(Boolean)`.
std::vector<QString> splitWords(const QString& paragraph) {
    std::vector<QString> words;
    QString word;
    for (const QChar ch : paragraph) {
        if (isJsSpace(ch.unicode())) {
            if (!word.isEmpty()) words.push_back(word);
            word.clear();
        } else {
            word.append(ch);
        }
    }
    if (!word.isEmpty()) words.push_back(word);
    return words;
}

// `text.split(/\r?\n/)`.
std::vector<QString> splitParagraphs(const QString& text) {
    std::vector<QString> out;
    qsizetype start = 0;
    for (qsizetype i = 0; i < text.size(); i++) {
        if (text[i] != u'\n') continue;
        qsizetype end = i;
        if (end > start && text[end - 1] == u'\r') end--;
        out.push_back(text.mid(start, end - start));
        start = i + 1;
    }
    out.push_back(text.mid(start));
    return out;
}

}  // namespace

bool isJsSpace(char16_t c) {
    switch (c) {
    case 0x09: case 0x0a: case 0x0b: case 0x0c: case 0x0d: case 0x20: case 0xa0: case 0x1680:
    case 0x2028: case 0x2029: case 0x202f: case 0x205f: case 0x3000: case 0xfeff:
        return true;
    default:
        return c >= 0x2000 && c <= 0x200a;
    }
}

TextStyle parseTextStyle(const QJsonObject& o) {
    TextStyle s;
    s.text = o.value(u"text").toString();
    s.fontSizePx = o.value(u"fontSizePx").toDouble(0);
    s.lineHeight = number(o, "lineHeight");
    s.letterSpacingPx = number(o, "letterSpacingPx");
    s.maxWidthFrac = number(o, "maxWidthFrac");
    s.align = o.value(u"align").toString();
    s.verticalAlign = o.value(u"verticalAlign").toString();
    s.fontFamily = o.value(u"fontFamily").toString();
    s.fontWeight = o.value(u"fontWeight").toDouble(400);
    s.fontStyle = o.value(u"fontStyle").toString();
    return s;
}

int graphemeCount(const QString& text) {
    bool ascii = true;
    for (const QChar ch : text) {
        if (ch.unicode() < 0x20 || ch.unicode() > 0x7e) {
            ascii = false;
            break;
        }
    }
    if (ascii) return static_cast<int>(text.size());
    QTextBoundaryFinder finder(QTextBoundaryFinder::Grapheme, text);
    int count = 0;
    while (finder.toNextBoundary() != -1) count++;
    return count;
}

TextLayout layoutTextBlock(const MeasureText& measure, const TextStyle& style, double width, double height) {
    // `textLetterSpacingPx`, `spacedMeasure`.
    const double spacing =
        style.letterSpacingPx && std::isfinite(*style.letterSpacingPx) ? *style.letterSpacingPx : 0.0;
    const auto base = [&](const QString& t) -> double {
        if (measure) return measure(t, style);
        return static_cast<double>(t.size()) * style.fontSizePx * 0.6;
    };
    const auto advance = [&](const QString& t) -> double {
        return spacing == 0 ? base(t) : base(t) + spacing * graphemeCount(t);
    };
    // `textMaxWidthPx`, `textLineHeightPx`.
    const double maxWidth = width * std::min(1.0, std::max(0.05, style.maxWidthFrac.value_or(0.8)));
    const double fontSize = std::max(1.0, style.fontSizePx);
    const double lineHeight =
        fontSize * (style.lineHeight && *style.lineHeight > 0 ? *style.lineHeight : 1.2);

    // `wrapTextLines`: greedy, by summed word widths plus one space a gap.
    struct Line {
        std::vector<QString> words;
    };
    std::vector<Line> lines;
    const double spaceWidth = advance(QStringLiteral(" "));
    for (const QString& paragraph : splitParagraphs(style.text)) {
        Line line;
        double lineWidth = 0;
        for (const QString& word : splitWords(paragraph)) {
            const double wordWidth = advance(word);
            const double candidate = line.words.empty() ? wordWidth : lineWidth + spaceWidth + wordWidth;
            if (!line.words.empty() && candidate > maxWidth) {
                lines.push_back(std::move(line));
                line = Line{{word}};
                lineWidth = wordWidth;
            } else {
                line.words.push_back(word);
                lineWidth = candidate;
            }
        }
        lines.push_back(std::move(line));
    }

    // `firstLineCenterY`.
    const double block = static_cast<double>(lines.size()) * lineHeight;
    double firstY = height / 2 - block / 2 + lineHeight / 2;
    if (style.verticalAlign == u"top") firstY = lineHeight / 2;
    else if (style.verticalAlign == u"bottom") firstY = height - block + lineHeight / 2;

    double left = std::numeric_limits<double>::infinity();
    double right = -std::numeric_limits<double>::infinity();
    TextLayout result;
    result.lineHeight = lineHeight;
    result.spaceWidth = spaceWidth;
    result.letterSpacingPx = spacing;
    for (const Line& line : lines) {
        TextLine placed;
        placed.words = line.words;
        double lineWidth = 0;
        for (const QString& word : line.words) {
            const double wordWidth = advance(word);
            placed.wordWidths.push_back(wordWidth);
            lineWidth += wordWidth;
            if (!placed.text.isEmpty()) { placed.text += u' '; }
            placed.text += word;
        }
        lineWidth += spaceWidth * std::max<double>(0, static_cast<double>(line.words.size()) - 1);
        const double x = style.align == u"left"    ? (width - maxWidth) / 2
                         : style.align == u"right" ? (width + maxWidth) / 2 - lineWidth
                                                   : (width - lineWidth) / 2;
        placed.x = x;
        placed.y = firstY + static_cast<double>(result.lines.size()) * lineHeight;
        placed.width = lineWidth;
        result.lines.push_back(std::move(placed));
        if (lineWidth <= 0) continue;
        left = std::min(left, x);
        right = std::max(right, x + lineWidth);
    }
    // An empty title collapses to a point at the centre.
    if (right <= left) {
        left = width / 2;
        right = width / 2;
    }
    result.box = TextBox{left, firstY - lineHeight / 2, right - left, block};
    return result;
}

TextBox textBlockBox(const MeasureText& measure, const TextStyle& style, double width, double height) {
    return layoutTextBlock(measure, style, width, height).box;
}

}  // namespace nt::scene
