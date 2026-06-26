# MiMo-Code 本地开发与全局命令策略

## 目标

在不破坏上游仓库结构的前提下，建立一个属于我们自己的工作区 `jf/`，用于存放本地策略、说明文档、辅助脚本和后续自定义代码。源码修改完成后，采用"方案 B"：重新编译当前平台的 MiMo-Code 二进制文件，并让任意 `cmd`、PowerShell 或终端窗口中的 `mimo` 命令启动我们修改后的版本。

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
OPENCODE_CHANNEL=latest bun run script/build.ts --single
```

`--single` 表示只构建当前操作系统和 CPU 架构的二进制，避免全平台构建，速度更快。

> **⚠️ 版本号注意**：`MIMOCODE_CHANNEL` 必须是 `latest`，否则 `@mimo-ai/script` 会将构建视为 preview channel，版本号回退为 `0.0.0-<channel>-<timestamp>` 格式（如 `0.0.0-prod-202606111710`），而不是从 `package.json` 读取真实版本号（当前 `0.1.3`）。合并上游更新时务必检查此值是否被还原。**注意：变量名已从 `OPENCODE_CHANNEL` 改为 `MIMOCODE_CHANNEL`**。

> **⚠️ Bun 版本要求**：上游 v0.1.2+ 要求 `bun@^1.3.14`。如果构建报版本错误，执行 `powershell -c "irm bun.sh/install.ps1|iex"` 升级。

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
2. 让 `MIMOCODE_BIN_PATH` 指向我们刚刚编译出来的二进制文件。

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

### 第二步：让 mimo 指向编译产物

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

3. 重新编译当前平台。
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

只要 `MIMOCODE_BIN_PATH` 仍然指向同一个构建产物路径，后续重新 `bun run build:dev` 后不需要再执行 `npm link`，也不需要再次设置环境变量。

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

如果希望这些策略、脚本和记录跟随 fork 走，就不要加到 `.git/info/exclude`，正常提交 `jf/` 即可。

## 处理 "unrelated histories" 错误

如果执行 `git pull` 或 `git merge` 时报告 "refusing to merge unrelated histories"（通常发生在仓库重建、force push 或根提交 hash 不同时），使用以下命令：

```powershell
git fetch upstream
git merge upstream/main --allow-unrelated-histories --no-commit
```

`--allow-unrelated-histories` 允许合并没有共同祖先的分支，`--no-commit` 会在自动合并后暂停，方便你检查冲突和定制文件是否被覆盖，确认无误后再手动 `git commit`。

**注意**：合并后应先检查 jf/README.md 中列出的关键文件是否被上游覆盖，再决定是否需要恢复定制。不是每次合并都会触动所有 listed 文件，应先实际 `git diff` 确认。

## SSRF 白名单（内网 Provider）

上游 v0.1.2 新增了 SSRF 保护（`src/util/ssrf.ts`），会阻止解析到内网 IP（`10.x`、`172.16-31.x`、`192.168.x` 等）的请求。Paper Hub（`tc-paperhub.diezhi.net` → `10.10.224.42`）已被我们**硬编码**到 `ssrf.ts` 的 `ALLOWED_HOSTNAMES` 中，无需设置环境变量即可正常工作。

如需添加其他内网 hostname，可通过环境变量追加（多个用逗号分隔）：

```powershell
$env:MIMOCODE_SSRF_ALLOWED_HOSTS = "other-internal-host.example.com"
```

> **⚠️ VSCode 终端注意**：VSCode 终端不会可靠地加载 User 级环境变量（即使重启 VSCode）。这就是我们将 Paper Hub 硬编码而非仅依赖环境变量的原因。如果必须用环境变量方式，在 VSCode `settings.json` 中添加 `"terminal.integrated.env.windows": { "MIMOCODE_SSRF_ALLOWED_HOSTS": "..." }`。

合并上游时 `ssrf.ts` 可能被覆盖，需重新添加 `ALLOWED_HOSTNAMES` 及硬编码条目。检查方法：`Select-String -Path packages/opencode/src/util/ssrf.ts -Pattern "ALLOWED_HOSTNAMES"`

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

或者直接在 `package.json` 的 `build:dev` 脚本中加上 `--skip-install`，这样每次构建都不会动 `bun.lock`。

只有以下情况才需要去掉 `--skip-install`：

- 首次构建（还没有安装过依赖）
- `package.json` 依赖发生变化
- 从上游拉取更新后依赖有变

## bin/mimo ESM 兼容性修复

上游 v0.1.2+ 将 `packages/opencode/package.json` 改为 `"type": "module"`，导致 Node.js 把 `bin/mimo` 当作 ESM 解析，但原文件使用 CJS 语法（`require()`），运行时报 `ReferenceError: require is not defined in ES module scope`。

我们已将 `bin/mimo` 从 CJS 转为 ESM（`import` 语法）。**合并上游时如果此文件被覆盖，需重新转换。** 检查方法：

```powershell
Select-String -Path packages/opencode/bin/mimo -Pattern "require\("
# 应有输出 = 仍为 CJS，需要修复；无输出 = 已是 ESM
```

## Git 推送与 husky pre-push hook（已移除）

**`.husky/pre-push` 已被我们删除。** 原因：上游 `packages/app/src/custom-elements.d.ts` 是 symlink，Windows checkout 后变成纯文本文件，`tsgo` 无法解析，导致 `bun turbo typecheck` 必定失败，每次推送都需要 `--no-verify`。**等待上游修复此问题后再恢复 pre-push hook。**

如果从上游合并恢复了 `.husky/pre-push`，再次删除即可：

```powershell
Remove-Item .husky/pre-push -Force
```

## 合并更新时需保留的文件

合并上游更新时，以下文件/目录必须保留。我们的版本可能会被上游覆盖：

| 文件 | 保留原因 |
|------|----------|
| `packages/opencode/src/plugin/mimo-free.ts` | 免费模型认证插件，提供 `opencode` 和 `opencode-go` provider。上游删除了此文件，逻辑移入 `mimo.ts`，但 `mimo.ts` 同时禁用了这两个 provider |
| `packages/opencode/src/plugin/mimo.ts` | 上游新增了禁用 `opencode`/`opencode-go` provider 的逻辑（`disabled_providers`）。**必须移除第 92-100 行的禁用代码**，否则免费模型消失 |
| `packages/opencode/src/plugin/index.ts` | **必须保留 `MimoFreeAuthPlugin` 的导入和注册**。上游会删除此插件的导入（`import { MimoFreeAuthPlugin } from "./mimo-free"`）并从 `INTERNAL_PLUGINS` 数组中移除。如果缺失，免费 `opencode/mimo-v2.5` 模型将不可用。检查方法：`Select-String -Path packages/opencode/src/plugin/index.ts -Pattern "MimoFreeAuthPlugin"` |
| `packages/opencode/src/provider/provider.ts` | **必须保留免费模型过滤逻辑的修改**。上游在 `opencode` provider 的 custom loader 中会删除所有免费模型（`cost.input === 0`）。我们修改为只删除未认证用户的付费模型，保留免费模型。检查方法：`Get-Content packages/opencode/src/provider/provider.ts | Select-String -Pattern "cost.input"` |
| `packages/opencode/src/cli/cmd/tui/context/local.tsx` | 我们保留了"用户手动选择模型优先"逻辑（`hasUserSet`），上游会改成"agent 指定强制覆盖"，行为不同 |
| `packages/opencode/package.json` | 两处修改：① `MIMOCODE_CHANNEL=latest`（上游用 `MIMOCODE_CHANNEL=prod`）；② `version` 跟随上游（当前 `0.1.3`） |
| `packages/opencode/src/provider/transform.ts` | GPT-5.5 + Paper Hub 兼容修复：内置 `openai/gpt-5.5` 走 Responses API；递归 flatten 工具 schema 里的嵌套 `anyOf`/`oneOf`（`task.operation` 会导致 Azure server_error）；OpenAI Responses 的 `itemId` 在 SDK 序列化前移除；保留 encrypted reasoning include 和 `textVerbosity`；`paperhub/gpt-5.5` 仅作为 Chat Completions fallback，跳过 reasoningEffort。**合并上游时除非上游已覆盖这些修复，否则必须保留** |
| `packages/opencode/src/skill/index.ts` | **技能加载竞态修复**：`loadSkills`（约 220 行）去掉 `concurrency: "unbounded"` 改为串行，使 `discoverSkills` 的扫描顺序（compose → 外部 `.claude`/`.agents` → config dirs → `skills.paths`）决定同名技能覆盖优先级——`skills.paths`（用户配置目录）最后扫描、最后 `add`、稳定胜出。`add` 的 duplicate 警告降级为 `log.debug`（约 100 行）。上游若恢复并发加载，同名技能（如 `deep-search`）在 `~/.claude/skills`（C盘）与 `skills.paths`（G盘）间会不确定覆盖，`skills.paths` 不再稳定胜出。检查方法：`Get-Content packages/opencode/src/skill/index.ts \| Select-String -Pattern "concurrency"` 应**无输出**（`Effect.forEach` 默认串行，不传 concurrency） |
| `packages/opencode/test/session/skill-override-e2e.test.ts` | **新增的端到端测试文件**，上游不存在。锁定上述修复：用 `SystemPrompt.skills(agent)` 驱动真实技能加载→系统提示词组装管线，断言 `<available_skills>` 中 `deep-search` 的 `<location>` 指向 `skills.paths` 路径而非 `.claude/skills`。上游合并若删除此文件需从本地恢复 |
| `packages/opencode/test/skill/skill.test.ts` | 含新增单元测试 `skills.paths overrides same-named skill in ~/.claude/skills`（基线无此用例）。上游合并若覆盖该文件需从本地恢复该用例。检查方法：`Select-String -Path packages/opencode/test/skill/skill.test.ts -Pattern "skills.paths overrides"` 应有输出 |
| `packages/opencode/bin/mimo` | **ESM 兼容性**：上游 `type: "module"` 导致 CJS `require()` 报错，已转为 ESM `import` 语法。合并后若被覆盖需重新转换 |
| `packages/opencode/src/util/ssrf.ts` | **SSRF 白名单**：`ALLOWED_HOSTNAMES` 硬编码了 `tc-paperhub.diezhi.net`，并支持 `MIMOCODE_SSRF_ALLOWED_HOSTS` 环境变量追加。上游若覆盖需重新添加。检查方法：`Select-String -Path packages/opencode/src/util/ssrf.ts -Pattern "ALLOWED_HOSTNAMES"` |
| `.husky/pre-push` | **必须保持删除状态**。上游 symlink 问题导致 typecheck 在 Windows 上必定失败，等待上游修复后再恢复 |
| `jf/README.md` | 本文件是我们的目录，上游可能删除整个目录 |

合并后恢复这些文件的命令：

```powershell
git checkout HEAD~1 -- packages/opencode/src/plugin/mimo-free.ts packages/opencode/src/plugin/mimo.ts packages/opencode/src/plugin/index.ts packages/opencode/src/provider/provider.ts packages/opencode/src/cli/cmd/tui/context/local.tsx packages/opencode/package.json packages/opencode/src/provider/transform.ts packages/opencode/src/skill/index.ts jf/README.md
```

如果 `jf/` 目录也被删除了，需要先重建目录：

```powershell
mkdir jf -Force
git checkout HEAD~1 -- packages/opencode/src/plugin/mimo-free.ts packages/opencode/src/plugin/mimo.ts packages/opencode/src/plugin/index.ts packages/opencode/src/provider/provider.ts packages/opencode/src/cli/cmd/tui/context/local.tsx packages/opencode/package.json packages/opencode/src/provider/transform.ts packages/opencode/src/skill/index.ts
git show HEAD~1:jf/README.md > jf/README.md
```

`skill-override-e2e.test.ts` 是新增文件（上游无此文件），若被合并删除需单独恢复：

```powershell
git checkout HEAD~1 -- packages/opencode/test/session/skill-override-e2e.test.ts
```

`skill.test.ts` 含新增的单元测试（基线代码无 `skills.paths overrides` 测试用例），若上游覆盖了该文件需从本地恢复该用例（或合并后重新追加）：

```powershell
git checkout HEAD~1 -- packages/opencode/test/skill/skill.test.ts
```

合并后还需要手动检查：

```powershell
# 检查 mimo.ts 是否有禁用逻辑
Get-Content packages/opencode/src/plugin/mimo.ts | Select-String -Pattern "disabled_providers"

