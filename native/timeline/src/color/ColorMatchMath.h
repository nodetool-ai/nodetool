// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/render/src/color_match.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#pragma once
#include <QImage>
#include <array>
namespace nt::color::detail {
using Triple = std::array<double, 3>;
Triple oklab(Triple linear);
Triple tonalWeights(double lightness);
double skinWeight(Triple lab);
struct Stats {
    std::array<std::array<double, 4>, 3> bands{};
    double chroma = 0;
    Triple skin{};
};
Stats statistics(const QImage &, bool protectSkin);
}
