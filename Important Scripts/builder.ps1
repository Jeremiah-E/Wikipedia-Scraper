# Rename the terminal tab to "Graph Builder"
$host.UI.RawUI.WindowTitle = "Graph Builder"

# Get the directory of the current script
$scriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
# Allow for non-ASCII characters (Most notably, →, but since we're parsing Wikipedia, many articles have non-ASCII characters as well, such as Klaus_Töpfer)
$OutputEncoding = [System.Text.Encoding]::UTF8
$logFilePath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) "debug.log"

# Set the console output encoding to UTF-8
[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Enable-ANSI {
    $kernel32 = Add-Type -MemberDefinition @"
[DllImport("kernel32.dll")]
public static extern bool SetConsoleMode(IntPtr hConsoleHandle, int mode);
[DllImport("kernel32.dll")]
public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out int mode);
[DllImport("kernel32.dll")]
public static extern IntPtr GetStdHandle(int handle);
"@ -Name "Kernel32" -Namespace "WinAPI" -PassThru

    $handle = [WinAPI.Kernel32]::GetStdHandle(-11)
    $mode = 0
    if ([WinAPI.Kernel32]::GetConsoleMode($handle, [ref]$mode)) {
        $newMode = $mode -bor 0x0004
        [WinAPI.Kernel32]::SetConsoleMode($handle, $newMode)
    }
}
function Run-NodeScript {
    param (
        [string]$ScriptPath,
        [string[]]$Arguments
    )

    $nodePath = "node" # Or the full path to node.exe if needed

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $nodePath

    # Handle script path with spaces by enclosing it in quotes
    $scriptPathWithQuotes = "`"$ScriptPath`""

    # Handle arguments with spaces by enclosing them in quotes
    $quotedArguments = $Arguments | ForEach-Object {
        if ($_ -match '\s') {
            "`$_`""
        } else {
            $_
        }
    }

    $process.StartInfo.Arguments = @($scriptPathWithQuotes) + $quotedArguments
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.CreateNoWindow = $true
    $process.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $process.StartInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $process.Start() | Out-Null

    $output = $process.StandardOutput.ReadToEnd()
    $err = $process.StandardError.ReadToEnd()

    $process.WaitForExit()

    if ($err) {
        $errLines = $err -split "`r`n"
        foreach ($line in $errLines) {
            # JS sends both warnings and errors through the error channel, so look for a Warning prefix
            if ($line.StartsWith("Warning: ")) {
                Write-Warning $line.Substring(9)
            } else {
                Write-Error $line
            }
        }
    }

    return $output
}

[void] (Enable-ANSI)

while ($true) {
    try {
        # Prompt the user with light green text for input
        Write-Host "Enter the number of articles to look up (or type 'exit' to quit): " -ForegroundColor DarkCyan -NoNewline
        $n = Read-Host

        if ($n -eq "exit") {
            Write-Host "Exiting the script. Goodbye!"
            break
        }

        # Validate input
        $n = [int]$n
    }
    catch {
        Write-Host "Invalid input. Please provide a valid integer."
        continue
    }

    # Define file paths
    $file1 = Join-Path $scriptDir "graph.js"
    $file2 = Join-Path $scriptDir "graphToChart.js"
    $file3 = Join-Path $scriptDir "categorize.js"
    $file4 = Join-Path $scriptDir "resetUpdates.js"

    # Create command queue
    $commands = @(
        @{ Script = $file1; Arguments = @($n) },
        @{ Script = $file2; Arguments = @() },
        @{ Script = $file3; Arguments = @() }
    )
    $altCommand = @{ Script = $file4; Arguments = @() }
    $itemsToUpdate = 0

    # Execute each command
    $host.UI.RawUI.WindowTitle = "Building Graph"
    foreach ($command in $commands) {
        Write-Host "Executing: $($command.Script) $($command.Arguments -join ' ')" -ForegroundColor Gray

        # Use the Run-NodeScript function
        $output = Run-NodeScript -ScriptPath $command.Script -Arguments $command.Arguments

        # Write the output to the log file
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $logFilePath -Value "[$timestamp] Script: $($command.Script) $($command.Arguments -join ' ')"
        Add-Content -Path $logFilePath -Value "[$timestamp] Output:"
        Add-Content -Path $logFilePath -Value $output
        Add-Content -Path $logFilePath -Value "---------------------------------------"

        # Display the output in the console
        Write-Host $output

        if ($command.Script -eq $file1) {
            $outputLines = $output -split "`r`n"
            $itemsToUpdate = ($outputLines[-1] -split ' ')[0]
        }
        if ($itemsToUpdate -eq 0) {
            # ... (Reset command logic remains the same)
            if ($confirmation -eq 'yes' -or $confirmation -eq 'y') {
                Write-Host "Executing the reset command..." -ForegroundColor Green
                Run-NodeScript -ScriptPath $altCommand.Script -Arguments $altCommand.Arguments
            }
        }
    }
    $host.UI.RawUI.WindowTitle = "Graph Builder"
}