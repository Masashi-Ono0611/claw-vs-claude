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
| `src/app/page.tsx` | Two-column debate UI with SSE consumer + vote buttons |
| `src/app/api/debate/route.ts` | SSE: spawns 2 personas in parallel, streams every text/tool event |
| `src/app/api/execute/route.ts` | POST `{plan}`: signs + sends onchain (or returns demo response if no `SOLANA_pk`) |
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
| `SOLANA_pk` | Base58 secret key for signing | optional (omit for read-only public deploy) |

## Deploy notes (Vercel)

- Set all env vars **except `SOLANA_pk`** for public deploy → `/api/execute` returns "Public Demo Mode" instead of signing
- Set `SOLANA_pk` only for trusted/private deployments
- Build runs as Node (route handlers use Node native modules via `serverExternalPackages`)