# 检查 index.ts 是否保留了 MimoFreeAuthPlugin
Select-String -Path packages/opencode/src/plugin/index.ts -Pattern "MimoFreeAuthPlugin"

# 检查 provider.ts 是否保留了免费模型过滤逻辑
Get-Content packages/opencode/src/provider/provider.ts | Select-String -Pattern "cost.input"

# 检查 skill/index.ts 是否保持串行加载（应无 concurrency 输出）
# 上游若恢复 concurrency: "unbounded" 会让同名技能覆盖不确定，
# 导致 ~/.claude/skills 下的旧版 deep-search 偶发覆盖 skills.paths 的新版
Get-Content packages/opencode/src/skill/index.ts | Select-String -Pattern "concurrency"
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

## 端到端测试（必选）

**每次合并上游 + 构建完成后，必须执行此测试。测试不通过则不允许提交。**

### 测试命令

```powershell
Set-Location G:\projects\MiMo-Code

# 测试 1: opencode-go provider（免费模型）
& "packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe" run --model opencode-go/mimo-v2.5 "Say hello in one sentence"

# 测试 2: opencode provider（免费模型）
& "packages\opencode\dist\mimocode-windows-x64\bin\mimo.exe" run --model opencode/mimo-v2.5-free "Say hello in one sentence"

# 测试 3: 技能加载竞态修复（skill override 优先级）
Set-Location G:\projects\MiMo-Code\packages\opencode
bun test test/session/skill-override-e2e.test.ts
```

