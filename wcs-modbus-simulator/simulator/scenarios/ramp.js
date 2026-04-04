'use strict';

/**
 * ramp scenario
 *
 * Ramps holding register HR00 from 0 to 1000 (step +10 every 100ms),
 * then ramps it back down to 0. Repeats indefinitely.
 *
 * @param {import('../server').SimulatorAPI} sim
 */
async function ramp(sim) {
  console.log('\x1b[36m[ramp]\x1b[0m Starting ramp loop on HR00 (0 → 1000 → 0, step=10, 100ms interval)');

  // Also set a couple of static registers so the client table is interesting
  sim.setRegister(1, 32000);
  sim.setRegister(2, 16000);
  sim.setCoil(3, true);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await sim.ramp(0, 0, 1000, 100, 10);
    await sim.ramp(0, 1000, 0, 100, 10);
  }
}

module.exports = ramp;
