// POST /api/submit-swap
//   body: { signedTxBase64, requestId }
//   proxies to Jupiter Swap v2 /execute (server-side x-api-key required).
//   returns: { signature, ... } from Jupiter

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.JUPITER_API_KEY;

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return Response.json({ error: "JUPITER_API_KEY not set" }, { status: 500 });
  }
  let body: { signedTxBase64?: string; requestId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.signedTxBase64 || !body.requestId) {
    return Response.json({ error: "signedTxBase64, requestId required" }, { status: 400 });
  }

  const res = await fetch("https://api.jup.ag/swap/v2/execute", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      signedTransaction: body.signedTxBase64,
      requestId: body.requestId,
    }),
  });
  const json = await res.json();
  return Response.json(json, { status: res.ok ? 200 : (res.status || 502) });
}
