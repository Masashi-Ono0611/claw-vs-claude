# Claw vs Claude · Yield Council

> 🤖 **CLAUDE** vs **CLAW 🦞** — two AI agents debate a Jupiter Yield strategy in parallel.
> The user votes. The winner sends a real onchain transaction on Solana mainnet.

Built for **Clawathon Tokyo Edition** (2026-05-02).

> ⚠️ App name is a working title — feel free to suggest a better one.

---

## What this is

The hackathon ask: **AIの「思考」とブロックチェーンの「執行」を統合し、人間の介在なしにタスクを完結させる**.

This project answers it with the smallest interesting unit of "agent disagreement":

1. The user asks a free-form question (e.g. *"yieldを最大化する次の1手を提案して"*).
2. **Two personas of Claude** are spun up in parallel via the Anthropic SDK:
   - 🤖 **Claude** — calm, data-driven, English-mixed
   - 🦞 **Claw** — kansai-ben lobster cosplaying as OpenClaw, "EXFOLIATE!" energy
3. Both call the same Jupiter tools (`get_jltoken_apys`, `get_lend_position`, `get_swap_quote`) and produce a `propose_action` plan with confidence.
4. The UI streams both thoughts side-by-side via SSE.
5. The user clicks **VOTE** on the winning plan.
6. The server signs and sends the transaction via Jupiter Swap v2 / `@jup-ag/lend`.
7. Solscan signature returned.

Read the [demo script](./docs/demo-script.md) for the 3-minute walkthrough.

---

## Repo layout

```
.
├── web/             — Next.js 16 app (Claw vs Claude UI)
│   ├── src/app/
│   │   ├── page.tsx                     UI
│   │   ├── api/debate/route.ts          SSE: 2 agents in parallel
│   │   └── api/execute/route.ts         POST: winner's plan onchain
│   └── src/lib/
│       ├── debate.mjs                   2 personas + tool dispatcher
│       └── jupiter.mjs                  Jupiter helpers (copied from prototype)
│
├── prototype/       — Standalone CLI scripts (no web)
│   ├── agent.mjs                        LLM agent with --allow-write gate
│   ├── swap-once.mjs                    Jupiter Swap v2 CLI
│   ├── lend-once.mjs                    Jupiter Lend (Earn) CLI
│   ├── verify-keypair.mjs               Pubkey check (no secret echoed)
│   └── lib/jupiter.mjs                  Source of truth for helpers
│
└── docs/
    ├── hackathon-ideas-jupiter.md       原案アイデア整理
    ├── demo-script.md                   3-minute demo walkthrough
    └── installed-artifacts.md           cleanup notes
```

---

## Run locally (full execution)

```bash
# 1. Clone
git clone https://github.com/<owner>/claw-vs-claude.git
cd claw-vs-claude

# 2. Configure secrets at project root
cat > .env <<'EOF'
ANTHROPIC_BASE_URL=https://api.anthropic.com         # or your Anthropic-compatible proxy
ANTHROPIC_AUTH_TOKEN=sk-ant-...                      # Bearer token
ANTHROPIC_MODEL=claude-opus-4-7
JUPITER_API_KEY=jup_...                              # portal.jup.ag
SOLANA_RPC=https://api.mainnet-beta.solana.com       # or Helius/QuickNode for higher RPS
SOLANA_WALLET=YourWalletPublicKey
SOLANA_pk=YourBase58SecretKey                        # Phantom export (64-byte)
EOF
chmod 600 .env

# 3. Web app
cd web
npm install
ln -sf ../.env .env.local
npm run dev
# → http://localhost:3000

# 4. (Optional) standalone CLI
cd ../prototype
npm install
node verify-keypair.mjs               # confirms keypair derives expected pubkey
node smoke-read.mjs                    # APY ranking smoke test
node agent.mjs --allow-write "0.1 USDCをlendに入れて"
```

---

## Public demo (read-only)

The Vercel deploy intentionally **does not** include `SOLANA_pk`, so:

- ✅ Debate streams in real time
- ✅ Both agents produce real proposals (real Jupiter API calls)
- ✅ VOTE → server returns "Public Demo Mode" notice instead of executing
- ❌ No real transaction is sent (this is by design — anyone could drain the wallet)

To see real onchain execution, **clone the repo and run locally** with your own wallet.

---

## Tech stack

```
┌─────────────────────────────────────────────┐
│  Anthropic Claude (claude-opus-4-7)         │
│  └ tool_use loop ⨉ 2 personas in parallel   │
├─────────────────────────────────────────────┤
│  Next.js 16 (App Router) + Tailwind         │
│  └ /api/debate (SSE) + /api/execute (POST)  │
├─────────────────────────────────────────────┤
│  Jupiter Swap v2 REST + Lend Read/Write SDK │
│  └ @jup-ag/lend, @jup-ag/lend-read          │
├─────────────────────────────────────────────┤
│  @solana/web3.js + bs58 (signing)           │
└─────────────────────────────────────────────┘
```

Influences:
- [`jup-ag/agent-skills`](https://github.com/jup-ag/agent-skills) — Jupiter Agent Skills (`integrate-jupiter` plugin) installed in our Claude Code dev loop
- [`openclaw/openclaw`](https://github.com/openclaw/openclaw) — workspace concept + 🦞 mascot energy

---

## Verified mainnet transactions

| Action | Signature |
|--------|-----------|
| Swap USDC→SOL | [3TVQybRp...](https://solscan.io/tx/3TVQybRpX5XXWnQzXijJcsgE9g3KTGApaZcZcinTSQyi7eEpYX8v5vJaTiZ7e3FfEJXe5HZz3vbhGHpu9yde8Jtq) |
| Lend deposit (CLI) | [3fQgGv7x...](https://solscan.io/tx/3fQgGv7xF5juuUVGqw73C3PDrMGrJZSHcQtqT1kFwM59TuXPGo4FqsamhiR8p4UYSgcoJJubrwZjcDq2qDjwGGku) |
| Lend withdraw (LLM) | [rsmms53f...](https://solscan.io/tx/rsmms53fFD3VPGmF9F6ZDw8e8EEZmd5Euny8zBBmDXYDPucTGo7qk8NgtSeGP3Ez7Bm1iVQsqqPUF14BwDT17sv) |

---

## License

MIT.
