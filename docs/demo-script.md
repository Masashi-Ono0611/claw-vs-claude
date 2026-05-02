# Demo Script — Jupiter Funds For Mike's Baby 👶🎁

Clawathon Tokyo Edition submission demo. Target: **3 minutes**.

---

## 0. Pitch (15s)

> Two AI agents — Claude 🤖 and Claw 🦞 — debate the best Jupiter yield move on Solana mainnet. You vote on the proposal you like, your own wallet signs it, the gift lands onchain. The whole thing is wrapped as a pre-baby celebration for Jupiter teammate **Mike** — every transaction grows the fund for his incoming baby.

**Why it lands**:
- ✅ Jupiter Agent Skills (`integrate-jupiter`) installed in Claude Code dev loop
- ✅ Real Jupiter Swap v2 + Lend (Earn) execution on mainnet
- ✅ JupiterZ gasless route used heavily
- ✅ BYOWallet — server holds no key, anyone can run the live demo safely
- ✅ Heartful frame: a real teammate, real upcoming baby, real onchain gifts

---

## 1. Environment

| Item | Value |
|------|-------|
| Live demo | https://claw-vs-claude.vercel.app |
| Source | https://github.com/Masashi-Ono0611/claw-vs-claude |
| Network | Solana mainnet-beta |
| Model | `claude-sonnet-4-6` (via proxy) |

---

## 2. Live walkthrough (3 stages, ~150s)

### Stage 1 — Connect & Ask (30s)
1. Open the URL — pastel hero, "👶 Jupiter Funds For Mike's Baby 🎁"
2. Click **Connect Wallet** → Phantom (or Solflare/Backpack)
3. Click **💝 ASK THE COUNCIL**
4. Talk over: *"Two Claudes wake up at the same time. Same tools, opposite personalities."*

### Stage 2 — Watch the debate (60s)
1. Both columns stream:
   - 🤖 Claude (mint) — calm, "$X gain ≈ Y diapers"
   - 🦞 Claw (coral) — kansai-ben, "ベビーカー代に化けるで!"
2. Each calls `get_wallet_balances` first → sees real holdings
3. Each ends with a `propose_action` card (kind / amount / rationale / confidence)
4. Talk over: *"They're not just text — every tool call is a real Jupiter API hit. The amount they propose is bounded by my actual wallet."*

### Stage 3 — Vote & Sign (60s)
1. Click **💝 Sponsor with Claude** (or Claw)
2. Phantom popup → sign
3. "🎉 Gift delivered onchain!" + Solscan link
4. Click the link, show the real tx on Solscan
5. Talk over: *"No server-side key. My wallet signed. The gift is now on Mike's family fund."*

---

## 3. Optional B-roll

- `node prototype/swap-once.mjs --in USDC --out SOL --amount 0.1 --execute`
- `node prototype/lend-once.mjs --asset USDC --amount 0.1 --execute`
- `node prototype/agent.mjs --allow-write "deposit 0.1 USDC into lend"`

These show the same primitives running headlessly — useful if the live web demo hits an RPC blip.

---

## 4. Tech stack one-liner

> "Anthropic Claude (sonnet-4-6) + Jupiter Agent Skills + Next.js 16 + Solana wallet adapters. Server proposes unsigned tx, your wallet signs, Jupiter `/execute` lands it. ~700 lines of TypeScript and one .env."

---

## 5. Why it should win

**Jupiter Prize** (Agent Skills + swap activation):
- ✅ `jup-ag/agent-skills` formally installed via `claude plugin install`
- ✅ Swap v2 (gasless route) + Lend (deposit/withdraw) both exercised
- ✅ Skills inform every tool we hand to the LLM

**Best Overall** (no human in the loop):
- ✅ Natural-language input → mainnet write in one motion
- ✅ Two-agent council pattern is novel — "decisions you can audit"
- ✅ Heartful frame turns a DeFi demo into a story people remember

---

## 6. Verified transactions during build

| Action | Signature |
|--------|-----------|
| Swap USDC→SOL | https://solscan.io/tx/3TVQybRpX5XXWnQzXijJcsgE9g3KTGApaZcZcinTSQyi7eEpYX8v5vJaTiZ7e3FfEJXe5HZz3vbhGHpu9yde8Jtq |
| Lend deposit | https://solscan.io/tx/3fQgGv7xF5juuUVGqw73C3PDrMGrJZSHcQtqT1kFwM59TuXPGo4FqsamhiR8p4UYSgcoJJubrwZjcDq2qDjwGGku |
| Lend withdraw (LLM) | https://solscan.io/tx/rsmms53fFD3VPGmF9F6ZDw8e8EEZmd5Euny8zBBmDXYDPucTGo7qk8NgtSeGP3Ez7Bm1iVQsqqPUF14BwDT17sv |
