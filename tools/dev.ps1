# KillQuestion 本地启动器（Windows）
# 由 启动.cmd 调用。任何一步失败都停下来、把原因留在窗口里，绝不「闪一下就消失」。
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-WithMessage {
    param([string]$Message)
    Write-Host ''
    Write-Host ('  [KillQuestion] ' + $Message) -ForegroundColor Red
    Write-Host ''
    Read-Host '  按回车键关闭窗口' | Out-Null
    exit 1
}

Write-Host ''
Write-Host '  KillQuestion —— 本地题库刷题' -ForegroundColor Cyan
Write-Host '  --------------------------------------' -ForegroundColor DarkGray
Write-Host ''

# 1) 找 Node：先 PATH，再常见安装位置
$nodeExe = $null
$fromPath = Get-Command node.exe -ErrorAction SilentlyContinue
if ($fromPath) { $nodeExe = $fromPath.Source }
if (-not $nodeExe) {
    $candidates = @(
        'D:\node.exe',
        'D:\node.js\node.exe',
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { $nodeExe = $candidate; break }
    }
}

if (-not $nodeExe) {
    Write-Host '  这台电脑没找到 Node.js。' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  不想装环境，就直接用在线版（数据只存在浏览器里）：' -ForegroundColor Green
    Write-Host '  https://zmfk.github.io/KillQuestion/'
    Write-Host ''
    Read-Host '  按回车键关闭窗口' | Out-Null
    exit 1
}

$nodeDir = Split-Path -Parent $nodeExe
$env:Path = "$nodeDir;$env:Path"
$npmCmd = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path $npmCmd)) {
    $npmCmd = Join-Path $nodeDir 'npm'
}

Write-Host ('  Node: ' + (& $nodeExe --version) + '  (' + $nodeExe + ')') -ForegroundColor DarkGray
Write-Host ('  目录: ' + $root) -ForegroundColor DarkGray

# 2) 第一次运行：装依赖
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host ''
    Write-Host '  第一次运行，正在安装依赖，需要联网，大约 1-3 分钟……' -ForegroundColor Cyan
    Write-Host ''
    & $npmCmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage '依赖安装失败。常见原因：网络不稳、代理拦截 npm、磁盘空间不足。'
    }
}

# 3) 没有构建产物就先构建
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
    Write-Host ''
    Write-Host '  正在构建……' -ForegroundColor Cyan
    & $npmCmd run build
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage '构建失败，把窗口内容截图发出来就能定位。'
    }
}

# 4) 起本地服务并打开浏览器
Write-Host ''
Write-Host '  正在启动…… 浏览器会自动打开 http://127.0.0.1:4173/' -ForegroundColor Green
Write-Host '  用完关掉这个窗口就停止服务。'
Write-Host ''
try {
    & $npmCmd run preview -- --port 4173 --strictPort --host 127.0.0.1 --open
} catch {
    Stop-WithMessage ('启动失败：' + $_.Exception.Message)
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '  启动失败。最常见的原因：' -ForegroundColor Red
    Write-Host '    1) 4173 端口被占用 —— 先关掉之前那个黑窗口再双击本文件；'
    Write-Host '    2) 依赖没装好 —— 删掉 node_modules 文件夹，再双击一次。'
    Write-Host ''
    Read-Host '  按回车键关闭窗口' | Out-Null
    exit 1
}
