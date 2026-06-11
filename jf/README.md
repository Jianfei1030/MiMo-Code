# MiMo-Code 本地开发与全局命令策略

## 目标

在不破坏上游仓库结构的前提下，建立一个属于我们自己的工作区 `jf/`，用于存放本地策略、说明文档、辅助脚本和后续自定义代码。源码修改完成后，采用“方案 B”：重新编译当前平台的 MiMo-Code 二进制文件，并让任意 `cmd`、PowerShell 或终端窗口中的 `mimo` 命令启动我们修改后的版本。

## 目录约定

`jf/` 是本地扩展目录，建议只放这些内容：

- 本地开发策略文档
- 本地构建、部署、验证脚本
- 自定义实验代码
- 补丁记录、变更说明、排障笔记
- 不适合直接混入上游源码目录的工具性文件

尽量不要把上游源码文件搬进 `jf/`。真正会影响 MiMo-Code 行为的源码仍然需要修改原项目中的对应位置，例如 `packages/opencode/src` 或其他包目录。`jf/` 的作用是隔离我们的辅助资产，降低和上游仓库同步时的冲突概率。

## 为什么这样做

这个仓库是 fork 后的本地开发仓库。后续如果要从上游拉取更新，冲突通常来自两类文件：

- 我们改过、上游也改过的源码文件
- 我们新增、上游也新增了同名路径的文件

把自定义策略和辅助代码集中放在 `jf/` 后，上游更新一般不会触碰这个目录，因此可以减少冲突面。需要注意：如果我们直接修改了上游源码目录中的文件，这些修改仍然可能在拉取上游更新时产生冲突。`jf/` 不是魔法隔离层，它主要隔离我们自己的文档、脚本和本地工具。

## 开发方法选择

我们选择方案 B：编译后全局使用。

流程是：

1. 修改源码。
2. 在 `packages/opencode` 下运行构建命令。
3. 得到当前平台的可执行文件。
4. 让全局 `mimo` 命令指向这个可执行文件。
5. 打开任意新的终端窗口，输入 `mimo` 验证启动的是修改后的版本。

这种方式比直接运行 TypeScript 开发入口更接近用户真实使用环境，也更适合验证打包后的 CLI 行为。

## 前置条件

本仓库使用 Bun。根目录 `package.json` 中声明的包管理器版本是：

```bash
bun@1.3.11
```

建议确认以下命令可用：

```bash
bun --version
node --version
npm --version
```

首次拉取或依赖变化后，在仓库根目录执行：

```bash
bun install
```

## 编译当前平台版本

在 Windows 上推荐使用 PowerShell。进入 CLI 包目录：

```powershell
Set-Location G:\projects\MiMo-Code\packages\opencode
```

只编译当前平台：

```powershell
bun run build:dev
```

`build:dev` 实际会执行：

```bash
OPENCODE_CHANNEL=prod bun run script/build.ts --single
```

`--single` 表示只构建当前操作系统和 CPU 架构的二进制，避免全平台构建，速度更快。

Windows x64 的主要产物通常在：

```text
packages/opencode/dist/mimocode-windows-x64/bin/mimo
```

在 Windows 文件管理器中它可能显示为 `mimo.exe`。可以用下面的命令确认实际文件名：

```powershell
Get-ChildItem G:\projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo*
```

构建脚本会对当前平台产物执行一次 smoke test：

```text
mimo --version
```

如果 smoke test 失败，说明当前源码或构建环境还有问题，不应该继续替换全局命令。

## 让任意终端都能运行修改后的 mimo

`packages/opencode/package.json` 中定义了全局命令入口：

```json
"bin": {
  "mimo": "./bin/mimo"
}
```

`packages/opencode/bin/mimo` 是一个 Node.js 包装脚本。它启动时会优先读取环境变量 `MIMOCODE_BIN_PATH`。因此最稳定的做法是：

1. 用 `npm link` 把 `mimo` 命令注册到全局。
2. 用 `MIMOCODE_BIN_PATH` 指向我们刚刚编译出来的二进制文件。

### 第一步：注册全局 mimo 命令

在 `packages/opencode` 目录执行：

```powershell
npm link
```

执行后，npm 会在全局 bin 目录下创建 `mimo` / `mimo.cmd` 入口。Windows 常见位置是：

```text
%APPDATA%\npm
```

可以用下面的命令查看 npm 全局目录：

```powershell
npm prefix -g
```

如果新终端中提示找不到 `mimo`，检查 npm 全局 bin 目录是否已经加入 `PATH`。

### 第二步：把 mimo 指向编译产物

如果构建产物是 `mimo.exe`，执行：

```powershell
[Environment]::SetEnvironmentVariable(
  "MIMOCODE_BIN_PATH",
  "G:\projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe",
  "User"
)
```

如果实际产物文件名是 `mimo`，则改成：

```powershell
[Environment]::SetEnvironmentVariable(
  "MIMOCODE_BIN_PATH",
  "G:\projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo",
  "User"
)
```

