// The servers one app can sign in to, one account each, and the one it
// uses now (PRD "Sign in" step 2, FR3, FR29). NodeTool Cloud is always
// listed. Another server is added by its address, and a server an account
// on this computer signed in to before is listed again from
// `accounts.json`.
//
// Switching keeps every server's AccountController, so a document opened
// under one account keeps its session, and its waiting changes stay with
// that account (FR28).
#pragma once

#include "nodetool/account/qt/AccountController.h"

#include <QObject>
#include <QString>
#include <QStringList>
#include <QUrl>

#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace nodetool::account::qt {

// Thread affinity: UI thread only.
//
// Ownership: owns one AccountController per server it has opened, created
// on first use and destroyed with this object. Callers borrow a controller
// through current() or controllerFor() and must not keep it past this
// object.
class AccountServers final : public QObject {
  Q_OBJECT
  Q_PROPERTY(nodetool::account::qt::AccountController* current READ current NOTIFY currentChanged)
  Q_PROPERTY(QString currentServer READ currentServer NOTIFY currentChanged)
  Q_PROPERTY(QStringList servers READ servers NOTIFY serversChanged)
  Q_PROPERTY(QString defaultServer READ defaultServer CONSTANT)

public:
  // Builds the services of the controller for one server origin. The
  // origin is already canonical.
  using ServicesFactory = std::function<AccountServices(const std::string& origin)>;

  // `defaultOrigin` is NodeTool Cloud, or NODETOOL_CLOUD_SERVER. An empty
  // one stands for an invalid address, and its controller refuses sign-in.
  // `initialOrigin` is the server the app used last, when it is listed;
  // otherwise the app starts on the default.
  AccountServers(std::filesystem::path dataDir, std::string defaultOrigin, ServicesFactory factory,
                 std::string initialOrigin = {}, QObject* parent = nullptr);
  ~AccountServers() override;

  AccountController* current() const { return current_; }
  QString currentServer() const;
  QStringList servers() const;
  QString defaultServer() const { return QString::fromStdString(defaultOrigin_); }

  // The controller of `origin`, created on first use. Null for an address
  // that is not an HTTPS origin.
  AccountController* controllerFor(const QString& origin);

  // Adds the server at `address` and switches to it. An address without a
  // scheme is read as HTTPS. Returns why the address was refused, or an
  // empty string. Only HTTPS origins are accepted: the browser, the code
  // exchange and every credential after them go to this address.
  Q_INVOKABLE QString addServer(const QString& address);
  // Switches to a listed server. Returns false for one that is not listed.
  Q_INVOKABLE bool switchTo(const QString& origin);
  // Reads `accounts.json` again for servers the other app signed in to.
  Q_INVOKABLE void reload();

signals:
  void currentChanged();
  void serversChanged();
  // A controller asks for the system browser. The app opens `url` and
  // calls `account->browserNotOpened()` when it cannot.
  void browserRequested(const QUrl& url, nodetool::account::qt::AccountController* account);
  // The account of `account` moved from signed in to signed out.
  void signedOut(nodetool::account::qt::AccountController* account);

private:
  struct Entry {
    std::string origin;
    std::unique_ptr<AccountController> controller;
  };

  Entry* find(const std::string& origin);
  // Adds `origin` to the list. Returns whether it was new.
  bool list(const std::string& origin);

  const std::filesystem::path dataDir_;
  const std::string defaultOrigin_;
  ServicesFactory factory_;
  // In the order listed: the default first, then by first appearance.
  std::vector<Entry> entries_;
  AccountController* current_ = nullptr;
};

// The canonical HTTPS origin of an address a person typed, such as
// `nodetool.example.com` or `https://nodetool.example.com/`. Empty when the
// address is not an HTTPS origin.
std::string serverAddressOrigin(const std::string& address);

} // namespace nodetool::account::qt
