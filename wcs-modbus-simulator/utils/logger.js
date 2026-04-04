'use strict';

// ANSI escape codes
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const WHITE  = '\x1b[37m';

const BAR_WIDTH = 25;
const MAX_VAL   = 65535;

// Track previous values so we can flash changed cells
let prevRegisters = [];
let prevCoils     = [];

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function bar(value) {
  const filled = Math.round((value / MAX_VAL) * BAR_WIDTH);
  const empty  = BAR_WIDTH - filled;
  return CYAN + '█'.repeat(filled) + DIM + '░'.repeat(empty) + RESET;
}

function padLeft(str, width) {
  return String(str).padStart(width);
}

function padRight(str, width) {
  return String(str).padEnd(width);
}

/**
 * Renders the live terminal table.
 *
 * @param {number[]} registers  Array of holding register values (UInt16)
 * @param {boolean[]} coils     Array of coil boolean values
 * @param {object} opts         { title, host, port }
 */
function render(registers, coils, opts = {}) {
  const title = opts.title || 'MODBUS';
  const host  = opts.host  || 'localhost';
  const port  = opts.port  || 5020;

  const header    = `  ${BOLD}${title}${RESET}  —  ${host}:${port}`;
  const timestamp = `  Last poll: ${new Date().toLocaleTimeString()}`;

  const LINE_TOP    = '╔══════════════════════════════════════════════╗';
  const LINE_HEAD   = '╠═══════╦══════════╦═══════════════════════════╣';
  const LINE_SEP    = '╠═══════╬══════════╬═══════════════════════════╣';
  const LINE_MID    = '╠═══════╩══════════╩═══════════════════════════╣';
  const LINE_BOT    = '╚══════════════════════════════════════════════╝';
  const COL_HEADER  = `║ ${BOLD}${padRight('ADDR', 5)}${RESET} ║ ${BOLD}${padRight('VALUE', 8)}${RESET} ║ ${BOLD}${'BAR (0–65535)'.padEnd(25)}${RESET} ║`;

  clearScreen();

  process.stdout.write(LINE_TOP + '\n');
  process.stdout.write(`║  ${header.padEnd(43)}║\n`);
  process.stdout.write(LINE_HEAD + '\n');
  process.stdout.write(COL_HEADER + '\n');
  process.stdout.write(LINE_SEP + '\n');

  registers.forEach((val, i) => {
    const changed  = val !== prevRegisters[i];
    const addrStr  = `HR${String(i).padStart(2, '0')}`;
    const valStr   = padLeft(val, 8);
    const colorVal = changed ? YELLOW + BOLD + valStr + RESET : WHITE + valStr + RESET;
    const barStr   = bar(val);

    process.stdout.write(`║ ${padRight(addrStr, 5)} ║ ${colorVal} ║ ${barStr} ║\n`);
  });

  process.stdout.write(LINE_MID + '\n');

  // Coil row
  const coilStr = coils.map((on, i) => {
    const changed = on !== prevCoils[i];
    const symbol  = on ? GREEN + '●' + RESET : DIM + '○' + RESET;
    const label   = changed ? YELLOW + `C${i}` + RESET : `C${i}`;
    return `${label}:${symbol}`;
  }).join('  ');

  const coilLine = `COILS  ${coilStr}`;
  process.stdout.write(`║  ${coilLine.padEnd(60)}║\n`);
  process.stdout.write(LINE_BOT + '\n');
  process.stdout.write(DIM + timestamp + RESET + '\n');

  // Save state for next diff
  prevRegisters = registers.slice();
  prevCoils     = coils.slice();
}

module.exports = { render };
