// Behaviour ported from FilmCraft (MIT), see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QString>
#include <QStringView>
#include <optional>
namespace nt::ui {
int timecodeBase(double fps);
bool supportsDropFrame(double fps);
long long frameAtMs(double ms, double fps);
double msAtFrame(long long frame, double fps);
QString formatTimecodeFrame(long long frame, double fps, bool dropFrame);
QString formatTimecodeMs(double ms, double fps, bool dropFrame);
std::optional<long long> parseTimecode(QStringView input, double fps, bool dropFrame, long long currentFrame);
}
