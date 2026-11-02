// Ported from FilmCraft (https://github.com/storytold/filmcraft) crates/scopes/src/summary.rs at 8c171a0. MIT, see licenses/FilmCraft-MIT.txt.
#pragma once
#include "color/ScopeMath.h"
#include <QJsonObject>
#include <QStringList>
namespace nt::scopes {
struct NumbersOptions {
    Matrix matrix = Matrix::Bt709;
    int columns = 8;
    int peaks = 8;
    bool bins = true;
    QStringList scopes;
};
QJsonObject readNumbers(const Signal &, const NumbersOptions & = {});
}
