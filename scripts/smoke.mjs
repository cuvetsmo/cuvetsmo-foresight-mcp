#!/usr/bin/env node
/**
 * Smoke test — spawns dist/server.js, sends ListTools + a few CallTool
 * requests over stdio JSON-RPC, asserts the responses are well-shaped.
 *
 * Exit 0 if every assertion passes; exit 1 with the failing assertion if not.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "server.js");

let nextId = 1;
function makeRequest(method, params) {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
});

const responses = new Map();
let buffer = "";

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null) responses.set(msg.id, msg);
    } catch {
      // ignore non-JSON noise
    }
  }
});

function send(req) {
  server.stdin.write(JSON.stringify(req) + "\n");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${req.method}`)), 5000);
    const tick = setInterval(() => {
      const r = responses.get(req.id);
      if (r) {
        clearInterval(tick);
        clearTimeout(timer);
        resolve(r);
      }
    }, 25);
  });
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    server.kill();
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

(async () => {
  // 1. initialize
  const init = await send(
    makeRequest("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0" },
    }),
  );
  assert(init.result?.serverInfo?.name === "foresight", "initialize returns server name 'foresight'");

  // 2. notify initialized
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // 3. list tools
  const list = await send(makeRequest("tools/list", {}));
  const toolNames = list.result?.tools?.map((t) => t.name) ?? [];
  assert(toolNames.length === 6, `tools/list returns 6 tools (got ${toolNames.length}: ${toolNames.join(", ")})`);
  for (const expected of [
    "foresight_list_markets",
    "foresight_get_market",
    "foresight_propose_market",
    "foresight_resolve_check",
    "foresight_stream_events",
    "foresight_cross_venue",
  ]) {
    assert(toolNames.includes(expected), `tools/list includes ${expected}`);
  }

  // 4. call foresight_list_markets — no args
  const lm = await send(
    makeRequest("tools/call", { name: "foresight_list_markets", arguments: {} }),
  );
  const lmData = JSON.parse(lm.result?.content?.[0]?.text ?? "{}");
  assert(lmData.count > 0, `foresight_list_markets returns >0 markets (got ${lmData.count})`);

  // 5. call foresight_get_market on a known slug
  const gm = await send(
    makeRequest("tools/call", {
      name: "foresight_get_market",
      arguments: { identifier: "thailand-snap-election-before-q4-2027" },
    }),
  );
  const gmData = JSON.parse(gm.result?.content?.[0]?.text ?? "{}");
  assert(gmData.id === "th-elec-2027", `foresight_get_market resolves slug to th-elec-2027 (got ${gmData.id})`);

  // 6. call foresight_get_market on unknown — expect structured error
  const gm404 = await send(
    makeRequest("tools/call", {
      name: "foresight_get_market",
      arguments: { identifier: "does-not-exist" },
    }),
  );
  assert(gm404.result?.isError === true, "foresight_get_market returns isError on unknown identifier");

  // 7. call foresight_propose_market — distress market should be refused
  const distress = await send(
    makeRequest("tools/call", {
      name: "foresight_propose_market",
      arguments: {
        question: "Will the supreme leader die before December?",
        category: "global-tech",
        closesAt: "2027-12-31T00:00:00Z",
        resolutionCriteria: "Resolves YES if the named person dies before the deadline as reported by Reuters.",
        resolutionSources: ["reuters.com"],
      },
    }),
  );
  assert(distress.result?.isError === true, "foresight_propose_market refuses distress / assassination questions");

  // 8. call foresight_propose_market — good proposal should accept
  const good = await send(
    makeRequest("tools/call", {
      name: "foresight_propose_market",
      arguments: {
        question: "Will the SET Index close above 1800 by Q4 2027?",
        category: "thai-politics",
        closesAt: "2027-12-31T00:00:00Z",
        resolutionCriteria:
          "Resolves YES if the SET Index official daily close >= 1800 on any trading day before 2027-12-31, as reported by setindex.set.or.th.",
        resolutionSources: ["set.or.th"],
      },
    }),
  );
  const goodData = JSON.parse(good.result?.content?.[0]?.text ?? "{}");
  assert(goodData.status === "pending_review", "foresight_propose_market accepts a well-formed proposal");

  // 9. resolve_check on an open market — expect 'pending'
  const rc = await send(
    makeRequest("tools/call", {
      name: "foresight_resolve_check",
      arguments: { identifier: "th-elec-2027" },
    }),
  );
  const rcData = JSON.parse(rc.result?.content?.[0]?.text ?? "{}");
  assert(rcData.status === "pending", "foresight_resolve_check returns pending for an open market");
  assert(rcData.appealAvailable === true, "foresight_resolve_check surfaces appeal path");

  // 10. stream_events without filter
  const se = await send(
    makeRequest("tools/call", { name: "foresight_stream_events", arguments: {} }),
  );
  const seData = JSON.parse(se.result?.content?.[0]?.text ?? "{}");
  assert(Array.isArray(seData.events), "foresight_stream_events returns an events array");
  assert(typeof seData.cursor === "string", "foresight_stream_events returns a cursor");

  // 11. cross_venue with NEITHER identifier NOR query — deterministic error,
  //     no network needed (fails the guard before any fetch). This proves
  //     the tool is wired without depending on live venue APIs in CI.
  const cvErr = await send(
    makeRequest("tools/call", { name: "foresight_cross_venue", arguments: {} }),
  );
  assert(
    cvErr.result?.isError === true,
    "foresight_cross_venue returns isError when neither identifier nor query is given",
  );

  console.log("\nALL SMOKE ASSERTIONS PASSED.");
  server.kill();
  process.exit(0);
})().catch((err) => {
  console.error("Smoke test crashed:", err);
  server.kill();
  process.exit(1);
});
