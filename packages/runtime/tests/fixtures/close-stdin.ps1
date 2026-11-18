# A live Windows process whose actual stdin handle is closed before readiness.
# Closing fd 0 in the Node fixture did not break the parent's pipe on Windows.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BrokenInput {
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr GetStdHandle(int which);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);
    public static void Run() {
        if (!CloseHandle(GetStdHandle(-10))) throw new Exception("Cannot close stdin");
        Console.Error.WriteLine("NODETOOL_STDIO_READY");
        System.Threading.Thread.Sleep(30000);
    }
}
'@
[BrokenInput]::Run()
