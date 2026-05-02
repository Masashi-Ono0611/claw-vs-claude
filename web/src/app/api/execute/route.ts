// POST /api/execute — receives a winning plan from the UI and executes onchain.
// Body: { plan: { kind, asset?, inputSym?, outputSym?, amountUi, ... } }

import { NextRequest } from "next/server";
import { Connection } from "@solana/web3.js";
import {
  resolveToken,
  loadKeypair,
  executeSwap,
  executeLend,
  uiToBase,
} from "../../../lib/jupiter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Plan {
  kind: "swap" | "lend_deposit" | "lend_withdraw" | "no_action";
  asset?: string;
  inputSym?: string;
  outputSym?: string;
  amountUi?: number;
}

export async function POST(req: NextRequest) {
  let body: { plan?: Plan };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const plan = body.plan;
  if (!plan?.kind) return Response.json({ error: "missing plan.kind" }, { status: 400 });

  const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  const API_KEY = process.env.JUPITER_API_KEY;
  const SOL_PK = process.env.SOLANA_pk;
  const WALLET = process.env.SOLANA_WALLET;

  if (!SOL_PK || !WALLET) {
    return Response.json(
      { error: "SOLANA_pk / SOLANA_WALLET not configured on server" },
      { status: 500 },
    );
  }

  const connection = new Connection(RPC, { commitment: "confirmed" });
  let keypair;
  try {
    keypair = loadKeypair(SOL_PK, WALLET);
  } catch (e: unknown) {
    return Response.json(
      { error: `keypair load failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  try {
    if (plan.kind === "no_action") {
      return Response.json({ ok: true, kind: "no_action", note: "agent decided to do nothing" });
    }

    if (plan.kind === "swap") {
      if (!plan.inputSym || !plan.outputSym || !plan.amountUi)
        return Response.json({ error: "swap requires inputSym, outputSym, amountUi" }, { status: 400 });
      const inT = resolveToken(plan.inputSym);
      const outT = resolveToken(plan.outputSym);
      const r = await executeSwap({
        apiKey: API_KEY,
        connection,
        keypair,
        inputMint: inT.mint,
        outputMint: outT.mint,
        amountBase: uiToBase(plan.amountUi, inT.decimals),
        slippageBps: 100,
      });
      return Response.json({
        ok: true,
        kind: "swap",
        signature: r.execute?.signature,
        quote: r.quote,
      });
    }

    if (plan.kind === "lend_deposit" || plan.kind === "lend_withdraw") {
      const action = plan.kind === "lend_deposit" ? "deposit" : "withdraw";
      if (!plan.asset || !plan.amountUi)
        return Response.json({ error: `${plan.kind} requires asset, amountUi` }, { status: 400 });
      const tok = resolveToken(plan.asset);
      const r = await executeLend({
        connection,
        keypair,
        action,
        assetMint: tok.mint,
        amountBase: uiToBase(plan.amountUi, tok.decimals),
      });
      return Response.json({
        ok: true,
        kind: plan.kind,
        asset: tok.symbol,
        amountUi: plan.amountUi,
        signature: r.signature,
      });
    }

    return Response.json({ error: `unknown plan.kind: ${plan.kind}` }, { status: 400 });
  } catch (e: unknown) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
