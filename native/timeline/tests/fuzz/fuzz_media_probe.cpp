#include "preview/FfmpegSource.h"

#include <QByteArrayView>
#include <QTemporaryFile>

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <span>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    const std::span<const std::uint8_t> bytes(data, size);
    const QByteArrayView view(bytes);
    QTemporaryFile file;
    if (!file.open() || file.write(view.data(), view.size()) != view.size() ||
        !file.flush()) {
        std::abort();  // A broken environment must not silently pass every input.
    }
    const auto facts = nt::probeMedia(file.fileName().toStdString());
    (void)facts;
    return 0;
}
