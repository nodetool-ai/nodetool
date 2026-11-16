/****************************************************************************
** Meta object code from reading C++ file 'AccountController.h'
**
** Created by: The Qt Meta Object Compiler version 69 (Qt 6.12.0)
**
** WARNING! All changes made in this file will be lost!
*****************************************************************************/

#include "../../../../qt/include/nodetool/account/qt/AccountController.h"
#include <QtCore/qmetatype.h>

#include <QtCore/qtmochelpers.h>

#include <memory>


#include <QtCore/qxptype_traits.h>
#if !defined(Q_MOC_OUTPUT_REVISION)
#error "The header file 'AccountController.h' doesn't include <QObject>."
#elif Q_MOC_OUTPUT_REVISION != 69
#error "This file was generated using the moc from 6.12.0. It"
#error "cannot be used with the include files from this version of Qt."
#error "(The moc has changed too much.)"
#endif

#ifndef Q_CONSTINIT
#define Q_CONSTINIT
#endif

QT_WARNING_PUSH
QT_WARNING_DISABLE_DEPRECATED
QT_WARNING_DISABLE_GCC("-Wuseless-cast")
namespace {
struct qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t {};
} // unnamed namespace

template <> constexpr inline auto nodetool::account::qt::AccountController::qt_create_metaobjectdata<qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>()
{
    namespace QMC = QtMocConstants;
    QtMocHelpers::StringRefStorage qt_stringData {
        "nodetool::account::qt::AccountController",
        "changed",
        "",
        "browserRequested",
        "QUrl",
        "url",
        "signedOut",
        "drainInbox",
        "reload",
        "signIn",
        "cancelSignIn",
        "signOut",
        "state",
        "State",
        "displayName",
        "serverOrigin",
        "serverEndPending",
        "cloudAvailable",
        "keychainAvailable",
        "statusText",
        "message",
        "SignedOut",
        "SigningIn",
        "SignedIn"
    };

    QtMocHelpers::UintData qt_methods {
        // Signal 'changed'
        QtMocHelpers::SignalData<void()>(1, 2, QMC::AccessPublic, QMetaType::Void),
        // Signal 'browserRequested'
        QtMocHelpers::SignalData<void(const QUrl &)>(3, 2, QMC::AccessPublic, QMetaType::Void, {{
            { 0x80000000 | 4, 5 },
        }}),
        // Signal 'signedOut'
        QtMocHelpers::SignalData<void()>(6, 2, QMC::AccessPublic, QMetaType::Void),
        // Slot 'drainInbox'
        QtMocHelpers::SlotData<void()>(7, 2, QMC::AccessPrivate, QMetaType::Void),
        // Method 'reload'
        QtMocHelpers::MethodData<void()>(8, 2, QMC::AccessPublic, QMetaType::Void),
        // Method 'signIn'
        QtMocHelpers::MethodData<void()>(9, 2, QMC::AccessPublic, QMetaType::Void),
        // Method 'cancelSignIn'
        QtMocHelpers::MethodData<void()>(10, 2, QMC::AccessPublic, QMetaType::Void),
        // Method 'signOut'
        QtMocHelpers::MethodData<void()>(11, 2, QMC::AccessPublic, QMetaType::Void),
    };
    QtMocHelpers::UintData qt_properties {
        // property 'state'
        QtMocHelpers::PropertyData<enum State>(12, 0x80000000 | 13, QMC::DefaultPropertyFlags | QMC::EnumOrFlag, 0),
        // property 'displayName'
        QtMocHelpers::PropertyData<QString>(14, QMetaType::QString, QMC::DefaultPropertyFlags, 0),
        // property 'serverOrigin'
        QtMocHelpers::PropertyData<QString>(15, QMetaType::QString, QMC::DefaultPropertyFlags | QMC::Constant),
        // property 'serverEndPending'
        QtMocHelpers::PropertyData<bool>(16, QMetaType::Bool, QMC::DefaultPropertyFlags, 0),
        // property 'cloudAvailable'
        QtMocHelpers::PropertyData<bool>(17, QMetaType::Bool, QMC::DefaultPropertyFlags, 0),
        // property 'keychainAvailable'
        QtMocHelpers::PropertyData<bool>(18, QMetaType::Bool, QMC::DefaultPropertyFlags | QMC::Constant),
        // property 'statusText'
        QtMocHelpers::PropertyData<QString>(19, QMetaType::QString, QMC::DefaultPropertyFlags, 0),
        // property 'message'
        QtMocHelpers::PropertyData<QString>(20, QMetaType::QString, QMC::DefaultPropertyFlags, 0),
    };
    QtMocHelpers::UintData qt_enums {
        // enum 'State'
        QtMocHelpers::EnumData<enum State>(13, 13, QMC::EnumIsScoped).add({
            {   21, State::SignedOut },
            {   22, State::SigningIn },
            {   23, State::SignedIn },
        }),
    };
    return QtMocHelpers::metaObjectData<AccountController, qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>(QMC::MetaObjectFlag{}, qt_stringData,
            qt_methods, qt_properties, qt_enums);
}
Q_CONSTINIT const QMetaObject nodetool::account::qt::AccountController::staticMetaObject = { {
    QMetaObject::SuperData::link<QObject::staticMetaObject>(),
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>.stringdata,
    qt_staticMetaObjectStaticContent<qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>.data,
    qt_static_metacall,
    nullptr,
    qt_staticMetaObjectRelocatingContent<qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>.metaTypes,
    nullptr
} };

