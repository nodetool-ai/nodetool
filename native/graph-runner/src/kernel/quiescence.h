#pragma once
#include "kernel/inbox.h"
#include <memory>
#include <set>
#include <map>
namespace gr {
class Quiescence final : public std::enable_shared_from_this<Quiescence> {
public:
  void add(const std::string& id, Inbox& inbox, bool loop);
  void start(const std::string& id) { live_.insert(id); }
  void finish(const std::string& id) { live_.erase(id); schedule(); }
private:
  void schedule();
  void check();
  std::map<std::string,Inbox*> inboxes_;
  std::set<std::string> loops_, live_;
  bool scheduled_ = false, activity_ = true;
};
}
