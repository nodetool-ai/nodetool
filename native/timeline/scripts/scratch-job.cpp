// Windows scratch process ownership. No child executes outside the job.
#include <QCoreApplication>
#include <QStringList>
#ifdef Q_OS_WIN
#include <cstdio>
#include <memory>
#include <string>
#include <vector>
// winsock2.h must precede windows.h. iphlpapi.h needs both, and declares its
// IPv6 tables only once ws2tcpip.h has defined IN6_ADDR.
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>

struct CloseHandleDeleter {
    void operator()(void *handle) const {
        if (handle) {
            CloseHandle(handle);
        }
    }
};
using Handle = std::unique_ptr<void, CloseHandleDeleter>;

static int failure(const char *operation) {
    std::fprintf(stderr, "%s failed: %lu\n", operation, GetLastError());
    return 2;
}

// CommandLineToArgvW / CRT quoting, including trailing backslashes.
static std::wstring quote(const QString &arg) {
    std::wstring result = L"\"";
    unsigned slashes = 0;
    for (wchar_t c : arg.toStdWString()) {
        if (c == L'\\') {
            ++slashes;
            continue;
        }
        result.append(c == L'"' ? slashes * 2 + 1 : slashes, L'\\');
        slashes = 0;
        result += c;
    }
    result.append(slashes * 2, L'\\');
    return result + L'"';
}

template <class Table> static bool listeners(ULONG family, unsigned port) {
    ULONG bytes = 0;
    DWORD error = GetExtendedTcpTable(nullptr, &bytes, FALSE, family, TCP_TABLE_OWNER_PID_LISTENER, 0);
    if (error != ERROR_INSUFFICIENT_BUFFER) {
        SetLastError(error);
        return false;
    }
    std::vector<unsigned char> storage(bytes);
    error = GetExtendedTcpTable(storage.data(), &bytes, FALSE, family, TCP_TABLE_OWNER_PID_LISTENER, 0);
    if (error != NO_ERROR) {
        SetLastError(error);
        return false;
    }
    const auto *table = reinterpret_cast<const Table *>(storage.data());
    for (DWORD i = 0; i < table->dwNumEntries; ++i) {
        const auto &row = table->table[i];
        if (ntohs(static_cast<u_short>(row.dwLocalPort)) == port) {
            std::printf("%lu\n", row.dwOwningPid);
        }
    }
    return true;
}

static int run(const QStringList &args) {
    if (args.size() < 3) {
        return 2;
    }
    if (args[1] == "listeners") {
        const auto port = args[2].toUInt();
        if (!listeners<MIB_TCPTABLE_OWNER_PID>(AF_INET, port) ||
            !listeners<MIB_TCP6TABLE_OWNER_PID>(AF_INET6, port)) {
            return failure("GetExtendedTcpTable");
        }
        return 0;
    }
    const auto name = args[2].toStdWString();
    if (args[1] != "run") {
        Handle job(OpenJobObjectW(JOB_OBJECT_QUERY | JOB_OBJECT_TERMINATE, FALSE, name.c_str()));
        if (!job) {
            if (GetLastError() == ERROR_FILE_NOT_FOUND) {
                return 1;
            }
            return failure("OpenJobObject");
        }
        if (args[1] == "stop") {
            return TerminateJobObject(job.get(), 1) ? 0 : failure("TerminateJobObject");
        }
        if (args[1] == "contains" && args.size() == 4) {
            Handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, args[3].toULong()));
            if (!process) {
                return failure("OpenProcess listener");
            }
            BOOL member = FALSE;
            if (!IsProcessInJob(process.get(), job.get(), &member)) {
                return failure("IsProcessInJob");
            }
            return member ? 0 : 1;
        }
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
        if (!QueryInformationJobObject(job.get(), JobObjectBasicAccountingInformation, &info, sizeof(info),
                                       nullptr)) {
            return failure("QueryInformationJobObject");
        }
        return info.ActiveProcesses ? 0 : 1;
    }
    if (args.size() < 5) {
        return 2;
    }
    Handle owner(OpenProcess(SYNCHRONIZE, FALSE, args[3].toULong()));
    if (!owner) {
        return failure("OpenProcess owner");
    }
    Handle job(CreateJobObjectW(nullptr, name.c_str()));
    if (!job || GetLastError() == ERROR_ALREADY_EXISTS) {
        return failure("CreateJobObject");
    }
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job.get(), JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
        return failure("SetInformationJobObject");
    }
    // Atomic assignment avoids even an orphaned suspended process if this helper crashes.
    SIZE_T size = 0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
    std::vector<unsigned char> storage(size);
    auto *attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
    if (!InitializeProcThreadAttributeList(attributes, 1, 0, &size)) {
        return failure("InitializeProcThreadAttributeList");
    }
    struct DeleteAttributes {
        LPPROC_THREAD_ATTRIBUTE_LIST list;
        ~DeleteAttributes() { DeleteProcThreadAttributeList(list); }
    } cleanup{attributes};
    HANDLE jobHandle = job.get();
    if (!UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &jobHandle,
                                   sizeof(jobHandle), nullptr, nullptr)) {
        return failure("UpdateProcThreadAttribute");
    }
    STARTUPINFOEXW startup{};
    startup.StartupInfo.cb = sizeof(startup);
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    for (HANDLE handle :
         {startup.StartupInfo.hStdInput, startup.StartupInfo.hStdOutput, startup.StartupInfo.hStdError}) {
        if (!SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) {
            return failure("SetHandleInformation");
        }
    }
    startup.lpAttributeList = attributes;
    std::wstring command;
    for (qsizetype i = 4; i < args.size(); ++i) {
        if (i != 4) {
            command += L' ';
        }
        command += quote(args[i]);
    }
    PROCESS_INFORMATION process{};
    const auto executable = args[4].toStdWString();
    if (!CreateProcessW(executable.c_str(), command.data(), nullptr, nullptr, TRUE,
                        EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, nullptr, nullptr,
                        &startup.StartupInfo, &process)) {
        return failure("CreateProcess");
    }
    Handle child(process.hProcess), thread(process.hThread);
    for (;;) {
        const DWORD ownerState = WaitForSingleObject(owner.get(), 50);
        if (ownerState == WAIT_OBJECT_0) {
            return 0; // closing job kills descendants
        }
        if (ownerState == WAIT_FAILED) {
            return failure("WaitForSingleObject");
        }
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info{};
        if (!QueryInformationJobObject(job.get(), JobObjectBasicAccountingInformation, &info, sizeof(info),
                                       nullptr)) {
            return failure("QueryInformationJobObject");
        }
        if (!info.ActiveProcesses) {
            DWORD code = 1;
            if (!GetExitCodeProcess(child.get(), &code)) {
                return failure("GetExitCodeProcess");
            }
            return static_cast<int>(code);
        }
    }
}
#endif
int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
#ifdef Q_OS_WIN
    return run(app.arguments());
#else
    return 2;
#endif
}
