#include <limits>

int main(int argc, char**) {
    volatile int value = std::numeric_limits<int>::max();
    return value + argc;  // Deliberate signed overflow.
}