### 预期结果

- 两个测试都返回 LLM 响应（如 `Hello! Welcome to MiMoCode...`）
- 无报错、无崩溃

### 测试原理

验证以下链路完整可用：
1. 构建产物能正常启动
2. `opencode-go` 和 `opencode` provider 能被识别（mimo.ts 未禁用）
3. `MimoFreeAuthPlugin` 已注册（index.ts 包含导入）
4. 免费模型未被过滤（provider.ts 保留 cost.input === 0 的模型）
5. `mimo-v2.5` 模型能获得认证（mimo-free.ts 生效）
6. LLM 请求→响应链路通畅
7. 技能加载串行化生效（skill/index.ts 无 `concurrency: "unbounded"`），`skills.paths` 配置目录的同名技能稳定覆盖 `~/.claude/skills` 下的旧版——`<available_skills>` 中 `<location>` 指向用户配置目录

### 失败排查

| 现象 | 原因 | 修复 |
|------|------|------|
| `model not found` | provider 被禁用 | 检查 mimo.ts 是否有 `disabled_providers` 代码 |
| 免费模型不显示 | MimoFreeAuthPlugin 未注册 | 检查 index.ts 是否有 `MimoFreeAuthPlugin` 导入和注册 |
| 免费模型被过滤 | provider.ts 过滤逻辑 | 检查 provider.ts 的 `cost.input` 过滤逻辑，确保保留免费模型 |
| `401 Unauthorized` | JWT 认证失败 | 检查 mimo-free.ts bootstrap 逻辑 |
| `connection refused` | 网络问题 | 检查防火墙/代理 |
| 无响应/超时 | 模型服务异常 | 等待重试或换模型 |
| e2e 测试失败：`<location>` 指向 `.claude/skills` | skill/index.ts 恢复了并发加载 | 检查 `Select-String -Pattern "concurrency"` 有输出，移除 `concurrency: "unbounded"` 恢复串行 |
