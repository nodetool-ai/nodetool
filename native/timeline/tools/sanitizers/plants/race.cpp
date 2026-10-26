#include <barrier>
#include <thread>

int main() {
    int shared = 0;
    std::barrier start(2);
    auto write = [&] {
        start.arrive_and_wait();
        for (int i = 0; i < 100000; ++i) {
            shared = i;  // Deliberate conflicting writes without synchronization.
        }
    };
    {
        std::jthread first(write);
        std::jthread second(write);
    }
    return shared == 99999 ? 0 : 1;
}
