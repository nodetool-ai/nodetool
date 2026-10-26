#include "model/TimelineJson.h"

#include <QByteArrayView>

#include <cstddef>
#include <cstdint>
#include <span>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    const std::span<const std::uint8_t> bytes(data, size);
    const QByteArrayView view(bytes);
    const auto json = QByteArray::fromRawData(view.data(), view.size());
    const auto result = nt::parseTimelineJson(json);
    (void)result;
    return 0;
}
