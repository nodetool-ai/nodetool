#include <memory>

int main() {
    auto owner = std::make_unique<int>(42);
    const volatile int* observer = owner.get();
    owner.reset();
    return *observer;  // Deliberate heap-use-after-free.
}
