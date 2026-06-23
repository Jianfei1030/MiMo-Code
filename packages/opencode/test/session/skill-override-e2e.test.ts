// End-to-end verification of the skill-override contract.
//
// Drives the REAL skill-loading + system-prompt assembly pipeline
// (SystemPrompt.skills → Skill.available → Skill.fmt) — the exact code path that
// builds the <available_skills> block sent to the LLM — and asserts that
// `deep-search`'s <location> points at the user-configured skills.paths
// directory, NOT the stale copy under .claude/skills.
//
// This locks the fix in src/skill/index.ts: loadSkills MUST run serially so
// discoverSkills' scan order (external .claude/ → config dirs → skills.paths)
// determines which same-named skill wins. With the old concurrency: "unbounded"
// the winner was non-deterministic (async file-read completion order), so
// ~/.claude/skills/<name> sometimes beat skills.paths/<name>.
//
// Why this and not a full runLoop LLM round-trip: SystemPrompt.skills() is the
// injection point (system.ts:71) — the string it returns is verbatim what the
// LLM receives in the system message. Asserting on its output is therefore an
// end-to-end check of "what the LLM is told about deep-search's location". A
// full runLoop adds LLM-call plumbing (ensureRunning, classify, tool routing)
// that is orthogonal to skill resolution and flaky under the test harness.
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import path from "path"
import * as fs from "fs/promises"
import { Config } from "../../src/config"
import { LLM } from "../../src/session/llm"
import { Session } from "../../src/session"
import { SystemPrompt } from "../../src/session/system"
import type { Agent } from "../../src/agent/agent"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Provider as ProviderSvc } from "../../src/provider"
import { Env } from "../../src/env"
import { Plugin } from "../../src/plugin"
import { Permission } from "../../src/permission"
import { Command } from "../../src/command"
import { MCP } from "../../src/mcp"
import { LSP } from "../../src/lsp"
import { AppFileSystem } from "@mimo-ai/shared/filesystem"
import { Bus } from "../../src/bus"
import { Memory } from "../../src/memory"
import { History } from "../../src/history"
import { Log } from "../../src/util"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

void Log.init({ print: false })

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth"),
    authenticate: () => Effect.die("unexpected MCP auth"),
    finishAuth: () => Effect.die("unexpected MCP auth"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

const layer = Layer.mergeAll(
  Session.defaultLayer,
  LLM.defaultLayer,
  Env.defaultLayer,
  AgentSvc.defaultLayer,
  Command.defaultLayer,
  Permission.defaultLayer,
  Plugin.defaultLayer,
  Config.defaultLayer,
  ProviderSvc.defaultLayer,
  lsp,
  mcp,
  AppFileSystem.defaultLayer,
  SystemPrompt.defaultLayer,
  Bus.layer,
  Memory.defaultLayer,
  History.defaultLayer,
).pipe(Layer.provideMerge(infra))

const it = testEffect(layer)

const SKILL_MD_STALE = `---
name: deep-search
description: stale claude version
---

# stale
`

const SKILL_MD_FRESH = `---
name: deep-search
description: fresh user version
---

# fresh
`

function makeAgent(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  } satisfies Agent.Info
}

describe("skill override e2e", () => {
  it.live(
    "available_skills <location> for deep-search reflects skills.paths, not .claude/skills",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            // Stale version under .claude/skills (project-local external scan,
            // EARLY in discoverSkills scan order → lower priority).
            const claudeSkillDir = path.join(dir, ".claude", "skills", "deep-search")
            yield* Effect.promise(() => fs.mkdir(claudeSkillDir, { recursive: true }))
            yield* Effect.promise(() => Bun.write(path.join(claudeSkillDir, "SKILL.md"), SKILL_MD_STALE))

            // Fresh version under a user-configured skills.paths dir (scanned
            // LAST in discoverSkills → highest priority → must win).
            const userSkillRoot = path.join(dir, "user-skills")
            const userSkillDir = path.join(userSkillRoot, "deep-search")
            yield* Effect.promise(() => fs.mkdir(userSkillDir, { recursive: true }))
            yield* Effect.promise(() => Bun.write(path.join(userSkillDir, "SKILL.md"), SKILL_MD_FRESH))

            const sys = yield* SystemPrompt.Service

            // SystemPrompt.skills(agent) is the exact injection point that
            // builds the <available_skills> block sent to the LLM (system.ts:71).
            const block = yield* sys.skills(makeAgent())
            expect(block).toBeDefined()
            const text = block ?? ""

            // The available_skills block is present and lists deep-search.
            expect(text).toContain("<available_skills>")
            expect(text).toContain("<name>deep-search</name>")

            // The <location> for deep-search must point at the user-configured
            // skills.paths dir (fresh version), NOT the stale .claude copy.
            // Use forward-slash segments because <location> is a file:// URL
            // (pathToFileURL) — path.join would emit backslashes on Windows.
            expect(text).toContain("user-skills/deep-search/SKILL.md")
            expect(text).not.toContain(".claude/skills/deep-search")
            expect(text).toContain("fresh user version")
            expect(text).not.toContain("stale claude version")
          }),
        {
          git: true,
          config: {
            ...cfg,
            skills: { paths: ["./user-skills"] },
          } as any,
        },
      ),
    60_000,
  )
})
