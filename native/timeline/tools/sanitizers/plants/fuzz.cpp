#include <cstddef>
#include <cstdint>
#include <span>

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    const std::span<const std::uint8_t> bytes(data, size);
    if (bytes.size() >= 3 && bytes[0] == 'N' && bytes[1] == 'T' && bytes[2] == '!') {
        __builtin_trap();  // Deliberate crash, reachable by mutation from NT?.
    }
    return 0;
}
