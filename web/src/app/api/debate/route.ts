// SSE endpoint: streams 2 personas (Claude + Claw) thinking in parallel.
// Client connects via EventSource. Each event has `data: <json>\n\n`.

import { NextRequest } from "next/server";
import { runPersonaDebate } from "../../../lib/debate.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const question = url.searchParams.get("q");
  if (!question) {
    return new Response("missing ?q", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "start", question, ts: Date.now() });

      try {
        // 2 personas in parallel; each streams events as they happen.
        const results = await Promise.allSettled([
          runPersonaDebate({
            persona: "claude",
            question,
            onEvent: send,
          }),
          runPersonaDebate({
            persona: "claw",
            question,
            onEvent: send,
          }),
        ]);

        for (const r of results) {
          if (r.status === "rejected") {
            send({
              type: "error",
              message: String(r.reason?.message ?? r.reason),
            });
          }
        }

        send({ type: "done", ts: Date.now() });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
