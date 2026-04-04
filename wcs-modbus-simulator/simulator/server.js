"use strict";

const modbus = require("jsmodbus");
const net = require("net");
const { EventEmitter } = require("events");

// 125 holding registers (250 bytes), 256 coils (32 bytes)
const HOLDING_SIZE = 125;
const COILS_SIZE = 256;

class SimulatorAPI extends EventEmitter {
  constructor(modbusServer) {
    super();
    this._server = modbusServer;
  }

  /**
   * Write a UInt16 value to a holding register.
   * @param {number} addr   Register address (0-based)
   * @param {number} value  UInt16 value (0–65535)
   */
  setRegister(addr, value) {
    if (addr < 0 || addr >= HOLDING_SIZE) {
      throw new RangeError(
        `Register address ${addr} out of range (0–${HOLDING_SIZE - 1})`,
      );
    }
    const clamped = Math.max(0, Math.min(65535, Math.round(value)));
    this._server.holding.writeUInt16BE(clamped, addr * 2);
    this.emit("change", { type: "register", addr, value: clamped });
  }

  /**
   * Write a boolean to a coil.
   * @param {number}  addr  Coil address (0-based)
   * @param {boolean} on    true = ON, false = OFF
   */
  setCoil(addr, on) {
    if (addr < 0 || addr >= COILS_SIZE) {
      throw new RangeError(
        `Coil address ${addr} out of range (0–${COILS_SIZE - 1})`,
      );
    }
    const byteIndex = Math.floor(addr / 8);
    const bitIndex = addr % 8;
    const current = this._server.coils.readUInt8(byteIndex);
    const updated = on ? current | (1 << bitIndex) : current & ~(1 << bitIndex);
    this._server.coils.writeUInt8(updated, byteIndex);
    this.emit("change", { type: "coil", addr, value: !!on });
  }

  /**
   * Read back the current value of a holding register.
   * @param {number} addr
   * @returns {number}
   */
  getRegister(addr) {
    return this._server.holding.readUInt16BE(addr * 2);
  }

  /**
   * Read back the current state of a coil.
   * @param {number} addr
   * @returns {boolean}
   */
  getCoil(addr) {
    const byteIndex = Math.floor(addr / 8);
    const bitIndex = addr % 8;
    return !!(this._server.coils.readUInt8(byteIndex) & (1 << bitIndex));
  }

  /**
   * Ramp a holding register from start to end over time.
   * @param {number} addr       Register address
   * @param {number} start      Start value
   * @param {number} end        End value
   * @param {number} stepMs     Interval between steps (ms)
   * @param {number} increment  Amount to add per step (always positive; direction is inferred)
   * @returns {Promise<void>}   Resolves when the ramp completes
   */
  ramp(addr, start, end, stepMs = 100, increment = 1) {
    return new Promise((resolve) => {
      this.setRegister(addr, start);
      const direction = end >= start ? 1 : -1;
      const step = Math.abs(increment) * direction;

      const interval = setInterval(() => {
        const current = this.getRegister(addr);
        const next = current + step;

        if (direction > 0 ? next >= end : next <= end) {
          this.setRegister(addr, end);
          clearInterval(interval);
          resolve();
        } else {
          this.setRegister(addr, next);
        }
      }, stepMs);
    });
  }

  // Add this to SimulatorAPI in server.js
  setDiscreteInput(addr, on) {
    const byteIndex = Math.floor(addr / 8);
    const bitIndex = addr % 8;
    const current = this._server.discrete.readUInt8(byteIndex);
    const updated = on ? current | (1 << bitIndex) : current & ~(1 << bitIndex);
    this._server.discrete.writeUInt8(updated, byteIndex);
    this.emit("change", { type: "discrete", addr, value: !!on });
  }
}

/**
 * Start the Modbus TCP server.
 * @param {number} port  TCP port to listen on (default 5020)
 * @returns {Promise<{ server: modbus.server.TCP, sim: SimulatorAPI, netServer: net.Server }>}
 */
function start(port = 5020) {
  const netServer = new net.Server();
  // jsmodbus allocates 1024-byte holding/coils buffers by default
  const modbusServer = new modbus.server.TCP(netServer);

  return new Promise((resolve, reject) => {
    netServer.on("error", reject);
    netServer.listen(port, () => {
      console.log(
        `\x1b[32m[simulator]\x1b[0m Modbus TCP server listening on port ${port}`,
      );
      const sim = new SimulatorAPI(modbusServer);
      resolve({ server: modbusServer, sim, netServer });
    });
  });
}

module.exports = { start };
