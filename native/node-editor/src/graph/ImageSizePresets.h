#pragma once
// The size presets of web/src/config/constants.ts IMAGE_SIZE_PRESETS, in the web's order.
// ImageSizeProperty.tsx names the first preset that matches a size under its fields.
#include <QString>
#include <array>

namespace nodetool {
struct ImageSizePreset {
    const char *label;
    int width;
    int height;
    const char *aspectRatio;
};

inline constexpr std::array<ImageSizePreset, 37> imageSizePresets{{
    {"NTSC SD", 720, 480, "3:2"},
    {"PAL SD", 720, 576, "5:4"},
    {"720p HD", 1280, 720, "16:9"},
    {"1080p Full HD", 1920, 1080, "16:9"},
    {"DCI 2K Cinema", 2048, 1080, "1.9:1"},
    {"QHD 2K", 2560, 1440, "16:9"},
    {"4K UHD", 3840, 2160, "16:9"},
    {"DCI 4K Cinema", 4096, 2160, "1.9:1"},
    {"iMac 5K", 5120, 2880, "16:9"},
    {"Cinema 6K RED BMPCC", 6144, 3160, "1.94:1"},
    {"Canon R5C 6K", 6016, 3200, "1.88:1"},
    {"8K UHD", 7680, 4320, "16:9"},
    {"8K DCI Cinema", 8192, 4320, "1.9:1"},
    {"9:16 Social Media", 1080, 1920, "9:16"},
    {"4K Vertical", 2160, 3840, "9:16"},
    {"2.39:1 Cinema Anamorphic", 2048, 858, "2.39:1"},
    {"1.85:1 Cinema", 1998, 1080, "1.85:1"},
    {"2.39:1 Cinema 4K", 4096, 1716, "2.39:1"},
    {"iPhone 16 Pro Max", 440, 956, "19.5:9"},
    {"iPhone 16 Pro", 402, 874, "19.5:9"},
    {"iPhone 16", 390, 844, "19.5:9"},
    {"iPhone SE", 375, 667, "16:9"},
    {"Android large", 360, 800, "20:9"},
    {"iPad Pro 13\"", 1032, 1376, "3:4"},
    {"iPad Pro 11\"", 834, 1194, "3:4"},
    {"iPad Mini", 744, 1133, "2:3"},
    {"Surface Pro 8", 1368, 912, "3:2"},
    {"MacBook Pro 14\"", 1512, 982, "16:10"},
    {"MacBook Pro 16\"", 1728, 1117, "16:10"},
    {"iMac 24\"", 2240, 1260, "16:9"},
    {"Instagram post", 1080, 1080, "1:1"},
    {"Facebook post", 1200, 630, "1.91:1"},
    {"Twitter post", 1200, 675, "16:9"},
    {"YouTube thumbnail", 1280, 720, "16:9"},
    {"A4", 595, 842, "1:1.414"},
    {"A5", 420, 595, "1:1.414"},
    {"Letter", 612, 792, "1:1.29"},
}};

// The preset caption the web shows under the fields, such as "1080p Full HD 16:9".
inline QString imageSizePresetCaption(int width, int height) {
    for (const auto &preset : imageSizePresets) {
        if (preset.width == width && preset.height == height) {
            return QStringLiteral("%1 %2").arg(QString::fromUtf8(preset.label), QString::fromUtf8(preset.aspectRatio));
        }
    }
    return {};
}
} // namespace nodetool
