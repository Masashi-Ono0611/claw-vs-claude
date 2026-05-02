// POST /api/build-tx
//   body: { plan: { kind, asset?, inputSym?, outputSym?, amountUi }, walletPubkey: string }
//   returns:
//     - swap kind:    { kind, txBase64, requestId, quote }
//     - lend_*:       { kind, txBase64 }
//     - no_action:    { kind: "no_action", note }
//
// クライアントは txBase64 を deserialize → wallet adapter で sign →
//   - swap → POST /api/submit-swap (Jupiter Swap v2 /execute は x-api-key 必須)
//   - lend_* → 直接 connection.sendRawTransaction (RPC は public)

import { NextRequest } from "next/server";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getDepositIxs, getWithdrawIxs } from "@jup-ag/lend/earn";
import {
  resolveToken,
  uiToBase,
  baseToUi,
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

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const API_KEY = process.env.JUPITER_API_KEY;

export async function POST(req: NextRequest) {
  let body: { plan?: Plan; walletPubkey?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const plan = body.plan;
  const walletStr = body.walletPubkey;
  if (!plan?.kind) return Response.json({ error: "missing plan.kind" }, { status: 400 });
  if (!walletStr) return Response.json({ error: "missing walletPubkey" }, { status: 400 });

  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(walletStr);
  } catch {
    return Response.json({ error: "invalid walletPubkey" }, { status: 400 });
  }

  if (plan.kind === "no_action") {
    return Response.json({ kind: "no_action", note: "agent decided to do nothing" });
  }

  const connection = new Connection(RPC, { commitment: "confirmed" });

  try {
    if (plan.kind === "swap") {
      if (!API_KEY) return Response.json({ error: "JUPITER_API_KEY not set on server" }, { status: 500 });
      if (!plan.inputSym || !plan.outputSym || !plan.amountUi)
        return Response.json({ error: "swap requires inputSym, outputSym, amountUi" }, { status: 400 });
      const inT = resolveToken(plan.inputSym);
      const outT = resolveToken(plan.outputSym);
      const amountBase = uiToBase(plan.amountUi, inT.decimals).toString();

      const url = new URL("https://api.jup.ag/swap/v2/order");
      url.searchParams.set("inputMint", inT.mint);
      url.searchParams.set("outputMint", outT.mint);
      url.searchParams.set("amount", amountBase);
      url.searchParams.set("taker", walletPk.toString());
      url.searchParams.set("slippageBps", "100");

      const orderRes = await fetch(url, { headers: { "x-api-key": API_KEY } });
      if (!orderRes.ok) {
        const t = await orderRes.text();
        return Response.json({ error: `Jupiter order HTTP ${orderRes.status}: ${t.slice(0, 200)}` }, { status: 502 });
      }
      const order = await orderRes.json();
      if (order.errorCode) {
        return Response.json({ error: `Jupiter order errorCode=${order.errorCode}: ${order.errorMessage ?? order.error}` }, { status: 502 });
      }

      return Response.json({
        kind: "swap",
        txBase64: order.transaction,
        requestId: order.requestId,
        quote: {
          inAmountUi: plan.amountUi,
          outAmountUi: baseToUi(order.outAmount, outT.decimals),
          inputSym: inT.symbol,
          outputSym: outT.symbol,
          router: order.router,
          gasless: order.gasless,
          priceImpactPct: order.priceImpactPct,
        },
      });
    }

    if (plan.kind === "lend_deposit" || plan.kind === "lend_withdraw") {
      if (!plan.asset || !plan.amountUi)
        return Response.json({ error: `${plan.kind} requires asset, amountUi` }, { status: 400 });
      const tok = resolveToken(plan.asset);
      const builder = plan.kind === "lend_deposit" ? getDepositIxs : getWithdrawIxs;
      const amountBase = uiToBase(plan.amountUi, tok.decimals).toString();
      // SDKの返り型は ixs のみだが実体には ALT も入っている。
      const result = (await builder({
        amount: new BN(amountBase),
        asset: new PublicKey(tok.mint),
        signer: walletPk,
        connection,
      })) as {
        ixs: TransactionInstruction[];
        addressLookupTableAccounts?: AddressLookupTableAccount[];
      };
      const ixs = result.ixs;
      const addressLookupTableAccounts = result.addressLookupTableAccounts ?? [];
      if (!ixs?.length) return Response.json({ error: "SDK returned no instructions" }, { status: 500 });

      const latestBlockhash = await connection.getLatestBlockhash();
      const message = new TransactionMessage({
        payerKey: walletPk,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: ixs,
      }).compileToV0Message(addressLookupTableAccounts);

      const tx = new VersionedTransaction(message);
      // 未署名でも serialize はできる (signatures は空スロットのまま)
      const txBase64 = Buffer.from(tx.serialize()).toString("base64");

      return Response.json({
        kind: plan.kind,
        txBase64,
        latestBlockhash, // client uses for confirmTransaction
        meta: { asset: tok.symbol, amountUi: plan.amountUi },
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
