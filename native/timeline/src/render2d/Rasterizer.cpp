#include "render2d/Rasterizer.h"
#include "render2d/Paint.h"
#include <QDir>
#include <QFontDatabase>
#include <QFontMetricsF>
#include <QGlyphRun>
#include <QGuiApplication>
#include <QJsonArray>
#include <QPainter>
#include <QRawFont>
#include <QTextBoundaryFinder>
#include <QTextLayout>
#include <ft2build.h>
#include <hb-ot.h>
#include <hb.h>
#include FT_FREETYPE_H
#include FT_MULTIPLE_MASTERS_H
#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <memory>
#include <mutex>
#include <numbers>
#include <span>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>

namespace nt::render2d {
QString resolveFontDirectory(const QString& applicationDir) {
    const QStringList candidates{
        qEnvironmentVariable("NODETOOL_TIMELINE_FONTS_DIR"),
        applicationDir + "/fonts",
        applicationDir + "/../Resources/fonts",
        QStringLiteral(NT_TIMELINE_FONTS_DIR)
    };
    for (const auto& directory : candidates) {
        if (!directory.isEmpty() && QDir(directory).exists()) {
            return QDir::cleanPath(directory);
        }
    }
    return {};
}
namespace {
const QString& fontDirectory() {
    static const auto directory = resolveFontDirectory(QGuiApplication::applicationDirPath());
    return directory;
}
void loadFonts() {
    static std::once_flag once;
    std::call_once(once, [] {
        const auto& directory = fontDirectory();
        for (const auto* file :
             {"Inter-Variable.ttf", "Inter-SemiBold.ttf", "Inter-ExtraBold.ttf", "Inter-Italic-Variable.ttf",
              "SpaceGrotesk-Variable.ttf", "BebasNeue-Regular.ttf", "PlayfairDisplay-Variable.ttf",
              "PlayfairDisplay-Italic-Variable.ttf", "Lora-Variable.ttf", "Lora-Italic-Variable.ttf",
              "JetBrainsMono-Variable.ttf", "JetBrainsMono-Italic-Variable.ttf"}) {
            if (QFontDatabase::addApplicationFont(directory + u'/' + QLatin1String(file)) < 0) {
                qWarning() << "Timeline font unavailable:" << file << directory;
            }
        }
    });
}
QFont fontFor(const scene::TextStyle& style, double spacing = 0) {
    loadFonts();
    auto family = style.fontFamily.section(u',', 0, 0).trimmed();
    if (family.size() > 1 &&
        ((family.startsWith(u'"') && family.endsWith(u'"')) || (family.startsWith(u'\'') && family.endsWith(u'\'')))) {
        family = family.mid(1, family.size() - 2);
    }
    if (family.isEmpty()) {
        family = "Inter";
    }
    QFont font;
    font.setFamilies({family, QStringLiteral("Inter")});
    font.setPointSizeF(std::max(1.0, style.fontSizePx) * 72 / 96);
    const bool interStatic = family.compare("Inter", Qt::CaseInsensitive) == 0 && style.fontStyle != "italic" &&
                             style.fontStyle != "oblique";
    // Skia selects Inter's static ExtraBold for 700..900 and SemiBold for
    // 600 from this corpus. Select those same files rather than Qt's nearest
    // lower static face. Other weights use the variable face's wght axis.
    const bool staticFace = interStatic && (style.fontWeight >= 700 || style.fontWeight == 600);
    const double weight = staticFace ? (style.fontWeight >= 700 ? 800 : 600) : 400;
    font.setWeight(static_cast<QFont::Weight>(std::clamp(static_cast<int>(std::round(weight)), 1, 1000)));
    font.setStyle(style.fontStyle == "italic"    ? QFont::StyleItalic
                  : style.fontStyle == "oblique" ? QFont::StyleOblique
                                                 : QFont::StyleNormal);
    // Selecting a bold variable face AND setting wght can synthesize bold
    // on its italic face. Select its regular face and let the axis set weight.
    if (staticFace || QRawFont::fromFont(font).fontTable("fvar").isEmpty()) {
        font.setWeight(static_cast<QFont::Weight>(
            std::clamp(static_cast<int>(std::round(staticFace ? weight : style.fontWeight)), 1, 1000)));
    } else {
        font.setVariableAxis(QFont::Tag("wght"), static_cast<float>(style.fontWeight));
    }
    font.setHintingPreference(QFont::PreferVerticalHinting);
    font.setStyleStrategy(static_cast<QFont::StyleStrategy>(QFont::PreferAntialias | QFont::PreferTypoLineMetrics));

    font.setLetterSpacing(QFont::AbsoluteSpacing, spacing);
    return font;
}
struct ShapedText {
    QRawFont font;
    QList<quint32> glyphs;
    QList<QPointF> positions;
    double width = 0;
    QList<QGlyphRun> fallbackRuns;
};
bool colorFont(const QRawFont& font) {
    // Reading a bitmap table can copy megabytes. Cache the font identity,
    // and inspect its small palette/location tables before bitmap data.
    thread_local std::vector<std::pair<QRawFont, bool>> cache;
    const auto found = std::find_if(cache.begin(), cache.end(),
                                   [&](const auto& entry) { return entry.first == font; });
    if (found != cache.end()) {
        return found->second;
    }
    const bool color = !font.fontTable("CPAL").isEmpty() || !font.fontTable("CBLC").isEmpty() ||
                       !font.fontTable("sbix").isEmpty() || !font.fontTable("SVG ").isEmpty();
    if (cache.size() >= 256) {
        cache.clear();
    }
    cache.emplace_back(font, color);
    return color;
}
ShapedText shapeText(const QString& text, const scene::TextStyle& style, double spacing = 0) {
    const auto font = fontFor(style);
    auto raw = QRawFont::fromFont(font);
    const auto codepoints = text.toUcs4();
    const bool needsFallback = colorFont(raw) || std::any_of(codepoints.begin(), codepoints.end(),
        [&](char32_t ch) {
            const auto script = QChar::script(ch);
            return !raw.supportsCharacter(ch) ||
                   (script != QChar::Script_Latin && script != QChar::Script_Common &&
                    script != QChar::Script_Inherited);
        });
    if (needsFallback) {
        // QTextLayout itemizes scripts and resolves fallback per run. A single
        // HarfBuzz face substitutes glyph zero for every unsupported character.
        QTextLayout layout(text, fontFor(style, spacing));
        layout.beginLayout();
        const auto line = layout.createLine();
        layout.endLayout();
        ShapedText result;
        result.font = raw;
        if (line.isValid()) {
            result.width = line.naturalTextWidth();
            result.fallbackRuns = layout.glyphRuns();
            for (auto& run : result.fallbackRuns) {
                auto positions = run.positions();
                for (auto& position : positions) {
                    position.ry() -= line.ascent();
                }
                run.setPositions(positions);
            }
        }
        return result;
    }
    using Face = std::unique_ptr<hb_face_t, decltype(&hb_face_destroy)>;
    using Font = std::unique_ptr<hb_font_t, decltype(&hb_font_destroy)>;
    using Buffer = std::unique_ptr<hb_buffer_t, decltype(&hb_buffer_destroy)>;
    // Qt's simple Latin kerning differs from HarfBuzz's full GPOS walk on
    // Lora and Space Grotesk. Use the same shaper as Canvas/Skia, on Qt's
    // selected bundled face, for both advances and glyph placement.
    thread_local std::unordered_map<std::string, Font> fonts;
    const auto key = font.key().toStdString();
    auto found = fonts.find(key);
    if (found == fonts.end()) {
        if (fonts.size() >= 256) {
            fonts.clear();
        }
        auto tableFont = std::make_unique<QRawFont>(raw);
        Face face(hb_face_create_for_tables(
                      [](hb_face_t*, hb_tag_t tag, void* data) {
                          const auto* source = static_cast<const QRawFont*>(data);
                          const std::array<char, 5> name{static_cast<char>(tag >> 24), static_cast<char>(tag >> 16),
                                                         static_cast<char>(tag >> 8), static_cast<char>(tag), 0};
                          const auto table = source->fontTable(name.data());
                          return hb_blob_create(table.constData(), static_cast<unsigned>(table.size()),
                                                HB_MEMORY_MODE_DUPLICATE, nullptr, nullptr);
                      },
                      tableFont.release(), [](void* data) { delete static_cast<QRawFont*>(data); }),
                  hb_face_destroy);
        Font hbFont(hb_font_create(face.get()), hb_font_destroy);
        hb_ot_font_set_funcs(hbFont.get());
        const int scale = static_cast<int>(std::round(raw.pixelSize() * 65536));
        hb_font_set_scale(hbFont.get(), scale, scale);
        const hb_variation_t weight{HB_TAG('w', 'g', 'h', 't'), static_cast<float>(style.fontWeight)};
        hb_font_set_variations(hbFont.get(), &weight, 1);
        hb_face_make_immutable(face.get());
        found = fonts.emplace(key, std::move(hbFont)).first;
    }
    Buffer buffer(hb_buffer_create(), hb_buffer_destroy);
    const std::span utf16(std::bit_cast<const uint16_t*>(text.utf16()), static_cast<std::size_t>(text.size()));
    hb_buffer_add_utf16(buffer.get(), utf16.data(), static_cast<int>(utf16.size()), 0, static_cast<int>(utf16.size()));
    hb_buffer_guess_segment_properties(buffer.get());
    // Canvas disables optional ligatures for positive tracking. Negative
    // tracking keeps them and charges spacing once per shaped cluster.
    const std::array<hb_feature_t, 2> features{{{HB_TAG('l', 'i', 'g', 'a'), 0, 0, HB_FEATURE_GLOBAL_END},
                                                {HB_TAG('c', 'l', 'i', 'g'), 0, 0, HB_FEATURE_GLOBAL_END}}};
    hb_shape(found->second.get(), buffer.get(), spacing > 0 ? features.data() : nullptr,
             spacing > 0 ? static_cast<unsigned>(features.size()) : 0);
    unsigned count = 0;
    const auto* glyphs = hb_buffer_get_glyph_infos(buffer.get(), &count);
    const auto* positions = hb_buffer_get_glyph_positions(buffer.get(), &count);
    ShapedText result;
    result.font = raw;
    double advance = 0;
    unsigned cluster = 0;
    for (unsigned i = 0; i < count; ++i) {
        if (i > 0 && glyphs[i].cluster != glyphs[i - 1].cluster) {
            ++cluster;
        }
        result.glyphs.append(glyphs[i].codepoint);
        result.positions.append(
            {advance + positions[i].x_offset / 65536.0 + spacing * cluster, -positions[i].y_offset / 65536.0});
        advance += positions[i].x_advance / 65536.0;
    }
    result.width = advance + spacing * (count > 0 ? cluster + 1 : 0);
    return result;
}
QImage surface(QSize size) {
    QImage image(size, QImage::Format_RGBA8888_Premultiplied);
    image.setDotsPerMeterX(3780);
    image.setDotsPerMeterY(3780);
    image.fill(Qt::transparent);
    return image;
}
bool paintFreeTypeRun(QPainter& painter, const ShapedText& shaped, const scene::TextStyle& style, QPointF origin) {

    if (!shaped.fallbackRuns.isEmpty()) {
        return false;
    }
    const auto transform = painter.worldTransform();
    const bool rotated = std::abs(transform.m12()) > 1e-9 || std::abs(transform.m21()) > 1e-9;
    FT_Matrix matrix{static_cast<FT_Fixed>(std::round(transform.m11() * 65536)),
                     static_cast<FT_Fixed>(std::round(-transform.m21() * 65536)),
                     static_cast<FT_Fixed>(std::round(-transform.m12() * 65536)),
                     static_cast<FT_Fixed>(std::round(transform.m22() * 65536))};
    struct RasterFont {
        std::unique_ptr<std::remove_pointer_t<FT_Library>, decltype(&FT_Done_FreeType)> library{nullptr,
                                                                                                FT_Done_FreeType};
        std::unique_ptr<std::remove_pointer_t<FT_Face>, decltype(&FT_Done_Face)> face{nullptr, FT_Done_Face};
    };
    const auto family = shaped.font.familyName();
    const bool italic = style.fontStyle == "italic" || style.fontStyle == "oblique";
    QString filename;
    if (family == "Inter" && !italic && style.fontWeight >= 700) {
        filename = "Inter-ExtraBold.ttf";
    } else if (family == "Inter" && !italic && style.fontWeight == 600) {
        filename = "Inter-SemiBold.ttf";
    } else if (family == "Bebas Neue") {
        filename = "BebasNeue-Regular.ttf";
    } else if (family == "Inter" || family == "Lora" || family == "Playfair Display" || family == "JetBrains Mono" ||
               family == "Space Grotesk") {
        filename = family;
        filename.remove(u' ');
        filename += italic ? "-Italic-Variable.ttf" : "-Variable.ttf";
    } else {
        return false;
    }
    thread_local std::unordered_map<std::string, RasterFont> faces;
    const auto key = filename.toStdString();
    auto found = faces.find(key);
    if (found == faces.end()) {
        if (faces.size() >= 32) {
            faces.clear();
        }
        auto loaded = [&] {
            RasterFont result;
            FT_Library library = nullptr;
            if (FT_Init_FreeType(&library) != 0) {
                return result;
            }
            result.library.reset(library);
            const auto file = (fontDirectory() + u'/' + filename).toUtf8();
            FT_Face face = nullptr;
            if (FT_New_Face(library, file.constData(), 0, &face) == 0) {
                result.face.reset(face);
            }
            return result;
        }();
        found = faces.emplace(key, std::move(loaded)).first;
    }
    auto& font = found->second;
    if (font.face && FT_HAS_MULTIPLE_MASTERS(font.face.get())) {
        FT_MM_Var* axes = nullptr;
        if (FT_Get_MM_Var(font.face.get(), &axes) == 0) {
            const auto freeAxes = [&](FT_MM_Var* value) { FT_Done_MM_Var(font.library.get(), value); };
            const std::unique_ptr<FT_MM_Var, decltype(freeAxes)> ownedAxes(axes, freeAxes);
            std::vector<FT_Fixed> coordinates(axes->num_axis);
            for (unsigned i = 0; i < axes->num_axis; ++i) {
                coordinates[i] = axes->axis[i].tag == FT_MAKE_TAG('w', 'g', 'h', 't')
                                     ? static_cast<FT_Fixed>(style.fontWeight * 65536)
                                     : axes->axis[i].def;
            }
            FT_Set_Var_Design_Coordinates(font.face.get(), static_cast<FT_UInt>(coordinates.size()),
                                          coordinates.data());
        }
    }
    if (!font.face || FT_Set_Char_Size(font.face.get(), 0,
                                       static_cast<FT_F26Dot6>(std::max(1.0, style.fontSizePx) * 64), 72, 72) != 0) {
        return false;
    }
    // Match Canvas's light hinting for axis-aligned glyphs and unhinted
    // outlines for rotations. Transform before rasterizing, so path text
    // does not resample an already antialiased glyph bitmap.
    for (qsizetype i = 0; i < shaped.glyphs.size(); ++i) {
        const auto position = transform.map(origin + shaped.positions[i]);
        const QPointF pixel(std::floor(position.x()), std::floor(position.y()));
        FT_Vector delta{static_cast<FT_Pos>(std::round((position.x() - pixel.x()) * 64)),
                        static_cast<FT_Pos>(-std::round((position.y() - pixel.y()) * 64))};
        FT_Set_Transform(font.face.get(), &matrix, &delta);
        if (FT_Load_Glyph(font.face.get(), shaped.glyphs[i], (rotated ? FT_LOAD_NO_HINTING : FT_LOAD_TARGET_LIGHT)) !=
                0 ||
            FT_Render_Glyph(font.face->glyph, FT_RENDER_MODE_NORMAL) != 0) {
            continue;
        }
        const auto& bitmap = font.face->glyph->bitmap;
        if (bitmap.width == 0 || bitmap.rows == 0) {
            continue;
        }
        auto image = surface({static_cast<int>(bitmap.width), static_cast<int>(bitmap.rows)});
        for (unsigned y = 0; y < bitmap.rows; ++y) {
            const std::span pixels(image.scanLine(static_cast<int>(y)), static_cast<std::size_t>(image.bytesPerLine()));
            for (unsigned x = 0; x < bitmap.width; ++x) {
                const std::span row(bitmap.buffer + static_cast<std::ptrdiff_t>(y) * bitmap.pitch,
                                    static_cast<std::size_t>(bitmap.width));
                const auto alpha = row[x];
                for (int channel = 0; channel < 4; ++channel) {
                    pixels[x * 4 + channel] = alpha;
                }
            }
        }
        painter.save();
        painter.resetTransform();
        painter.drawImage(pixel + QPointF(font.face->glyph->bitmap_left, -font.face->glyph->bitmap_top), image);
        painter.restore();
    }
    return true;
}
void setup(QPainter& p) {
    p.setRenderHint(QPainter::Antialiasing);
    p.setRenderHint(QPainter::TextAntialiasing);
    p.setPen(Qt::NoPen);
}
QRectF rect(const scene::TextBox& box) {
    return {box.x, box.y, box.width, box.height};
}
void scrim(QPainter& p, const QJsonObject& background, QRectF box) {
    if (background.isEmpty() || box.width() <= 0) {
        return;
    }
    const double padding = std::max(0.0, background.value(u"paddingPx").toDouble());
    box.adjust(-padding, -padding, padding, padding);
    const double radius = std::max(0.0, background.value(u"radiusPx").toDouble());
    p.setBrush(cssColor(background.value(u"color").toString()));
    p.setPen(Qt::NoPen);
    p.drawRoundedRect(box, std::min({radius, box.width() / 2, box.height() / 2}),
                      std::min({radius, box.width() / 2, box.height() / 2}));
}
void paintRun(QPainter& p, const QJsonObject& style, const scene::TextStyle& parsed, const QString& text, double x,
              double y, const QRectF& box, QSize size, bool middle = true) {
    if (text.isEmpty()) {
        return;
    }
    const double spacing = parsed.letterSpacingPx.value_or(0);
    const auto font = fontFor(parsed);
    const QFontMetricsF metrics(font);
    const auto shaped = shapeText(text, parsed, spacing);
    const auto transform = p.worldTransform();
    const bool rotated = std::abs(transform.m12()) > 1e-9 || std::abs(transform.m21()) > 1e-9;
    // Skia's CPU text path switches above 256 device pixels to unhinted
    // 64px outlines: SkStrikeSpec::ShouldDrawAsPath and SkFont::setupForAsPaths.
    const double glyphScale = std::max(std::hypot(transform.m11(), transform.m12()),
                                       std::hypot(transform.m21(), transform.m22()));
    const bool pathText = shaped.fallbackRuns.isEmpty() && parsed.fontSizePx * glyphScale > 256;
    auto pathFont = shaped.font;
    if (pathText) {
        pathFont.setPixelSize(64);
    }
    // Skia places a middle-aligned paragraph from its rounded line height,
    // then snaps the top and the ascent separately when rasterizing glyphs.
    const double baseline = !middle   ? std::floor(y + 0.5)
                            : pathText ? y - std::round(metrics.ascent() + metrics.descent()) / 2 +
                                             std::floor(metrics.ascent() + 0.5)
                            : rotated ? y + metrics.ascent() - std::round(metrics.ascent() + metrics.descent()) / 2
                                      : std::floor(y - std::round(metrics.ascent() + metrics.descent()) / 2 + 0.5) +
                                            std::floor(metrics.ascent() + 0.5);
    QPainterPath path;
    std::vector<QPainterPath> glyphPaths;
    if (pathText) {
        path.setFillRule(Qt::WindingFill);
    }
    for (qsizetype i = 0; i < shaped.glyphs.size(); ++i) {
        QTransform at;
        at.translate(x + shaped.positions[i].x(), baseline + shaped.positions[i].y());
        if (pathText) {
            at.scale(parsed.fontSizePx / 64, parsed.fontSizePx / 64);
        }
        auto glyphPath = at.map(pathFont.pathForGlyph(shaped.glyphs[i]));
        if (pathText) {
            glyphPath.setFillRule(Qt::WindingFill);
            glyphPaths.push_back(glyphPath);
        }
        path.addPath(glyphPath);
    }
    for (const auto& run : shaped.fallbackRuns) {
        const auto raw = run.rawFont();
        // Loading a bitmap-only glyph as an outline can poison Qt's glyph
        // cache, leaving later color draws empty on the FreeType backend.
        if (colorFont(raw)) {
            continue;
        }
        const auto glyphs = run.glyphIndexes();
        const auto positions = run.positions();
        for (qsizetype i = 0; i < glyphs.size(); ++i) {
            QTransform at;
            at.translate(x + positions[i].x(), baseline + positions[i].y());
            path.addPath(at.map(raw.pathForGlyph(glyphs[i])));
        }
    }
    const auto outline = style.value(u"stroke").toObject(), shadow = style.value(u"shadow").toObject();
    const double strokeWidth = outline.value(u"widthPx").toDouble();
    const QPen pen(cssColor(outline.value(u"color").toString()), strokeWidth, Qt::SolidLine, Qt::FlatCap,
                   Qt::RoundJoin);
    const auto fill = style.contains(u"fill") ? style.value(u"fill") : style.value(u"color");
    if (!shadow.isEmpty()) {
        const double shadowBlur = std::max(0.0, shadow.value(u"blurPx").toDouble());
        auto shadowColor = cssColor(shadow.value(u"color").toString());
        auto mask = surface(size);
        {
            QPainter painter(&mask);
            setup(painter);
            painter.setWorldTransform(p.worldTransform());
            if (pathText) {
                // napi Canvas 0.1.100 overrides the solid source alpha with
                // shadow alpha, blurs each glyph mask, then filters the run.
                const double padding = 3 * shadowBlur / 2 + strokeWidth * glyphScale / 2 + 2;
                for (const auto& glyphPath : glyphPaths) {
                    const auto bounds = p.worldTransform().map(glyphPath).boundingRect()
                                            .adjusted(-padding, -padding, padding, padding).toAlignedRect()
                                            .intersected(QRect(QPoint{}, size));
                    if (bounds.isEmpty()) { continue; }
                    auto glyphMask = surface(bounds.size());
                    {
                        QPainter glyphPainter(&glyphMask);
                        setup(glyphPainter);
                        glyphPainter.translate(-bounds.left(), -bounds.top());
                        glyphPainter.setWorldTransform(p.worldTransform(), true);
                        glyphPainter.setOpacity(shadowColor.alphaF());
                        if (strokeWidth > 0) {
                            glyphPainter.strokePath(glyphPath, QPen(Qt::white, strokeWidth, Qt::SolidLine,
                                                                   Qt::FlatCap, Qt::RoundJoin));
                        } else {
                            const auto brush = fillBrush(fill, box);
                            glyphPainter.fillPath(glyphPath, brush.style() == Qt::SolidPattern ? QBrush(Qt::white) : brush);
                        }
                    }
                    painter.save();
                    painter.resetTransform();
                    painter.drawImage(bounds.topLeft(), blurred(glyphMask, shadowBlur / 2));
                    painter.restore();
                }
            } else {
                painter.fillPath(path, Qt::white);
                if (strokeWidth > 0) {
                    painter.strokePath(path, QPen(Qt::white, strokeWidth, Qt::SolidLine, Qt::FlatCap, Qt::RoundJoin));
                }
            }
            for (const auto& run : shaped.fallbackRuns) {
                if (colorFont(run.rawFont())) {
                    painter.drawGlyphRun(QPointF(x, baseline), run);
                }
            }
        }
        mask = blurred(mask, shadowBlur / 2);
        if (pathText && shadowBlur == 0) {
            shadowColor.setAlpha(255);
        }
        {
            QPainter painter(&mask);
            painter.setCompositionMode(QPainter::CompositionMode_SourceIn);
            painter.fillRect(mask.rect(), shadowColor);
        }
        p.save();
        p.resetTransform();
        p.drawImage(QPointF(shadow.value(u"offsetX").toDouble(), shadow.value(u"offsetY").toDouble()), mask);
        p.restore();
    }
    if (strokeWidth > 0) {
        if (pathText) {
            for (const auto& glyphPath : glyphPaths) {
                p.strokePath(glyphPath, pen);
            }
        } else {
            p.strokePath(path, pen);
        }
    }
    const auto bounds = p.worldTransform()
                            .map(path)
                            .boundingRect()
                            .adjusted(-2, -2, 2, 2)
                            .toAlignedRect()
                            .intersected(QRect(0, 0, p.device()->width(), p.device()->height()));
    if (pathText) {
        // Each shaped glyph composites its paint separately, including alpha
        // where negative tracking makes neighboring glyphs overlap.
        for (const auto& glyphPath : glyphPaths) {
            p.fillPath(glyphPath, fillBrush(fill, box));
        }
    } else if (!bounds.isEmpty()) {
        auto ink = surface(bounds.size());
        {
            QPainter painter(&ink);
            setup(painter);
            painter.translate(-bounds.left(), -bounds.top());
            painter.setWorldTransform(p.worldTransform(), true);
            painter.setFont(font);
            painter.setPen(Qt::white);
            QGlyphRun run;
            run.setRawFont(shaped.font);
            run.setGlyphIndexes(shaped.glyphs);
            run.setPositions(shaped.positions);
            if (!paintFreeTypeRun(painter, shaped, parsed, {x, baseline})) {
                if (shaped.fallbackRuns.isEmpty()) {
                    painter.drawGlyphRun(QPointF(x, baseline), run);
                } else {
                    for (const auto& fallback : shaped.fallbackRuns) {
                        if (!colorFont(fallback.rawFont())) {
                            painter.drawGlyphRun(QPointF(x, baseline), fallback);
                        }
                    }
                }
            }
        }
        // Skia corrects glyph coverage for the paint luminance against a
        // complementary background. Boosting every mask as white text makes
        // dark counters too heavy, even with identical glyph geometry.
        const auto color = cssColor(style.value(u"color").toString("#ffffff"));
        const double foreground = (0.2126 * color.redF() + 0.7152 * color.greenF() + 0.0722 * color.blueF());
        const double background = 1 - foreground;
        std::array<uchar, 256> coverage{};
        for (int i = 0; i < 256; ++i) {
            const double alpha = i / 255.0;
            const double linear = std::pow(foreground, 1.8) * alpha + std::pow(background, 1.8) * (1 - alpha);
            const double corrected = std::abs(foreground - background) < 0.01
                                         ? alpha
                                         : (std::pow(linear, 1 / 1.8) - background) / (foreground - background);
            coverage[i] = static_cast<uchar>(std::round(255 * std::clamp(corrected, 0.0, 1.0)));
        }
        for (int row = 0; row < ink.height(); ++row) {
            const std::span pixels(ink.scanLine(row), static_cast<std::size_t>(ink.bytesPerLine()));
            for (int column = 0; column < ink.width(); ++column) {
                const auto alpha = coverage[pixels[column * 4 + 3]];
                for (int c = 0; c < 4; ++c) {
                    pixels[column * 4 + c] = alpha;
                }
            }
        }
        {
            QPainter painter(&ink);
            painter.setCompositionMode(QPainter::CompositionMode_SourceIn);
            painter.translate(-bounds.left(), -bounds.top());
            painter.setWorldTransform(p.worldTransform(), true);
            painter.fillRect(p.worldTransform().inverted().mapRect(QRectF(bounds)), fillBrush(fill, box));
        }
        p.save();
        p.resetTransform();
        p.drawImage(bounds.topLeft(), ink);
        p.restore();
    }
    // Color glyphs may be bitmap-only, with no outline bounds. Draw them
    // directly so the coverage mask cannot discard or recolor their pixels.
    for (const auto& run : shaped.fallbackRuns) {
        if (colorFont(run.rawFont())) {
            p.save();
            p.setPen(QPen(fillBrush(fill, box), 0));
            p.drawGlyphRun(QPointF(x, baseline), run);
            p.restore();
        }
    }
    if (style.value(u"strikethrough").toBool()) {
        const double thickness = std::max(1.0, parsed.fontSizePx * 0.07);
        const double width = QFontMetricsF(fontFor(parsed)).horizontalAdvance(text) +
                             spacing * std::max(0, scene::graphemeCount(text) - 1);
        p.fillRect(QRectF(x, y - thickness / 2, width, thickness), fillBrush(fill, box));
    }
}
struct Unit {
    QString text;
    double x = 0, y = 0, width = 0, height = 0;
};
std::vector<QString> graphemes(const QString& text) {
    QTextBoundaryFinder finder(QTextBoundaryFinder::Grapheme, text);
    std::vector<QString> out;
    qsizetype from = 0;
    for (auto to = finder.toNextBoundary(); to != -1; to = finder.toNextBoundary()) {
        out.push_back(text.mid(from, to - from));
        from = to;
    }
    return out;
}
std::vector<Unit> unitsFor(const scene::TextLayout& layout, const scene::TextStyle& style, const QString& unit) {
    std::vector<Unit> units;
    const auto measure = textMeasurer();
    for (const auto& line : layout.lines) {
        if (unit == "line") {
            units.push_back({line.text, line.x, line.y, line.width, layout.lineHeight});
            continue;
        }
        if (unit == "character" && !line.words.empty() && !units.empty()) {
            units.push_back({{}, line.x, line.y, 0, layout.lineHeight});
        }
        double x = line.x;
        for (std::size_t i = 0; i < line.words.size(); ++i) {
            const auto& word = line.words[i];
            if (unit == "word") {
                units.push_back({word, x, line.y, line.wordWidths[i], layout.lineHeight});
            } else {
                QString prefix;
                double width = 0;
                int count = 0;
                for (const auto& glyph : graphemes(word)) {
                    prefix += glyph;
                    ++count;
                    const double next = measure(prefix, style) + layout.letterSpacingPx * count;
                    units.push_back({glyph, x + width, line.y, next - width, layout.lineHeight});
                    width = next;
                }
                if (i + 1 < line.words.size()) {
                    units.push_back({{}, x + line.wordWidths[i], line.y, layout.spaceWidth, layout.lineHeight});
                }
            }
            x += line.wordWidths[i] + layout.spaceWidth;
        }
    }
    return units;
}
void paintText(QPainter& p, const ActiveLayer& layer, QSize size) {
    const auto style = layer.ext.value(u"textStyle").toObject();
    const auto parsed = scene::parseTextStyle(style);
    const auto measure = textMeasurer();
    const auto layout = scene::layoutTextBlock(measure, parsed, size.width(), size.height());
    const auto box = rect(layout.box);
    scrim(p, style.value(u"background").toObject(), box);
    const auto samples = layer.ext.value(u"units").toArray();
    if (!samples.isEmpty()) {
        const auto unit = layer.ext.value(u"unit").toString();
        const auto units = unitsFor(layout, parsed, unit);
        double tracking = 0, previousY = NAN;
        QPointF caret = units.empty() ? box.topLeft() : QPointF(units.front().x, units.front().y);
        for (std::size_t i = 0; i < units.size(); ++i) {
            const auto& u = units[i];
            if (u.y != previousY) {
                tracking = 0;
                previousY = u.y;
            }
            const auto s = samples[std::min(static_cast<qsizetype>(i), samples.size() - 1)].toObject();
            const auto glyph = s.value(u"glyph").toObject();
            auto unitStyle = style;
            if (glyph.contains(u"color")) {
                unitStyle.insert("color", glyph.value(u"color"));
                unitStyle.remove("fill");
            }
            if (glyph.contains(u"trackingPx")) {
                unitStyle.insert("letterSpacingPx", glyph.value(u"trackingPx"));
            }
            const double shift = unit == "character" ? tracking : 0;
            if (unit == "character" && glyph.contains(u"trackingPx")) {
                tracking += glyph.value(u"trackingPx").toDouble() - layout.letterSpacingPx;
            }
            const double opacity = s.value(u"opacity").toDouble(1), sx = s.value(u"scaleX").toDouble(1),
                         sy = s.value(u"scaleY").toDouble(1);
            if (opacity > 0.5) {
                caret = {u.x + u.width, u.y};
            }
            if (u.text.isEmpty() || opacity <= 0 || sx <= 0 || sy <= 0) {
                continue;
            }
            const double ax = s.value(u"anchorX").toDouble(0.5), ay = s.value(u"anchorY").toDouble(0.5);
            const double px = (s.contains(u"positionX") ? size.width() / 2.0 + s.value(u"positionX").toDouble()
                                                        : u.x + u.width * ax) +
                              s.value(u"offsetX").toDouble() + shift;
            const double py = (s.contains(u"positionY") ? size.height() / 2.0 + s.value(u"positionY").toDouble()
                                                        : u.y + (ay - 0.5) * u.height) +
                              s.value(u"offsetY").toDouble();
            auto drawUnit = [&](QPainter& painter) {
                painter.translate(px, py);
                painter.rotate(s.value(u"rotation").toDouble() * 180 / std::numbers::pi);
                painter.scale(sx, sy);
                painter.setOpacity(opacity);
                const QRectF unitBox((box.x() - px) / sx, (box.y() - py) / sy, box.width() / sx, box.height() / sy);
                paintRun(painter, unitStyle, scene::parseTextStyle(unitStyle), u.text, -u.width * ax,
                         -(ay - 0.5) * u.height, unitBox, size);
            };
            const double blur = glyph.value(u"blurPx").toDouble();
            if (blur > 0) {
                auto image = surface(size);
                {
                    QPainter painter(&image);
                    setup(painter);
                    drawUnit(painter);
                }
                p.drawImage(0, 0, blurred(image, blur));
            } else {
                p.save();
                drawUnit(p);
                p.restore();
            }
        }
        const auto c = layer.ext.value(u"caret").toObject();
        if (!c.isEmpty()) {
            p.fillRect(QRectF(caret.x() + 4, caret.y() - parsed.fontSizePx * 0.54 + 8, c.value(u"widthPx").toDouble(2),
                              parsed.fontSizePx * 1.08),
                       cssColor(c.value(u"color").toString()));
        }
        return;
    }
    const auto pathData = style.value(u"path").toString();
    if (!pathData.isEmpty()) {
        const auto path = flattenedPath(svgPath(pathData, size));
        const double length = path.length();
        if (length > 0) {
            const auto glyphs = graphemes(parsed.text);
            std::vector<double> widths;
            double total = 0;
            for (const auto& glyph : glyphs) {
                const double width = measure(glyph, parsed) + 2 * layout.letterSpacingPx;
                widths.push_back(width);
                total += width;
            }
            // prepareText leaves Canvas letterSpacing enabled while drawText
            // measures path glyphs, then adds tracking once more. Overflow
            // samples the endpoint rather than dropping glyphs.
            double distance = std::max(0.0, (length - total) / 2);
            for (std::size_t i = 0; i < glyphs.size(); ++i) {
                {
                    const double at = path.percentAtLength(std::clamp(distance + widths[i] / 2, 0.0, length));
                    p.save();
                    p.translate(path.pointAtPercent(at));
                    p.rotate(-path.angleAtPercent(at));
                    paintRun(p, style, parsed, glyphs[i], -widths[i] / 2, 0, box, size);
                    p.restore();
                }
                distance += widths[i];
            }
            return;
        }
    }
    for (const auto& line : layout.lines) {
        paintRun(p, style, parsed, line.text, line.x, line.y, box, size);
    }
}
void paintCaption(QPainter& p, const QJsonObject& caption, QSize size) {
    const auto style = caption.value(u"style").toObject();
    const auto words = caption.value(u"words").toArray();
    if (words.isEmpty()) {
        return;
    }
    const double fraction = style.value(u"fontSizeFrac").toDouble(0.05);
    const double fontSize = std::max(24.0, std::floor(size.height() * (fraction > 0 ? fraction : 0.05) + 0.5));
    scene::TextStyle parsed;
    parsed.fontSizePx = fontSize;
    parsed.fontWeight = 700;
    parsed.fontFamily = style.value(u"fontFamily").toString();
    const auto measure = textMeasurer();
    const double space = measure(QStringLiteral(" "), parsed), lineHeight = fontSize * 1.25;
    std::vector<QJsonArray> lines;
    std::vector<double> widths;
    QJsonArray line;
    double width = 0;
    for (const auto& item : words) {
        const auto word = item.toObject();
        const double advance = measure(word.value(u"text").toString(), parsed);
        if (!line.isEmpty() && width + space + advance > size.width() * 0.9) {
            lines.push_back(line);
            widths.push_back(width);
            line = {};
            width = 0;
        }
        if (!line.isEmpty()) {
            width += space;
        }
        line.append(word);
        width += advance;
    }
    if (!line.isEmpty()) {
        lines.push_back(line);
        widths.push_back(width);
    }
    const double margin = std::max(0.0, style.value(u"bottomMarginFrac").toDouble(0.12));
    const double top = size.height() * (1 - margin) - lines.size() * lineHeight;
    const double blockWidth = *std::max_element(widths.begin(), widths.end());
    scrim(p, style.value(u"background").toObject(),
          {(size.width() - blockWidth) / 2, top, blockWidth, lines.size() * lineHeight});
    const auto outline = style.contains(u"outline")
                             ? style.value(u"outline").toObject()
                             : QJsonObject{{"color", "rgba(0,0,0,0.85)"}, {"widthPx", std::max(2.0, fontSize * 0.12)}};
    double y = top + fontSize;
    for (std::size_t i = 0; i < lines.size(); ++i) {
        double x = (size.width() - widths[i]) / 2;
        for (const auto& value : lines[i]) {
            const auto word = value.toObject();
            QJsonObject paint{{"color", word.value(u"active").toBool() ? style.value(u"activeColor").toString("#FFD60A")
                                                                       : style.value(u"color").toString("#FFFFFF")},
                              {"stroke", outline}};
            paintRun(p, paint, parsed, word.value(u"text").toString(), x, y, {}, size, false);
            x += measure(word.value(u"text").toString(), parsed) + space;
        }
        y += lineHeight;
    }
}
} // namespace
scene::MeasureText textMeasurer() {
    return [](const QString& text, const scene::TextStyle& style) {
        // Canvas returns a float32 width rounded to hundredths. Preserve
        // that boundary, including the strict wrap at a Yoga-sized width.
        return static_cast<double>(static_cast<float>(std::round(shapeText(text, style).width * 100) / 100));
    };
}
QImage rasterize(const ActiveLayer& layer) {
    const QSize size(layer.sourceWidth, layer.sourceHeight);
    if (size.isEmpty() || !qobject_cast<QGuiApplication*>(QCoreApplication::instance())) {
        return {};
    }
    auto image = surface(size);
    QPainter painter(&image);
    setup(painter);
    if (layer.kind == "shape") {
        paintShape(painter, layer.ext.value(u"shapeStyle").toObject(), size);
    } else if (layer.kind == "text") {
        paintText(painter, layer, size);
    } else if (layer.kind == "caption") {
        paintCaption(painter, layer.ext.value(u"caption").toObject(), size);
    }
    return image;
}
const QImage& RasterCache::imageFor(const ActiveLayer& layer) {
    const QSize size(layer.sourceWidth, layer.sourceHeight);
    QJsonObject inputs;
    for (const auto* field : {"textStyle", "shapeStyle", "caption", "unit", "units", "caret"}) {
        const auto key = QLatin1String(field);
        if (layer.ext.contains(key)) {
            inputs.insert(key, layer.ext.value(key));
        }
    }
    if (m_image.isNull() || m_inputs != inputs || m_size != size || m_kind != layer.kind) {
        m_image = rasterize(layer);
        m_inputs = std::move(inputs);
        m_size = size;
        m_kind = layer.kind;
        ++m_count;
    }
    return m_image;
}
} // namespace nt::render2d
