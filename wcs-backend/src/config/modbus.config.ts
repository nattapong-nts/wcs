import { registerAs } from '@nestjs/config';

export default registerAs('modbus', () => ({
  host: process.env.MODBUS_HOST ?? '',
  port: parseInt(process.env.MODBUS_PORT ?? '5020', 10),
  unitId: parseInt(process.env.MODBUS_UNIT_ID ?? '1', 10),
  timeout: parseInt(process.env.MODBUS_TIMEOUT ?? '10000', 10),
  reconnectDelay: parseInt(process.env.MODBUS_RECONNECT_DELAY ?? '3000', 10),
  pollIntervalMs: parseInt(process.env.MODBUS_POLL_INTERVAL_MS ?? '500', 10),
}));
