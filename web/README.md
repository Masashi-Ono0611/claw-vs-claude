# web/ — Claw vs Claude debate UI

Next.js 16 (App Router) + Tailwind. Streams two AI personas debating a Jupiter Yield strategy, lets the user vote, then sends the winning plan onchain.

> See the [project root README](../README.md) for the full overview, demo flow, and verified onchain signatures.

## Local setup

```bash
# from project root, ensure .env exists
ln -sf ../.env .env.local
npm install
npm run dev
# open http://localhost:3000
```

`.env.local` is symlinked to project-root `.env` so secrets live in one place.

## Files

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | Two-column debate UI + wallet adapter + sign/submit flow |
| `src/app/api/debate/route.ts` | SSE: spawns 2 personas in parallel, streams every text/tool event |
| `src/app/api/build-tx/route.ts` | POST: builds an unsigned tx for the chosen plan (Jupiter Swap order or `@jup-ag/lend` ixs) |
| `src/app/api/submit-swap/route.ts` | POST: proxy of signed swap → Jupiter `/swap/v2/execute` (server-side x-api-key) |
| `src/components/WalletProviders.tsx` | `ConnectionProvider` + `WalletProvider` + modal styles |
| `src/lib/debate.mjs` | Persona definitions + `runPersonaDebate()` orchestrator |
| `src/lib/jupiter.mjs` | Jupiter helpers (mirror of `prototype/lib/jupiter.mjs`) |
| `next.config.ts` | `serverExternalPackages` for Jupiter SDK + `@coral-xyz/anchor` (Turbopack ESM workaround) |

## Required env vars

Loaded from project-root `.env` via the symlink.

| Var | For | Required |
|---|---|---|
| `ANTHROPIC_BASE_URL` | Anthropic SDK / proxy URL | ✅ |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token | ✅ |
| `ANTHROPIC_MODEL` | model id (default `claude-opus-4-7`) | – |
| `JUPITER_API_KEY` | Swap v2 (read + execute) | ✅ |
| `SOLANA_RPC` | RPC URL | ✅ |
| `SOLANA_WALLET` | wallet pubkey | ✅ |
| `SOLANA_pk` | Not used by the web app — signing is done by the visitor's wallet | ❌ never set on Vercel |

## Deploy notes (Vercel)

- Set the env vars listed above (except `SOLANA_pk`)
- Visitors connect their own wallets; the server never holds a signing key
- Build runs as Node (route handlers use Node native modules via `serverExternalPackages`)
