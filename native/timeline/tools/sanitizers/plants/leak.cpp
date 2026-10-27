#include <cstdio>
#include <memory>

[[gnu::noinline]] void leakProjectAllocation() {
    auto owner = std::make_unique<int>(42);
    // Printing makes the allocation observable before deliberately losing its owner.
    std::fprintf(stderr, "planted allocation: %p\n", static_cast<void*>(owner.release()));
}

int main() {
    leakProjectAllocation();
    return 0;
}
