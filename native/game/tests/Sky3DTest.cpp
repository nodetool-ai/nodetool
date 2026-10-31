#include "render/Sky3D.h"
#include <QGuiApplication>
#include <QOffscreenSurface>
#include <QResource>
#include <QSurfaceFormat>
#if QT_CONFIG(vulkan)
#include <QVulkanInstance>
#endif
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <qfloat16.h>
#include <rhi/qrhi.h>
#include <rhi/qrhi_platform.h>
#include <vector>
using namespace nodetool::game;
#ifdef NATIVE_GAME_EMBEDDED_SKY_TEST
static void initializeSkyResources() { Q_INIT_RESOURCE(game_pbr_shaders); }
#endif
namespace {
void require(bool value, const char *message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}
QVector3D sample(const QByteArray &bytes, QVector3D direction, float mip) {
  const auto d = direction.normalized(),
             a = QVector3D(std::abs(d.x()), std::abs(d.y()), std::abs(d.z()));
  int face;
  if (a.x() > a.z()) {
    face = a.x() > a.y() ? (d.x() > 0 ? 0 : 3) : (d.y() > 0 ? 1 : 4);
  } else {
    face = a.z() > a.y() ? (d.z() > 0 ? 2 : 5) : (d.y() > 0 ? 1 : 4);
  }
  float u = 0, v = 0;
  switch (face) {
  case 0:
    u = d.z() / a.x();
    v = d.y() / a.x();
    break;
  case 1:
    u = -d.x() / a.y();
    v = -d.z() / a.y();
    break;
  case 2:
    u = -d.x() / a.z();
    v = d.y() / a.z();
    break;
  case 3:
    u = -d.z() / a.x();
    v = d.y() / a.x();
    break;
  case 4:
    u = -d.x() / a.y();
    v = d.z() / a.y();
    break;
  default:
    u = d.x() / a.z();
    v = d.y() / a.z();
  }
  const float filter = std::max(4 - mip, 0.F),
              size = std::exp2(std::max(mip, 4.F));
  u = (u * .5F + .5F) * (size - 2) + 1;
  v = (v * .5F + .5F) * (size - 2) + 1;
  if (face > 2) {
    v += size;
    face -= 3;
  }
  u += face * size + filter * 48;
  v += 4 * (256 - size);
  u -= .5F;
  v -= .5F;
  const int x = static_cast<int>(std::floor(u)),
            y = static_cast<int>(std::floor(v));
  const float fx = u - x, fy = v - y;
  const auto *pixels = reinterpret_cast<const qfloat16 *>(bytes.constData());
  const auto at = [&](int px, int py) {
    const int offset =
        (std::clamp(py, 0, 1023) * 768 + std::clamp(px, 0, 767)) * 4;
    return QVector3D(float(pixels[offset]), float(pixels[offset + 1]),
                     float(pixels[offset + 2]));
  };
  return (at(x, y) * (1 - fx) + at(x + 1, y) * fx) * (1 - fy) +
         (at(x, y + 1) * (1 - fx) + at(x + 1, y + 1) * fx) * fy;
}
float roughnessMip(float roughness) {
  if (roughness >= .8F) {
    return (1 - roughness) / .2F - 2;
  }
  if (roughness >= .4F) {
    return (.8F - roughness) * 3 / .4F - 1;
  }
  if (roughness >= .305F) {
    return (.4F - roughness) / .095F + 2;
  }
  if (roughness >= .21F) {
    return (.305F - roughness) / .095F + 3;
  }
  return -2 * std::log2(std::max(1.16F * roughness, 1e-10F));
}
Json compareProbes(const Json &actual, const Json &reference) {
  const auto &a = actual.at("probes"), &b = reference.at("probes");
  require(a.is_array() && b.is_array() && a.size() == b.size() &&
              a.size() >= 63,
          "Sky comparison must inspect the full ray/roughness matrix");
  double maximum = 0, relative = 0;
  for (std::size_t i = 0; i < a.size(); ++i) {
    for (int axis = 0; axis < 3; ++axis) {
      require(std::abs(a[i].at("direction").at(axis).get<double>() -
                       b[i].at("direction").at(axis).get<double>()) < 1e-6,
              "Sky comparison ray identity");
    }
    require(std::abs(a[i].at("roughness").get<double>() -
                     b[i].at("roughness").get<double>()) < 1e-6,
            "Sky comparison roughness identity");
    for (int channel = 0; channel < 3; ++channel) {
      const double value = a[i].at("rgb").at(channel),
                   expected = b[i].at("rgb").at(channel),
                   delta = std::abs(value - expected);
      require(std::isfinite(value) && std::isfinite(expected) &&
                  delta <= .00002 + .02 * std::abs(expected),
              "Sky radiance exceeds declared 2 percent plus 2e-5 float/backend "
              "tolerance");
      maximum = std::max(maximum, delta);
      relative = std::max(relative, delta / std::max(.001, std::abs(expected)));
    }
  }
  return {{"samples", a.size()},
          {"channels", a.size() * 3},
          {"maximumAbsolute", maximum},
          {"maximumRelative", relative}};
}
} // namespace
int main(int argc, char **argv) {
  if (argc == 4 && std::string(argv[1]) == "--compare") {
    try {
      std::ifstream nativeFile(argv[2]), referenceFile(argv[3]);
      Json native, reference;
      nativeFile >> native;
      referenceFile >> reference;
      const auto report = compareProbes(native, reference);
      native["probes"][0]["rgb"][0] = 1000000;
      bool rejected = false;
      try {
        compareProbes(native, reference);
      } catch (const std::exception &) {
        rejected = true;
      }
      require(rejected,
              "Deliberately invalid sky radiance must fail comparison");
      std::cout << report.dump() << '\n';
      return 0;
    } catch (const std::exception &error) {
      std::cerr << error.what() << '\n';
      return 1;
    }
  }
  QSurfaceFormat format;
  format.setVersion(3, 3);
  format.setProfile(QSurfaceFormat::CoreProfile);
  QSurfaceFormat::setDefaultFormat(format);
  QGuiApplication app(argc, argv);
  try {
    Json sky = {{"kind", "procedural"},
                {"turbidity", 6},
                {"rayleigh", 3},
                {"groundColor", "#0d0f12"},
                {"intensity", .35}};
    const auto day = proceduralSkyRadiance3D(sky, {0, .5F, -1}, {0, 1, 0}),
               ground = proceduralSkyRadiance3D(sky, {0, .5F, -1}, {0, -1, 0});
    require(std::isfinite(day.x()) && day.z() > day.x(),
            "Procedural daylight remains finite and blue");
    require(ground.x() > 0 && ground.x() < .01F && ground.z() > ground.x(),
            "Ground uses linearized authored RGB");
    bool rejected = false;
    try {
      proceduralSkyRadiance3D(sky, {0, 0, 0}, {0, 1, 0});
    } catch (const Error &) {
      rejected = true;
    }
    require(rejected, "Invalid sun direction rejected");
    if (argc >= 4) {
      if (std::string(argv[1]) == "embedded") {
#ifdef NATIVE_GAME_EMBEDDED_SKY_TEST
        initializeSkyResources();
#else
        throw std::runtime_error("Embedded sky resources are not linked");
#endif
      } else {
        require(QResource::registerResource(QString::fromLocal8Bit(argv[1])),
                "Sky shader test resource registration");
      }
      const std::string backend = argv[2];
#if QT_CONFIG(vulkan)
      QVulkanInstance instance;
#endif
      std::unique_ptr<QOffscreenSurface> surface;
      std::unique_ptr<QRhi> rhi;
      if (backend == "gl") {
#if QT_CONFIG(opengl)
        QRhiGles2InitParams params;
        params.format = format;
        surface.reset(QRhiGles2InitParams::newFallbackSurface(format));
        params.fallbackSurface = surface.get();
        rhi.reset(QRhi::create(QRhi::OpenGLES2, &params));
#else
        throw std::runtime_error("OpenGL sky probe is unavailable");
#endif
      } else {
#if QT_CONFIG(vulkan)
        instance.setExtensions(
            QRhiVulkanInitParams::preferredInstanceExtensions());
        require(instance.create(), "Vulkan instance creation");
        QRhiVulkanInitParams params;
        params.inst = &instance;
        rhi.reset(QRhi::create(QRhi::Vulkan, &params));
#else
        throw std::runtime_error("Vulkan sky probe is unavailable");
#endif
      }
      require(bool(rhi), "Actual GPU RHI creation");
      Json environment = {{"background", "#0b1018"}, {"sky", sky}};
      QVector3D sun(0, .5F, -1);
      if (argc >= 5) {
        std::ifstream config(argv[4]);
        Json input;
        config >> input;
        environment = input.at("environment");
        const auto &s = input.at("sun");
        sun = {s.at(0).get<float>(), s.at(1).get<float>(),
               s.at(2).get<float>()};
      }
      Sky3D renderer;
      QRhiCommandBuffer *commands = nullptr;
      require(rhi->beginOffscreenFrame(&commands) == QRhi::FrameOpSuccess,
              "GPU frame starts");
      renderer.prepare(rhi.get(), commands, environment, sun);
      QRhiReadbackResult readback;
      bool completed = false;
      readback.completed = [&] { completed = true; };
      auto *read = rhi->nextResourceUpdateBatch();
      read->readBackTexture(
          QRhiReadbackDescription(renderer.environmentTexture()), &readback);
      commands->resourceUpdate(read);
      require(rhi->endOffscreenFrame() == QRhi::FrameOpSuccess && completed,
              "Atlas GPU readback completes");
      require(readback.data.size() == 768 * 1024 * 8,
              "Half-float PMREM atlas size");
      const auto *half =
          reinterpret_cast<const qfloat16 *>(readback.data.constData());
      for (qsizetype i = 0; i < readback.data.size() / 2; ++i) {
        require(std::isfinite(float(half[i])),
                "Every PMREM atlas channel must be finite");
      }
      const auto first = renderer.report();
      const auto atlasId = renderer.environmentTexture()->globalResourceId(),
                 cubeId = renderer.cubeTexture()->globalResourceId();
      require(rhi->beginOffscreenFrame(&commands) == QRhi::FrameOpSuccess,
              "Cache frame starts");
      for (int i = 0; i < 120; ++i) {
        renderer.prepare(rhi.get(), commands, environment, sun);
      }
      require(rhi->endOffscreenFrame() == QRhi::FrameOpSuccess,
              "Cache frame completes");
      require(renderer.report() == first &&
                  atlasId ==
                      renderer.environmentTexture()->globalResourceId() &&
                  cubeId == renderer.cubeTexture()->globalResourceId(),
              "Steady sky frames retain builds and resources");
      auto changed = environment;
      changed["sky"]["intensity"] = .7;
      require(rhi->beginOffscreenFrame(&commands) == QRhi::FrameOpSuccess,
              "Intensity frame starts");
      renderer.prepare(rhi.get(), commands, changed, sun);
      require(rhi->endOffscreenFrame() == QRhi::FrameOpSuccess,
              "Intensity frame completes");
      require(renderer.report().at("builds") == first.at("builds"),
              "Intensity changes do not rebuild PMREM");
      Json probes = Json::array();
      const std::vector<QVector3D> directions = {
          {1, 0, 0},        {-1, 0, 0},       {0, 1, 0},
          {0, -1, 0},       {0, 0, 1},        {0, 0, -1},
          {.2F, .8F, -.6F}, {-.8F, .2F, .6F}, {.8F, -.2F, -.6F}};
      for (const auto direction : directions) {
        for (float roughness : {0.F, .1F, .21F, .305F, .4F, .8F, 1.F}) {
          const float mip = std::clamp(roughnessMip(roughness), -2.F, 8.F),
                      low = std::floor(mip), fraction = mip - low;
          const auto value =
              sample(readback.data, direction, low) * (1 - fraction) +
              sample(readback.data, direction, std::min(8.F, low + 1)) *
                  fraction;
          probes.push_back(
              {{"direction", {direction.x(), direction.y(), direction.z()}},
               {"roughness", roughness},
               {"rgb", {value.x(), value.y(), value.z()}}});
        }
      }
      std::filesystem::path output(argv[3]);
      std::filesystem::create_directories(output);
      std::ofstream raw(output / (backend + "-atlas.rgba16f"),
                        std::ios::binary);
      raw.write(readback.data.constData(), readback.data.size());
      std::ofstream report(output / (backend + "-sky.json"));
      report << Json{{"report", first}, {"probes", probes}}.dump(2) << '\n';
      renderer.reset();
      require(renderer.report().at("textureBytes") == 0,
              "Sky reset releases its textures");
      require(rhi->beginOffscreenFrame(&commands) == QRhi::FrameOpSuccess,
              "Restore frame starts");
      renderer.prepare(rhi.get(), commands, environment, sun);
      require(rhi->endOffscreenFrame() == QRhi::FrameOpSuccess,
              "Restore frame completes");
      require(renderer.report().at("builds") == 1, "Sky rebuilds after reset");
    }
    std::cout << "Procedural sky rays, PMREM, cache and reset passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
