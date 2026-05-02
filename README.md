# Jupiter Funds For Mike's Baby 👶🎁

> A pre-baby celebration. Two AI agents (🤖 Claude + 🦞 Claw) debate the best
> Jupiter yield move; you vote; the winning gift is sent **onchain** to grow
> the fund for Jupiter teammate Mike's incoming baby.

🏆 **Jupiter Prize — 1st Winner** at [Clawathon Tokyo Edition](https://app.akindo.io/wave-hacks/eaKEp9dxBH8JwEErg) (2026-05-02).

📦 **Repo**: <https://github.com/Masashi-Ono0611/claw-vs-claude>
🪪 **Product page (Akindo)**: <https://app.akindo.io/communities/janA9g18qU63eJvB/products/63ZnGOzxnh7PBME8>

> The public Vercel deploy was taken down after the hackathon. Run locally with the steps below.

---

## What this is

The hackathon ask: **integrate AI "reasoning" with blockchain "execution" so an agent can complete a task with no human in the loop.**

This project answers it with the smallest interesting unit of "agent disagreement", wrapped in a heartful frame: **pre-celebrating Jupiter teammate Mike's incoming baby with onchain Solana yield**.

1. You ask the council a free-form question (default: *"What's the next gentle move to grow Mike's baby fund?"*).
2. **Two personas of Claude** are spun up in parallel via the Anthropic SDK:
   - 🤖 **Claude** — calm, data-driven, includes comparisons like *"$X gain ≈ Y diapers"*
   - 🦞 **Claw** — kansai-ben lobster cosplaying as OpenClaw, *"this'll turn into a stroller!"*
3. Both must call `get_wallet_balances` first (so they propose realistic amounts), then any of `get_jltoken_apys`, `get_lend_position`, `get_swap_quote`, and finally `propose_action` with a confidence score.
4. The UI streams both thoughts side-by-side via SSE.
5. You **connect your own Solana wallet** (Phantom / Solflare / Backpack via wallet-standard auto-discovery) and click **💝 Sponsor with Claude / Claw** on the proposal you like.
6. The server builds an **unsigned** transaction (Jupiter Swap v2 order or `@jup-ag/lend` instructions).
7. Your wallet signs locally; the signed tx is submitted (Jupiter `/swap/v2/execute` for swap, direct RPC for lend).
8. "🎉 Gift delivered onchain!" + Solscan signature.

**No server-side wallet keys.** Every gift is signed by the visitor's own wallet.

See the [demo script](./docs/demo-script.md) for the 3-minute walkthrough.

---

## Repo layout

```
.
├── web/             — Next.js 16 app (the public council UI)
│   ├── src/app/
│   │   ├── page.tsx                     UI + wallet adapter + sign/submit flow
│   │   ├── api/debate/route.ts          SSE: 2 agents in parallel
│   │   ├── api/build-tx/route.ts        POST: build unsigned tx for the chosen plan
│   │   └── api/submit-swap/route.ts     POST: proxy signed swap to Jupiter /execute
│   ├── src/components/
│   │   └── WalletProviders.tsx          ConnectionProvider + WalletProvider
│   └── src/lib/
│       ├── debate.mjs                   2 personas + tool dispatcher
│       └── jupiter.mjs                  Jupiter helpers (mirror of prototype/)
│
├── prototype/       — Standalone CLI scripts (no web; for dev / smoke tests)
│   ├── agent.mjs                        LLM agent with --allow-write gate
│   ├── swap-once.mjs                    Jupiter Swap v2 CLI
│   ├── lend-once.mjs                    Jupiter Lend (Earn) CLI
│   ├── verify-keypair.mjs               Pubkey check (no secret echoed)
│   └── lib/jupiter.mjs                  Source of truth for helpers
│
└── docs/
    ├── hackathon-ideas-jupiter.md       initial idea exploration
    ├── demo-script.md                   3-minute demo walkthrough
    └── installed-artifacts.md           cleanup notes
```

---

## Run locally

```bash
# 1. Clone
git clone https://github.com/Masashi-Ono0611/claw-vs-claude.git
cd claw-vs-claude

# 2. Configure secrets at project root (the web app reads from here via symlink)
cat > .env <<'EOF'
ANTHROPIC_BASE_URL=https://api.anthropic.com         # or your Anthropic-compatible proxy
ANTHROPIC_AUTH_TOKEN=sk-ant-...                      # Bearer token
ANTHROPIC_MODEL=claude-sonnet-4-6
JUPITER_API_KEY=jup_...                              # portal.jup.ag
SOLANA_RPC=https://api.mainnet-beta.solana.com       # or Helius/QuickNode for higher RPS
SOLANA_WALLET=YourWalletPublicKey                    # used by prototype CLIs
SOLANA_pk=YourBase58SecretKey                        # used by prototype CLIs ONLY (Phantom export)
TEST_MAX_AMOUNT_UI=0.1                               # optional: cap proposals during local testing
EOF
chmod 600 .env

# 3. Web app
cd web
npm install
ln -sf ../.env .env.local
npm run dev
# → http://localhost:3000  (connect your wallet, ask the council)

# 4. (Optional) standalone CLI
cd ../prototype
npm install
node verify-keypair.mjs               # confirms keypair derives expected pubkey (rejects if mismatch)
node smoke-read.mjs                    # APY ranking smoke test
node agent.mjs --allow-write "deposit 0.1 USDC into lend"
```

> The web app **never reads `SOLANA_pk`** — it's only used by the standalone `prototype/` CLI scripts. The web app always uses the visitor's connected wallet.

---

## Tech stack

```
┌─────────────────────────────────────────────┐
│  Anthropic Claude (claude-sonnet-4-6)       │
│  └ tool_use loop ⨉ 2 personas in parallel   │
├─────────────────────────────────────────────┤
│  Next.js 16 (App Router) + Tailwind         │
│  └ /api/debate (SSE)                        │
│  └ /api/build-tx (POST, unsigned tx)        │
│  └ /api/submit-swap (POST, signed → Jupiter)│
├─────────────────────────────────────────────┤
│  @solana/wallet-adapter-react (BYOWallet)   │
│  └ Phantom / Solflare / Backpack (auto)     │
├─────────────────────────────────────────────┤
│  Jupiter Swap v2 REST + Lend Read/Write SDK │
│  └ @jup-ag/lend, @jup-ag/lend-read          │
├─────────────────────────────────────────────┤
│  @solana/web3.js + bs58                     │
└─────────────────────────────────────────────┘
```

Influences:
- [`jup-ag/agent-skills`](https://github.com/jup-ag/agent-skills) — Jupiter Agent Skills (`integrate-jupiter` plugin) installed in our Claude Code dev loop
- [`openclaw/openclaw`](https://github.com/openclaw/openclaw) — workspace concept + 🦞 mascot energy

---

## Verified mainnet transactions (during build)

| Action | Signature |
|--------|-----------|
| Swap USDC→SOL | [3TVQybRp...](https://solscan.io/tx/3TVQybRpX5XXWnQzXijJcsgE9g3KTGApaZcZcinTSQyi7eEpYX8v5vJaTiZ7e3FfEJXe5HZz3vbhGHpu9yde8Jtq) |
| Lend deposit (CLI, server-signed) | [3fQgGv7x...](https://solscan.io/tx/3fQgGv7xF5juuUVGqw73C3PDrMGrJZSHcQtqT1kFwM59TuXPGo4FqsamhiR8p4UYSgcoJJubrwZjcDq2qDjwGGku) |
| Lend withdraw (LLM-driven, CLI) | [rsmms53f...](https://solscan.io/tx/rsmms53fFD3VPGmF9F6ZDw8e8EEZmd5Euny8zBBmDXYDPucTGo7qk8NgtSeGP3Ez7Bm1iVQsqqPUF14BwDT17sv) |

---

## With love

A small, sincere gift to **Mike & family** at Jupiter — built in one day,
signed onchain, runs on real money. May your baby grow up watching the value
of yielded SOL go up. 🌱

---

## License

MIT.
