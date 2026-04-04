# WCS — Node.js Modbus Simulator

A self-contained Modbus TCP simulator built with [jsmodbus](https://github.com/cloud-automation/node-modbus). No external software (PLC, hardware, or tools like ModRSsim) is required.

Both the simulator **server** and the **client** use the same `jsmodbus` library you would use in a real application, so this setup validates your actual integration code.

---

## Project Structure

```
wcs/
├── package.json
├── utils/
│   └── logger.js              # ANSI terminal table renderer
├── simulator/
│   ├── server.js              # Modbus TCP server + SimulatorAPI
│   ├── run.js                 # CLI entry point
│   └── scenarios/
│       ├── ramp.js            # HR00 ramps 0 → 1000 → 0 in a loop
│       ├── alarm.js           # Coil alarm + fault counter pattern
│       └── step.js            # Steps HR00–HR04 through preset states
└── client/
    └── index.js               # Polls registers/coils, renders live table
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start a simulator scenario (Terminal 1)

```bash
npm run sim:ramp    # ramp scenario
npm run sim:alarm   # alarm scenario
npm run sim:step    # step scenario
```

### 3. Start the client (Terminal 2)

```bash
npm run client
```

The client terminal will display a live, auto-refreshing table:

```
╔══════════════════════════════════════════════╗
║  MODBUS CLIENT  —  localhost:5020            ║
╠═══════╦══════════╦═══════════════════════════╣
║  ADDR ║  VALUE   ║  BAR (0–65535)            ║
╠═══════╬══════════╬═══════════════════════════╣
║  HR00 ║      450 ║ ████░░░░░░░░░░░░░░░░░░░░░ ║
║  HR01 ║    32000 ║ ████████████░░░░░░░░░░░░░ ║
╠═══════╩══════════╩═══════════════════════════╣
║  COILS  C0:●  C1:○  C2:○  C3:●  C4:○  ...   ║
╚══════════════════════════════════════════════╝
  Last poll: 12:00:05
```

- **Cyan bars** show proportional register values (0–65535 range)
- **Yellow** highlights cells that changed since the last poll
- **Green ●** = coil ON, dim **○** = coil OFF

---

## Scenarios

| Script | What it does |
|---|---|
| `ramp` | HR00 ramps 0 → 1000 → 0 continuously (step 10 per 100ms) |
| `alarm` | C0 toggles every 1s, HR00 counts faults, HR01 temperature spikes |
| `step` | HR00–HR04 step through 6 preset states every 3s |

---

## SimulatorAPI Reference

Import the server and use the `SimulatorAPI` to script custom scenarios:

```js
const { start } = require('./simulator/server');

(async () => {
  const { sim } = await start(5020);

  // Write a holding register value (0–65535)
  sim.setRegister(0, 1234);

  // Write a coil (boolean)
  sim.setCoil(2, true);

  // Ramp register 0 from 0 to 5000 in steps of 50 every 200ms
  await sim.ramp(0, 0, 5000, 200, 50);

  // Read current values back
  console.log(sim.getRegister(0)); // 5000
  console.log(sim.getCoil(2));     // true
})();
```

---

## Environment Variables (Client)

| Variable | Default | Description |
|---|---|---|
| `MODBUS_HOST` | `localhost` | Simulator host |
| `MODBUS_PORT` | `5020` | Simulator port |
| `POLL_MS` | `2000` | Poll interval in milliseconds |

```bash
MODBUS_HOST=192.168.1.50 MODBUS_PORT=502 npm run client
```

---

## Custom Scenarios

Add a new file to `simulator/scenarios/`:

```js
// simulator/scenarios/my-scenario.js
'use strict';

async function myScenario(sim) {
  // Your logic here
  sim.setRegister(0, 9999);
  await sim.ramp(1, 0, 65535, 50, 100);
}

module.exports = myScenario;
```

Run it with:

```bash
node simulator/run.js --scenario my-scenario --port 5020
```

---

## Port Note

The simulator defaults to port **5020** so it does not require root/admin privileges. Real Modbus devices use port **502**. To match a real device:

```bash
node simulator/run.js --scenario ramp --port 502   # requires sudo on Linux/macOS
```
