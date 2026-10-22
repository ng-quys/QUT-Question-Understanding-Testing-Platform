param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidateSet('Ollama','Backend','AIGenerator','AntiCheating','Frontend','AdminFrontend')][string]$Service)
$ErrorActionPreference='Stop'
# Every service wrapper owns one non-inheritable Job Object handle. Its children
# inherit job membership, never the handle. Killing the wrapper closes that last
# handle and terminates only this wrapper's process tree (no taskkill /IM).
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class ExamFlowOwnedJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long PerProcessTime, PerJobTime; public uint Flags;
        public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct Extended {
        public Basic Limits; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public ExamFlowOwnedJob() {
        handle=CreateJobObject(IntPtr.Zero,null);
        if(handle==IntPtr.Zero) throw new InvalidOperationException("Cannot create owned process job.");
        var limits=new Extended(); limits.Limits.Flags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int size=Marshal.SizeOf(typeof(Extended)); IntPtr buffer=Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(limits,buffer,false);
            if(!SetInformationJobObject(handle,9,buffer,(uint)size) || !AssignProcessToJobObject(handle,GetCurrentProcess()))
                throw new InvalidOperationException("Cannot safely contain service process tree.");
        } catch {CloseHandle(handle);handle=IntPtr.Zero;throw;}
        finally {Marshal.FreeHGlobal(buffer);}
    }
    public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
}
'@
$taskJob=New-Object ExamFlowOwnedJob
try {
    $ports=$env:EXAMFLOW_LAUNCH_PORTS | ConvertFrom-Json
    switch($Service){
        'Ollama' {Set-Location -LiteralPath $Root; & $env:EXAMFLOW_LAUNCH_OLLAMA serve}
        'Backend' {
            Set-Location -LiteralPath (Join-Path $Root 'backend')
            & $env:EXAMFLOW_LAUNCH_MAVEN ('-Dmaven.repo.local='+(Join-Path $env:USERPROFILE '.m2/repository')) 'spring-boot:run'
        }
        'AIGenerator' {
            Set-Location -LiteralPath (Join-Path $Root 'ai-service')
            & (Join-Path $Root 'ai-service/start-ai-credits.ps1') -Port $ports.AIGenerator -BackendBaseUri ('http://127.0.0.1:'+$ports.Backend)
        }
        'AntiCheating' {
            Set-Location -LiteralPath (Join-Path $Root 'anticheating')
            & (Join-Path $Root 'anticheating/.venv/Scripts/python.exe') (Join-Path $Root 'anticheating/app/run_service.py')
        }
        {$_ -in @('Frontend','AdminFrontend')} {
            $folder=if($Service -eq 'AdminFrontend'){'frontend-admin'}else{'frontend'}
            $port=if($Service -eq 'AdminFrontend'){$ports.AdminFrontend}else{$ports.Frontend}
            Set-Location -LiteralPath (Join-Path $Root $folder)
            & $env:EXAMFLOW_LAUNCH_NPM run dev -- --host 127.0.0.1 --port $port --strictPort
        }
    }
    if($LASTEXITCODE -ne 0){throw 'Service exited with an error.'}
} catch {Write-Error ($Service+' failed; inspect this service log. Sensitive exception details suppressed.');exit 1}
finally {$taskJob.Dispose()}
