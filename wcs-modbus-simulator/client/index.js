'use strict';

const modbus  = require('jsmodbus');
const net     = require('net');
const logger  = require('../utils/logger');

const HOST           = process.env.MODBUS_HOST || 'localhost';
const PORT           = parseInt(process.env.MODBUS_PORT || '5020', 10);
const POLL_INTERVAL  = parseInt(process.env.POLL_MS    || '2000', 10);
const REG_COUNT      = 10;  // number of holding registers to read
const COIL_COUNT     = 8;   // number of coils to read

const socket = new net.Socket();
const client = new modbus.client.TCP(socket, 1);

let polling = null;

function disconnect(reason) {
  if (polling) clearInterval(polling);
  console.error(`\x1b[31m[client]\x1b[0m Disconnected: ${reason}`);
}

async function poll() {
  try {
    const [regResp, coilResp] = await Promise.all([
      client.readHoldingRegisters(0, REG_COUNT),
      client.readCoils(0, COIL_COUNT),
    ]);

    const registers = Array.from({ length: REG_COUNT }, (_, i) =>
      regResp.response.body.valuesAsArray[i] ?? 0
    );

    const coils = Array.from({ length: COIL_COUNT }, (_, i) =>
      !!coilResp.response.body.valuesAsArray[i]
    );

    logger.render(registers, coils, {
      title: 'MODBUS CLIENT',
      host:  HOST,
      port:  PORT,
    });
  } catch (err) {
    // Suppress individual poll errors — connection events handle reconnect messaging
  }
}

socket.on('connect', () => {
  console.log(`\x1b[32m[client]\x1b[0m Connected to ${HOST}:${PORT} — polling every ${POLL_INTERVAL}ms`);
  poll();
  polling = setInterval(poll, POLL_INTERVAL);
});

socket.on('error', (err) => {
  disconnect(err.message);
});

socket.on('close', () => {
  disconnect('socket closed');
});

socket.connect({ host: HOST, port: PORT });
