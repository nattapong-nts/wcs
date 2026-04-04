'use strict';

/**
 * alarm scenario
 *
 * Simulates an alarm pattern:
 * - Coil C0 toggles ON/OFF every 1 second (alarm signal)
 * - Coil C1 latches ON after 5 seconds (alarm acknowledged)
 * - HR00 counts up as a "fault counter" (increments on each alarm ON)
 * - HR01 acts as a "temperature" that spikes during alarm
 *
 * @param {import('../server').SimulatorAPI} sim
 */
async function alarm(sim) {
  console.log('\x1b[36m[alarm]\x1b[0m Starting alarm simulation on C0/C1 and HR00/HR01');

  let alarmOn    = false;
  let faultCount = 0;
  let tick       = 0;

  setInterval(() => {
    tick++;
    alarmOn = !alarmOn;

    // Toggle alarm coil
    sim.setCoil(0, alarmOn);

    // Increment fault counter each time alarm fires
    if (alarmOn) {
      faultCount = Math.min(faultCount + 1, 65535);
      sim.setRegister(0, faultCount);
    }

    // Simulate temperature spiking during alarm
    sim.setRegister(1, alarmOn ? 58000 : 12000);

    // Latch acknowledgment coil after 5 toggles
    if (tick >= 5) {
      sim.setCoil(1, true);
    }

    // Reset latch after 15 cycles
    if (tick >= 15) {
      sim.setCoil(1, false);
      tick = 0;
    }
  }, 1000);

  // Keep the process alive
  await new Promise(() => {});
}

module.exports = alarm;
