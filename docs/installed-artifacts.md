# Installed artifacts (cleanup notes)

Created: 2026-05-02
Hackathon: Clawathon Tokyo Edition

Records everything **newly installed or created** for this project, in suggested removal order
(bottom-up = dependency reverse).

---

## 1. System-wide

### Homebrew
| Package | Version | Remove |
|---------|---------|--------|
| `deno` | 2.7.14 | `brew uninstall deno` |
| deps: jpeg-turbo, xz, little-cms2, sqlite | — | `brew autoremove` (if unused) |

### npm global
| Package | Version | Remove |
|---------|---------|--------|
| `openclaw` | 2026.4.29 | `npm uninstall -g openclaw` |

### OpenClaw daemon (only if `onboard` was run)
| Item | Path | Remove |
|------|------|--------|
| launchd service | under `~/Library/LaunchAgents/` | `openclaw daemon uninstall`, or unregister via `onboard` |
| state | `~/.openclaw/` | `rm -rf ~/.openclaw` |

---

## 2. User config dirs

| Path | Contents | Remove |
|------|----------|--------|
| `~/.config/jupiter/.env` | `JUPITER_API_KEY` (mode 600) | `rm ~/.config/jupiter/.env && rmdir ~/.config/jupiter` |
| `~/.openclaw/` | OpenClaw state, plugins | `rm -rf ~/.openclaw` |

---

## 3. Claude Code plugin

| Plugin | Scope | Remove |
|--------|-------|--------|
| `integrate-jupiter@jup-ag-skills` | user | `claude plugin uninstall integrate-jupiter@jup-ag-skills` |
| marketplace `jup-ag-skills` | user | `claude plugin marketplace remove jup-ag-skills` |

Verify: `claude plugin list` / `claude plugin marketplace list`

---

## 4. Created inside the project

Removing the repo (`rm -rf clawathon-tokyo-edition`) clears all of these. For reference:

| Path | Notes |
|------|-------|
| `CLAUDE.md` | Project context for Claude Code |
| `docs/hackathon-ideas-jupiter.md` | Idea exploration |
| `docs/demo-script.md` | 3-min demo walkthrough |
| `docs/installed-artifacts.md` | This file |
| `vendor/agent-skills/` | clone of `https://github.com/jup-ag/agent-skills` |
| `vendor/jupiter-agent-handson/` | clone of `https://github.com/posaune0423/jupiter-agent-handson` |
| `prototype/` | Standalone Node project (package.json + node_modules) |
| `prototype/node_modules/` | npm packages: `@solana/web3.js`, `bn.js`, `@jup-ag/lend`, `@jup-ag/lend-read`, etc. (~370) |
| `prototype/smoke-read.mjs` | Jupiter Lend SDK smoke test |
| `prototype/inspect-sdk.mjs`, `inspect-rate.mjs` | Debugging helpers |
| `web/` | Next.js 16 app (Jupiter Funds For Mike's Baby UI) |
| `web/node_modules/` | Next.js + React 19 + Jupiter SDK + `@anthropic-ai/sdk` etc. (~700) |
| `web/.env.local` | symlink → `../.env` (single source of truth) |

---

## 5. Full cleanup (post-hackathon)

```bash
# 1. Rotate the API keys (portal.jup.ag, your Anthropic console, the proxy you used)

# 2. Claude Code plugin
claude plugin uninstall integrate-jupiter@jup-ag-skills
claude plugin marketplace remove jup-ag-skills

# 3. OpenClaw daemon and state (only if you ran onboard)
# openclaw daemon uninstall   # if installed
rm -rf ~/.openclaw

# 4. Global packages
npm uninstall -g openclaw
brew uninstall deno
brew autoremove

# 5. User config
rm ~/.config/jupiter/.env
rmdir ~/.config/jupiter 2>/dev/null

# 6. Project (or just vendor/, prototype/, web/node_modules)
# rm -rf /Users/masashi_mac_ssd/Developer/clawathon-tokyo-edition
```

---

## 6. Things you do NOT need to remove

- Node.js v24.13.0 (pre-existing, unrelated to Jupiter)
- git 2.45.0 (pre-existing)
- brew deps installed alongside deno (jpeg-turbo, xz, sqlite, little-cms2) — used by other things; let `brew autoremove` decide

---

**Note:** The Jupiter API key, the proxy auth token, and the Phantom secret key all touched the chat history. Always rotate them at the end of the hackathon.
