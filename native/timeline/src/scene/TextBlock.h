#pragma once
// The text block box: a port of `layoutTextBlock` and `wrapTextLines` in
// packages/timeline/src/render/textLayout.ts. Pure, no Qt GUI types.
#include <QJsonObject>
#include <QString>

#include <functional>
#include <optional>
#include <vector>

namespace nt::scene {

// The `textStyle` fields the box depends on.
struct TextStyle {
    QString text;
    double fontSizePx = 0;
    std::optional<double> lineHeight;
    std::optional<double> letterSpacingPx;
    std::optional<double> maxWidthFrac;
    QString align;          // "left", "right", anything else centres
    QString verticalAlign;  // "top", "bottom", anything else is "middle"
    QString fontFamily;
    double fontWeight = 400;
    QString fontStyle;
};

TextStyle parseTextStyle(const QJsonObject& textStyle);

// Advance width of `text` in `style`'s font, without letter spacing. Null:
// the scene model's fallback, `text.length * fontSizePx * 0.6` (a host with
// no text measurer, such as the conformance oracle).
using MeasureText = std::function<double(const QString& text, const TextStyle& style)>;

struct TextBox {
    double x = 0, y = 0, width = 0, height = 0;
};

struct TextLine {
    QString text;
    std::vector<QString> words;
    std::vector<double> wordWidths;
    double x = 0, y = 0, width = 0;
};
struct TextLayout {
    std::vector<TextLine> lines;
    double lineHeight = 0, spaceWidth = 0, letterSpacingPx = 0;
    TextBox box;
};
TextLayout layoutTextBlock(const MeasureText& measure, const TextStyle& style, double width, double height);

// `layoutTextBlock(measure, style, width, height).box`.
TextBox textBlockBox(const MeasureText& measure, const TextStyle& style, double width, double height);

// JavaScript's `\s`.
bool isJsSpace(char16_t c);

// `graphemeCount`: user-perceived characters (UTF-16 length for ASCII).
int graphemeCount(const QString& text);

}  // namespace nt::scene
