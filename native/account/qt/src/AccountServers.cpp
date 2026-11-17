#include "nodetool/account/qt/AccountServers.h"

#include "nodetool/account/accounts_index.h"
#include "nodetool/account/origin.h"

#include <algorithm>
#include <cctype>

namespace nodetool::account::qt {

std::string serverAddressOrigin(const std::string& address) {
  std::string trimmed = address;
  const auto notSpace = [](unsigned char c) { return std::isspace(c) == 0; };
  trimmed.erase(trimmed.begin(), std::find_if(trimmed.begin(), trimmed.end(), notSpace));
  trimmed.erase(std::find_if(trimmed.rbegin(), trimmed.rend(), notSpace).base(), trimmed.end());
  if (trimmed.empty()) {
    return {};
  }
  // A typed host name has no scheme. A typed `http://` keeps its scheme, so
  // it is refused rather than quietly upgraded.
  if (trimmed.find("://") == std::string::npos) {
    trimmed = "https://" + trimmed;
  }
  return canonicalHttpsOrigin(trimmed).value_or(std::string());
}

AccountServers::AccountServers(std::filesystem::path dataDir, std::string defaultOrigin, ServicesFactory factory,
                               std::string initialOrigin, QObject* parent)
    : QObject(parent), dataDir_(std::move(dataDir)), defaultOrigin_(std::move(defaultOrigin)),
      factory_(std::move(factory)) {
  entries_.push_back({defaultOrigin_, nullptr});
  for (const AccountEntry& entry : AccountsIndex(dataDir_).list()) {
    if (const auto origin = canonicalHttpsOrigin(entry.serverOrigin)) {
      list(*origin);
    }
  }
  const std::string initial = serverAddressOrigin(initialOrigin);
  current_ = controllerFor(QString::fromStdString(!initial.empty() && find(initial) ? initial : defaultOrigin_));
}

AccountServers::~AccountServers() = default;

QString AccountServers::currentServer() const {
  for (const Entry& entry : entries_) {
    if (entry.controller.get() == current_) {
      return QString::fromStdString(entry.origin);
    }
  }
  return {};
}

QStringList AccountServers::servers() const {
  QStringList out;
  for (const Entry& entry : entries_) {
    out << QString::fromStdString(entry.origin);
  }
  return out;
}

AccountServers::Entry* AccountServers::find(const std::string& origin) {
  const auto it = std::find_if(entries_.begin(), entries_.end(), [&](const Entry& e) { return e.origin == origin; });
  return it == entries_.end() ? nullptr : &*it;
}

bool AccountServers::list(const std::string& origin) {
  if (find(origin) != nullptr) {
    return false;
  }
  entries_.push_back({origin, nullptr});
  return true;
}

AccountController* AccountServers::controllerFor(const QString& origin) {
  const std::string text = origin.toStdString();
  // The default may be empty, for an invalid NODETOOL_CLOUD_SERVER. Every
  // other server must be an HTTPS origin.
  const std::string canonical = text == defaultOrigin_ ? text : serverAddressOrigin(text);
  if (canonical.empty() && text != defaultOrigin_) {
    return nullptr;
  }
  Entry* entry = find(canonical);
  if (entry == nullptr) {
    list(canonical);
    entry = find(canonical);
    emit serversChanged();
  }
  if (!entry->controller) {
    entry->controller = std::make_unique<AccountController>(factory_(canonical));
    AccountController* account = entry->controller.get();
    connect(account, &AccountController::browserRequested, this,
            [this, account](const QUrl& url) { emit browserRequested(url, account); });
    connect(account, &AccountController::signedOut, this, [this, account] { emit signedOut(account); });
  }
  return entry->controller.get();
}

QString AccountServers::addServer(const QString& address) {
  const std::string origin = serverAddressOrigin(address.toStdString());
  if (origin.empty()) {
    return tr("Enter the address of a server that uses HTTPS, such as nodetool.example.com.");
  }
  AccountController* account = controllerFor(QString::fromStdString(origin));
  if (account != current_) {
    current_ = account;
    emit currentChanged();
  }
  return {};
}

bool AccountServers::switchTo(const QString& origin) {
  const std::string text = origin.toStdString();
  if (find(text) == nullptr) {
    return false;
  }
  AccountController* account = controllerFor(origin);
  if (account != nullptr && account != current_) {
    current_ = account;
    emit currentChanged();
  }
  return account != nullptr;
}

void AccountServers::reload() {
  bool added = false;
  for (const AccountEntry& entry : AccountsIndex(dataDir_).list()) {
    if (const auto origin = canonicalHttpsOrigin(entry.serverOrigin)) {
      added = list(*origin) || added;
    }
  }
  if (added) {
    emit serversChanged();
  }
}

} // namespace nodetool::account::qt
