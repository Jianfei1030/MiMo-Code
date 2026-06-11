# Build 交接报告

## 当前状态

已合并上游 7 个提交到本地 main 分支，保留了 3 个自定义文件。

## 构建前必须做的事

**先杀掉所有 mimo 进程**，否则 `build.ts` 的 `rm -rf dist` 会因为 `mimo.exe` 被占用而失败：

```powershell
Get-Process mimo -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process mimocode -ErrorAction SilentlyContinue | Stop-Process -Force
```

## 构建命令

```powershell
Set-Location D:\Projects\MiMo-Code\packages\opencode
bun run build:dev -- --skip-install
```

- `--skip-install`：跳过 `build.ts` 内部的 `bun install`（依赖已装过，且 `bun install` 在非交互式 shell 中会阻塞 stdin）
- 如果依赖有变动，去掉 `--skip-install`

## 构建后验证

```powershell
# 确认产物存在
Get-ChildItem D:\Projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo*

# smoke test
D:\Projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe --version
```

## 全局命令设置（如未做过）

```powershell
Set-Location D:\Projects\MiMo-Code\packages\opencode
npm link

[Environment]::SetEnvironmentVariable(
  "MIMOCODE_BIN_PATH",
  "D:\Projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe",
  "User"
)
```

设置后重开终端，`mimo --version` 验证。

## 合并的上游变更摘要

| 文件 | 变更 |
|------|------|
| README.md / README.zh.md | OpenCode 仓库 URL 修正 + 二维码更新 |
| custom-elements.d.ts (x2) | 改为 symlink |
| package.json | build:dev channel: latest → prod |
| jf/README.md | 上游已删除，我们保留 |
| mimo-free.ts | **保留我们的版本**（禁用 opencode/opencode-go provider） |
| local.tsx | **保留我们的版本**（用户模型选择优先） |
