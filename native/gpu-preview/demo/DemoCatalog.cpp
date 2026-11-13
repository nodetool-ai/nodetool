#include "DemoCatalog.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

namespace nt::preview::demo {
namespace {

QJsonObject computeModule(const QString& wgsl, const QString& storageFormat) {
    const int computeStage = 4;  // GPUShaderStage.COMPUTE
    return {
        {"kind", "compute"},
        {"io", QJsonObject{{"inputs", QJsonObject{}}, {"output", QJsonObject{}}}},
        {"wgsl", wgsl},
        {"entryPoint", "main"},
        {"workgroupSize", QJsonArray{8, 8, 1}},
        {"layout",
         QJsonArray{
             QJsonObject{{"binding", 0}, {"visibility", computeStage}, {"buffer", QJsonObject{{"type", "uniform"}}}},
             QJsonObject{{"binding", 1},
                         {"visibility", computeStage},
                         {"storageTexture", QJsonObject{{"access", "write-only"}, {"format", storageFormat}}}},
         }},
        {"bindings",
         QJsonArray{
             QJsonObject{{"name", "params"}, {"binding", 0}, {"kind", "uniform"}},
             QJsonObject{{"name", "output"}, {"binding", 1}, {"kind", "storageTexture"}},
         }},
        {"uniform",
         QJsonObject{{"size", 16},
                     {"fields", QJsonArray{QJsonObject{{"name", "time"}, {"type", "f32"}, {"offset", 0}},
                                           QJsonObject{{"name", "frame"}, {"type", "f32"}, {"offset", 4}}}}}},
    };
}

}  // namespace

QString catalogJson(const QString& plasmaWgsl) {
    QString floatWgsl = plasmaWgsl;
    floatWgsl.replace(QLatin1String("rgba8unorm"), QLatin1String("rgba16float"));
    const QJsonObject document{
        {"format", 1},
        // The demo has no fragment modules, so the vertex stage is unused.
        {"vertex", ""},
        {"vertexEntryPoint", "vs"},
        {"alphaConvert", QJsonObject{{"toStraight", "none@1"}, {"toPremultiplied", "none@1"}}},
        {"modules", QJsonObject{{"demo.plasma@1", computeModule(plasmaWgsl, "rgba8unorm")},
                                {"demo.plasma16@1", computeModule(floatWgsl, "rgba16float")}}},
    };
    return QString::fromUtf8(QJsonDocument(document).toJson(QJsonDocument::Compact));
}

}  // namespace nt::preview::demo
