#include "kernel/runner.h"
#include <stdexcept>
#include <iostream>
namespace {
class EmptyCatalog final : public gr::NodeCatalog {
public:
  std::optional<gr::Json> describe(const gr::Json&) override { return std::nullopt; }
  std::optional<gr::Json> resolve(const std::string&) override { return std::nullopt; }
  gr::Json validate(const gr::Json&,const std::vector<std::string>&) override { return gr::Json::array(); }
  std::unique_ptr<gr::Executor> create(const gr::Json&) override { throw std::logic_error("no nodes in cancellation-listener test"); }
};
void check(bool condition,const char* name) { if(!condition)throw std::runtime_error(name); }
}
int main() {
 try {
  EmptyCatalog catalog;gr::Runner runner(catalog,[](const gr::Json&){});
  int first=0, removed=0, added=0;
  size_t removedToken=0;
  runner.onCancel([&] { ++first;runner.removeCancelListener(removedToken);runner.onCancel([&]{++added;});runner.cancel(); });
  removedToken=runner.onCancel([&]{++removed;});
  runner.cancel();runner.cancel();
  check(first==1,"reentrant cancellation executes first once");
  check(removed==0,"removed listener must not run");
  check(added==1,"listener added during cancellation runs exactly once");
  gr::Runner selfRemoving(catalog,[](const gr::Json&){});
  size_t selfToken=0;int selfCount=0, tail=0;
  selfToken=selfRemoving.onCancel([&]{++selfCount;selfRemoving.removeCancelListener(selfToken);});
  selfRemoving.onCancel([&]{++tail;});selfRemoving.cancel();
  check(selfCount==1&&tail==1,"self removal keeps later listeners alive");
  gr::Runner throwing(catalog,[](const gr::Json&){});int survivor=0;
  throwing.onCancel([]{throw std::runtime_error("expected listener failure");});
  throwing.onCancel([&]{++survivor;});throwing.cancel();
  check(throwing.cancelled()&&survivor==1,"failed listener does not prevent cancellation");
  std::cout<<"cancel listeners: reentrancy, removal and insertion passed\n";return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
