"use strict";

const http = require("http");
const { start } = require("./server");

const HTTP_PORT = 3001;
const MODBUS_PORT = 5020;

// ─── State tracking ───────────────────────────────────────────────────────────
// We mirror the coil/DI values here so the dashboard can display them
const state = {
  di: { 0: false, 1: false, 2: false }, // DI signals (PLC → backend)
  do: { 0: false, 1: false, 2: false, 3: false, 4: false }, // DO coils (backend → PLC)
  // DO[0]=AGV_IS_READY_FOR_PICKUP, DO[1]=REQUEST_TO_ENTER, DO[2]=AGV_AT_DOCK_WAITING
  // DO[3]=REQUEST_TO_EXIT, DO[4]=AGV_TASK_COMPLETE
};

// ─── HTML Dashboard ───────────────────────────────────────────────────────────
function renderHtml() {
  const dot = (on) =>
    on
      ? '<span style="color:#22c55e;font-size:1.4em">●</span>'
      : '<span style="color:#475569;font-size:1.4em">○</span>';

  const diRows = [
    [0, "PLC Request Pickup", "plc-request-pickup"],
    [1, "Goods Loaded", "goods-loaded"],
    [2, "Items Unloaded", "items-unloaded"],
  ]
    .map(
      ([addr, label, step]) => `
    <tr>
      <td>${dot(state.di[addr])}</td>
      <td>DI ${addr}</td>
      <td>${label}</td>
      <td>
        <button onclick="trigger('${step}', true)">▶ Set ON</button>
        <button onclick="trigger('${step}', false)">■ Set OFF</button>
      </td>
    </tr>`,
    )
    .join("");

  const doLabels = {
    0: "DO_AGV_IS_READY_FOR_PICKUP",
    1: "DO_REQUEST_TO_ENTER",
    2: "DO_AGV_AT_DOCK_WAITING",
    3: "DO_REQUEST_TO_EXIT",
    4: "DO_AGV_TASK_COMPLETE",
  };

  const doRows = Object.entries(doLabels)
    .map(
      ([addr, label]) => `
    <tr>
      <td>${dot(state.do[addr])}</td>
      <td>DO ${addr}</td>
      <td>${label}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>AGV-PLC Simulator</title>
  <meta http-equiv="refresh" content="1">
  <style>
    body { font-family: monospace; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { color: #38bdf8; }
    h2 { color: #94a3b8; margin-top: 2rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th { text-align: left; color: #64748b; padding: 0.5rem 1rem; border-bottom: 1px solid #1e293b; }
    td { padding: 0.5rem 1rem; border-bottom: 1px solid #1e293b; }
    button {
      background: #1e40af; color: white; border: none;
      padding: 0.3rem 0.8rem; border-radius: 4px; cursor: pointer; margin-right: 4px;
    }
    button:hover { background: #2563eb; }
    .ts { color: #475569; font-size: 0.8em; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>AGV-PLC Simulator Dashboard</h1>

  <h2>DI Signals — PLC → Backend (you control these)</h2>
  <table>
    <tr><th>State</th><th>Address</th><th>Meaning</th><th>Action</th></tr>
    ${diRows}
  </table>

  <h2>DO Coils — Backend → PLC (backend writes these)</h2>
  <table>
    <tr><th>State</th><th>Address</th><th>Meaning</th></tr>
    ${doRows}
  </table>

  <p class="ts">Auto-refreshes every 1s — ${new Date().toLocaleTimeString()}</p>

  <script>
    async function trigger(step, on) {
      await fetch('/trigger/' + step + '?on=' + on, { method: 'POST' });
    }
  </script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const { sim, server: modbusServer } = await start(MODBUS_PORT);

  // Mirror DO coil writes from the backend into our state object
  // jsmodbus fires 'postWriteSingleCoil' after any client writes a coil
  modbusServer.on("postWriteSingleCoil", (req) => {
    const addr = req.body.address;
    const val = req.body.value;
    if (addr in state.do) {
      state.do[addr] = !!val;
    }
  });

  // ─── HTTP server ────────────────────────────────────────────────────────
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

    // GET / — serve dashboard HTML
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderHtml());
      return;
    }

    // GET /state — JSON snapshot (useful for debugging)
    if (req.method === "GET" && url.pathname === "/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state));
      return;
    }

    // POST /trigger/:step?on=true|false — set a DI coil
    if (req.method === "POST" && url.pathname.startsWith("/trigger/")) {
      const step = url.pathname.split("/trigger/")[1];
      const on = url.searchParams.get("on") !== "false";

      const stepMap = {
        "plc-request-pickup": 0,
        "goods-loaded": 1,
        "items-unloaded": 2,
      };

      const addr = stepMap[step];
      if (addr === undefined) {
        res.writeHead(404);
        res.end("Unknown step");
        return;
      }

      sim.setDiscreteInput(addr, on);
      state.di[addr] = on;
      console.log(`[dashboard] DI ${addr} set ${on ? "ON" : "OFF"} (${step})`);

      res.writeHead(200);
      res.end("ok");
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log(
      `\x1b[32m[dashboard]\x1b[0m Modbus TCP server on :${MODBUS_PORT}`,
    );
    console.log(
      `\x1b[36m[dashboard]\x1b[0m Dashboard UI at http://localhost:${HTTP_PORT}`,
    );
    console.log(
      `\x1b[33m[dashboard]\x1b[0m Open browser → click buttons to trigger DI signals`,
    );
  });
})();