void nodetool::account::qt::AccountController::qt_static_metacall(QObject *_o, QMetaObject::Call _c, int _id, void **_a)
{
    auto *_t = static_cast<AccountController *>(_o);
    if (_c == QMetaObject::InvokeMetaMethod) {
        switch (_id) {
        case 0: _t->changed(); break;
        case 1: _t->browserRequested((*reinterpret_cast<std::add_pointer_t<QUrl>>(_a[1]))); break;
        case 2: _t->signedOut(); break;
        case 3: _t->drainInbox(); break;
        case 4: _t->reload(); break;
        case 5: _t->signIn(); break;
        case 6: _t->cancelSignIn(); break;
        case 7: _t->signOut(); break;
        default: ;
        }
    }
    if (_c == QMetaObject::IndexOfMethod) {
        if (QtMocHelpers::indexOfMethod<void (AccountController::*)()>(_a, &AccountController::changed, 0))
            return;
        if (QtMocHelpers::indexOfMethod<void (AccountController::*)(const QUrl & )>(_a, &AccountController::browserRequested, 1))
            return;
        if (QtMocHelpers::indexOfMethod<void (AccountController::*)()>(_a, &AccountController::signedOut, 2))
            return;
    }
    if (_c == QMetaObject::ReadProperty) {
        void *_v = _a[0];
        switch (_id) {
        case 0: *reinterpret_cast<enum State*>(_v) = _t->state(); break;
        case 1: *reinterpret_cast<QString*>(_v) = _t->displayName(); break;
        case 2: *reinterpret_cast<QString*>(_v) = _t->serverOrigin(); break;
        case 3: *reinterpret_cast<bool*>(_v) = _t->serverEndPending(); break;
        case 4: *reinterpret_cast<bool*>(_v) = _t->cloudAvailable(); break;
        case 5: *reinterpret_cast<bool*>(_v) = _t->keychainAvailable(); break;
        case 6: *reinterpret_cast<QString*>(_v) = _t->statusText(); break;
        case 7: *reinterpret_cast<QString*>(_v) = _t->message(); break;
        default: break;
        }
    }
}

const QMetaObject *nodetool::account::qt::AccountController::metaObject() const
{
    return QObject::d_ptr->metaObject ? QObject::d_ptr->dynamicMetaObject() : &staticMetaObject;
}

void *nodetool::account::qt::AccountController::qt_metacast(const char *_clname)
{
    if (!_clname) return nullptr;
    if (!strcmp(_clname, qt_staticMetaObjectStaticContent<qt_meta_tag_ZN8nodetool7account2qt17AccountControllerE_t>.strings))
        return static_cast<void*>(this);
    return QObject::qt_metacast(_clname);
}

int nodetool::account::qt::AccountController::qt_metacall(QMetaObject::Call _c, int _id, void **_a)
{
    _id = QObject::qt_metacall(_c, _id, _a);
    if (_id < 0)
        return _id;
    if (_c == QMetaObject::InvokeMetaMethod) {
        if (_id < 8)
            qt_static_metacall(this, _c, _id, _a);
        _id -= 8;
    }
    if (_c == QMetaObject::RegisterMethodArgumentMetaType) {
        if (_id < 8)
            *reinterpret_cast<QMetaType *>(_a[0]) = QMetaType();
        _id -= 8;
    }
    if (_c == QMetaObject::ReadProperty || _c == QMetaObject::WriteProperty
            || _c == QMetaObject::ResetProperty || _c == QMetaObject::BindableProperty
            || _c == QMetaObject::RegisterPropertyMetaType) {
        qt_static_metacall(this, _c, _id, _a);
        _id -= 8;
    }
    return _id;
}

// SIGNAL 0
void nodetool::account::qt::AccountController::changed()
{
    QMetaObject::activate(this, &staticMetaObject, 0, nullptr);
}

// SIGNAL 1
void nodetool::account::qt::AccountController::browserRequested(const QUrl & _t1)
{
    QMetaObject::activate<void>(this, &staticMetaObject, 1, nullptr, _t1);
}

// SIGNAL 2
void nodetool::account::qt::AccountController::signedOut()
{
    QMetaObject::activate(this, &staticMetaObject, 2, nullptr);
}
QT_WARNING_POP
