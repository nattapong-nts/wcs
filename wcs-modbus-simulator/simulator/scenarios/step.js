'use strict';

/**
 * step scenario
 *
 * Steps five holding registers simultaneously to different target values,
 * then cycles through a series of preset "states" every 3 seconds.
 *
 * Useful for testing that the client reads multiple registers correctly
 * and that the bar visualization updates cleanly across all rows.
 *
 * @param {import('../server').SimulatorAPI} sim
 */
async function step(sim) {
  console.log('\x1b[36m[step]\x1b[0m Stepping registers HR00–HR04 through preset states every 3s');

  // Each state is an array of [HR00, HR01, HR02, HR03, HR04] values
  const states = [
    [0,     0,     0,     0,     0    ],
    [10000, 20000, 30000, 40000, 50000],
    [65535, 32767, 16383,  8191,  4095],
    [50000, 40000, 30000, 20000, 10000],
    [12000, 24000, 36000, 48000, 60000],
    [32000, 32000, 32000, 32000, 32000],
  ];

  // Coil pattern per state
  const coilStates = [
    [false, false, false, false, false, false, false, false],
    [true,  false, false, false, false, false, false, false],
    [true,  true,  false, false, false, false, false, false],
    [true,  true,  true,  false, false, false, false, false],
    [true,  true,  true,  true,  false, false, false, false],
    [true,  true,  true,  true,  true,  true,  true,  true ],
  ];

  let stateIndex = 0;

  function applyState() {
    const regs  = states[stateIndex];
    const coils = coilStates[stateIndex];
    regs.forEach((val, i)  => sim.setRegister(i, val));
    coils.forEach((on, i)  => sim.setCoil(i, on));
    console.log(`\x1b[36m[step]\x1b[0m Applied state ${stateIndex}: [${regs.join(', ')}]`);
    stateIndex = (stateIndex + 1) % states.length;
  }

  applyState();
  setInterval(applyState, 3000);

  // Keep the process alive
  await new Promise(() => {});
}

module.exports = step;