这会写入当前 Windows 用户环境变量。已经打开的终端不会自动刷新环境变量，需要重新打开一个新的 `cmd`、PowerShell 或终端窗口。

### 第三步：验证

打开新的终端窗口，执行：

```powershell
mimo --version
```

也可以验证环境变量：

```powershell
$env:MIMOCODE_BIN_PATH
```

如果 `mimo --version` 成功，并且功能表现符合源码修改后的预期，就说明全局命令已经指向本地编译版本。

## 日常开发循环

推荐固定使用下面的循环：

1. 修改源码。
2. 如涉及类型风险，在包目录运行类型检查：

   ```powershell
   Set-Location G:\projects\MiMo-Code\packages\opencode
   bun typecheck
   ```

3. 重新编译当前平台：

   ```powershell
   bun run build:dev
   ```

4. 打开新终端或复用已刷新环境变量的终端。
5. 执行：

   ```powershell
   mimo --version
   mimo
   ```

6. 验证修改后的功能。

只要 `MIMOCODE_BIN_PATH` 仍然指向同一个构建产物路径，后续重新 `bun run build:dev` 后不需要再次 `npm link`，也不需要再次设置环境变量。

## 从上游拉取更新时的策略

推荐流程：

1. 拉取上游更新前，先查看本地改动：

   ```powershell
   git status
   ```

2. 确认 `jf/` 中的文档、脚本和本地工具不需要和上游合并。
3. 拉取或合并上游更新。
4. 如果源码文件有冲突，只处理真正修改过的源码文件，不要动无关文件。
5. 合并完成后重新安装依赖或重新构建：

   ```powershell
   bun install
   Set-Location G:\projects\MiMo-Code\packages\opencode
   bun run build:dev
   ```

6. 再次运行全局 `mimo` 验证。

如果 `jf/` 只是个人本机目录，不希望提交到 fork，可以把它加入本地 Git 排除文件：

```powershell
Add-Content .git\info\exclude "jf/"
```

如果希望这些策略、脚本和记录跟随 fork 走，就不要加入 `.git/info/exclude`，正常提交 `jf/` 即可。

## 注意事项

- `jf/` 可以减少自定义文件和上游文件的冲突，但不能避免源码修改本身产生冲突。
- 每次修改源码后，方案 B 都需要重新运行 `bun run build:dev`。
- `npm link` 一般只需要执行一次，除非全局 npm 链接被删除或 Node/npm 环境重装。
- 修改 `MIMOCODE_BIN_PATH` 后，需要打开新的终端窗口才会生效。
- 如果 `mimo` 启动的不是新版本，优先检查 `MIMOCODE_BIN_PATH` 是否指向最新构建产物。
- 如果构建失败，先不要调整全局命令，应该先修复源码或依赖问题。

## 避免 bun.lock 被构建脚本修改

`build.ts` 默认会执行 `bun install --os="*" --cpu="*"` 安装全平台依赖，这会重新解析依赖树并修改 `bun.lock`。

日常开发只需编译当前平台，不需要安装全平台依赖。在 `bun run build:dev` 后面加 `-- --skip-install` 可以跳过这一步：

```powershell
bun run build:dev -- --skip-install
```

或者直接在 `package.json` 的 `build:dev` 脚本中加上 `--skip-install`，这样每次构建都不会碰 `bun.lock`。

只有以下情况才需要去掉 `--skip-install`：

- 首次构建（还没有安装过依赖）
- `package.json` 依赖发生变化后
- 从上游拉取更新后依赖有变动

## Git 推送与 husky pre-push hook

项目配置了 husky pre-push hook，会在 `git push` 前自动运行 `bun turbo typecheck` 对全仓库做类型检查。

### bun shim 路径问题

Windows 上 `npm` 全局安装的 bun shim（`%APPDATA%\npm\bun`）可能指向一个不存在的路径 `node_modules/bun/bin/bun.exe`，导致 hook 报错 `command not found`。

修复方法：编辑 `%APPDATA%\npm\bun`（shell 脚本）和 `%APPDATA%\npm\bun.ps1`，把 bun 路径改为实际安装位置：

```
# bun (shell)
exec "$HOME/.bun/bin/bun.exe" "$@"

# bun.ps1
& "$HOME/.bun/bin/bun.exe" $args
```

### typecheck 失败

上游 `packages/app/src/custom-elements.d.ts` 是一个 symlink，在 Windows 上 checkout 后变成纯文本文件，`tsgo` 无法解析导致 `@mimo-ai/desktop` 类型检查失败。这是上游已有问题，不是我们的改动。

遇到这种情况用 `--no-verify` 跳过 hook：

```powershell
git push --no-verify origin main
```

## 推荐命令速查

完整构建并接入全局命令的核心命令如下：

```powershell
Set-Location G:\projects\MiMo-Code
bun install

Set-Location G:\projects\MiMo-Code\packages\opencode
bun run build:dev
npm link

[Environment]::SetEnvironmentVariable(
  "MIMOCODE_BIN_PATH",
  "G:\projects\MiMo-Code\packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe",
  "User"
)
```

然后重新打开终端：

```powershell
mimo --version
mimo
```
