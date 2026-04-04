'use strict';

const path = require('path');
const { start } = require('./server');

// Parse CLI args: --scenario <name> --port <number>
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const scenarioName = getArg('--scenario');
const port         = parseInt(getArg('--port') || '5020', 10);

if (!scenarioName) {
  console.error('\x1b[31m[error]\x1b[0m Usage: node simulator/run.js --scenario <name> [--port <number>]');
  console.error('        Available scenarios: ramp, alarm, step');
  process.exit(1);
}

const scenarioPath = path.resolve(__dirname, 'scenarios', `${scenarioName}.js`);

let scenario;
try {
  scenario = require(scenarioPath);
} catch (err) {
  console.error(`\x1b[31m[error]\x1b[0m Scenario "${scenarioName}" not found at ${scenarioPath}`);
  process.exit(1);
}

(async () => {
  const { sim } = await start(port);

  console.log(`\x1b[36m[simulator]\x1b[0m Running scenario: \x1b[1m${scenarioName}\x1b[0m`);

  try {
    await scenario(sim);
    console.log(`\x1b[32m[simulator]\x1b[0m Scenario "${scenarioName}" completed. Server still running — Ctrl+C to stop.`);
  } catch (err) {
    console.error('\x1b[31m[simulator]\x1b[0m Scenario error:', err.message);
  }
})();
