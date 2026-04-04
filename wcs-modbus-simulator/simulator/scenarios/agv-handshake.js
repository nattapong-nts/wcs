"use strict";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function agvHandshake(sim) {
  console.log(
    "\x1b[36m[agv-handshake]\x1b[0m Starting... waiting 3s for step 2",
  );

  // Step 2: PLC signals "ready for pickup"
  await delay(3000);
  sim.setDiscreteInput(100, true);
  console.log(
    "\x1b[33m[agv-handshake]\x1b[0m Step 2 → DI coil 100 ON  (DI_PLC_REQUEST_PICKUP)",
  );

  // Step 5: PLC signals "goods loaded"
  await delay(10000);
  sim.setDiscreteInput(101, true);
  console.log(
    "\x1b[33m[agv-handshake]\x1b[0m Step 5 → DI coil 101 ON  (DI_JOB_SETUP_COMPLETE)",
  );

  // Step 6: PLC signals "items unloaded"
  await delay(5000);
  sim.setDiscreteInput(102, true);
  console.log(
    "\x1b[33m[agv-handshake]\x1b[0m Step 6 → DI coil 102 ON  (DI_ITEMS_UNLOADED)",
  );

  // Reset
  await delay(2000);
  sim.setDiscreteInput(100, false);
  sim.setDiscreteInput(101, false);
  sim.setDiscreteInput(102, false);
  console.log(
    "\x1b[32m[agv-handshake]\x1b[0m Reset complete. All DI coils OFF.",
  );
}

module.exports = agvHandshake;
