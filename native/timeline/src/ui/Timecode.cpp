// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#include "ui/Timecode.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

namespace nt::ui {
namespace {
using Count = unsigned long long;
constexpr auto kMaxFrame = std::numeric_limits<long long>::max();
constexpr auto kMaxCount = std::numeric_limits<Count>::max();

double actualRate(double fps) { return std::isfinite(fps) ? std::max(1.0, fps) : 1.0; }
Count add(Count a, Count b) { return a > kMaxCount - b ? kMaxCount : a + b; }
Count multiply(Count a, Count b) { return b && a > kMaxCount / b ? kMaxCount : a * b; }
long long frameCount(Count count) { return static_cast<long long>(std::min(count, static_cast<Count>(kMaxFrame))); }

bool separator(QChar c) { return c == u':' || c == u';' || c == u'.' || c == u','; }
std::optional<Count> digits(QStringView field) {
    Count value = 0;
    for (const QChar c : field) {
        if (c < u'0' || c > u'9') { return std::nullopt; }
        const Count digit = c.unicode() - u'0';
        if (value > (static_cast<Count>(kMaxFrame) - digit) / 10) { return std::nullopt; }
        value = value * 10 + digit;
    }
    return value;
}
QString padded(Count value, int width = 2) { return QString::number(value).rightJustified(width, u'0'); }
}

int timecodeBase(double fps) {
    if (!std::isfinite(fps) || fps < 1) { return 1; }
    return static_cast<int>(std::min(std::floor(fps + 0.5), double(std::numeric_limits<int>::max())));
}
bool supportsDropFrame(double fps) {
    const int base = timecodeBase(fps);
    return std::isfinite(fps) && base % 30 == 0 && std::abs(fps - base * 1000.0 / 1001.0) < 0.01;
}
long long frameAtMs(double ms, double fps) {
    const double frames = std::floor(ms / 1000 * actualRate(fps) + 0.5);
    if (std::isnan(frames) || frames <= 0) { return 0; }
    if (frames >= static_cast<double>(kMaxFrame)) { return kMaxFrame; }
    return static_cast<long long>(frames);
}
double msAtFrame(long long frame, double fps) { return static_cast<double>(frame) * 1000 / actualRate(fps); }

QString formatTimecodeFrame(long long frame, double fps, bool dropFrame) {
    const Count base = timecodeBase(fps);
    const bool df = dropFrame && supportsDropFrame(fps);
    Count n = frame < 0 ? static_cast<Count>(-(frame + 1)) + 1 : static_cast<Count>(frame);
    if (df) {
        const Count drop = base / 15;
        const Count perMinute = base * 60 - drop;
        const Count perTen = perMinute * 10 + drop;
        const Count minutes = n % perTen;
        n += drop * 9 * (n / perTen);
        if (minutes > drop) { n += drop * ((minutes - drop) / perMinute); }
    }
    const QChar sep = df ? u';' : u':';
    return (frame < 0 ? QStringLiteral("-") : QString()) + padded(n / (base * 3600)) + sep +
        padded((n / (base * 60)) % 60) + sep + padded((n / base) % 60) + sep + padded(n % base, base >= 100 ? 3 : 2);
}
QString formatTimecodeMs(double ms, double fps, bool dropFrame) {
    return formatTimecodeFrame(frameAtMs(ms, fps), fps, dropFrame);
}

std::optional<long long> parseTimecode(QStringView input, double fps, bool dropFrame, long long currentFrame) {
    input = input.trimmed();
    if (input.isEmpty()) { return std::nullopt; }
    int relative = 0;
    if (input.front() == u'+' || input.front() == u'-') {
        relative = input.front() == u'+' ? 1 : -1;
        input = input.sliced(1);
    }
    if (input.isEmpty()) { return std::nullopt; }
    std::array<Count, 4> fields{};
    const bool separated = std::ranges::any_of(input, separator);
    if (!separated) {
        const auto number = digits(input);
        if (!number) { return std::nullopt; }
        if (relative) {
            fields[3] = *number;
        } else {
            if (input.size() > 8) { return std::nullopt; }
            qsizetype end = input.size();
            for (int index = 3; end > 0; --index) {
                const auto start = std::max(qsizetype(0), end - 2);
                fields[index] = *digits(input.sliced(start, end - start));
                end = start;
            }
        }
    } else {
        int count = 0;
        qsizetype start = 0;
        for (qsizetype end = 0; end <= input.size(); ++end) {
            if (end != input.size() && !separator(input[end])) { continue; }
            if (count == 4) { return std::nullopt; }
            const auto number = digits(input.sliced(start, end - start));
            if (!number) { return std::nullopt; }
            fields[count++] = *number;
            start = end + 1;
        }
        std::rotate(fields.begin(), fields.begin() + count, fields.end());
    }
    auto [h, m, s, f] = fields;
    const Count base = timecodeBase(fps);
    Count frames;
    if (!separated && relative) {
        frames = f;
    } else {
        const bool df = dropFrame && supportsDropFrame(fps) && m < 60 && s < 60 && f < base;
        if (df && m % 10 != 0 && s == 0) { f = std::max(f, base / 15); }
        frames = add(multiply(add(add(multiply(h, 3600), multiply(m, 60)), s), base), f);
        // Once the nominal count saturates uint64, drop-frame subtraction cannot bring it back into int64.
        if (df && frames != kMaxCount) {
            const Count minutes = h * 60 + m;
            frames -= (base / 15) * (minutes - minutes / 10);
        }
    }
    const long long value = frameCount(frames);
    if (relative > 0) {
        return currentFrame > kMaxFrame - value ? kMaxFrame : std::max(0LL, currentFrame + value);
    }
    if (relative < 0) {
        return currentFrame < std::numeric_limits<long long>::min() + value ? 0LL : std::max(0LL, currentFrame - value);
    }
    return value;
}
}
