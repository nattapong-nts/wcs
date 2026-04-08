import { registerAs } from '@nestjs/config';

export default registerAs('modbus', () => ({
  host: process.env.MODBUS_HOST ?? '',
  port: parseInt(process.env.MODBUS_PORT ?? '5020', 10),
  unitId: parseInt(process.env.MODBUS_UNIT_ID ?? '1', 10),
  timeout: parseInt(process.env.MODBUS_TIMEOUT ?? '10000', 10),
  reconnectDelay: parseInt(process.env.MODBUS_RECONNECT_DELAY ?? '3000', 10),
  pollIntervalMs: parseInt(process.env.MODBUS_POLL_INTERVAL_MS ?? '500', 10),

  // Digital Input addresses (PLC → WCS) — adjust to match the real PLC register map
  diPickup: parseInt(process.env.MODBUS_DI_PICKUP ?? '0', 10),
  diGoodsLoaded: parseInt(process.env.MODBUS_DI_GOODS_LOADED ?? '1', 10),
  diItemsUnloaded: parseInt(process.env.MODBUS_DI_ITEMS_UNLOADED ?? '2', 10),

  // Digital Output addresses (WCS → PLC) — adjust to match the real PLC register map
  doAgvReady: parseInt(process.env.MODBUS_DO_AGV_READY ?? '0', 10),
  doRequestEnter: parseInt(process.env.MODBUS_DO_REQUEST_ENTER ?? '1', 10),
  doAtDock: parseInt(process.env.MODBUS_DO_AT_DOCK ?? '2', 10),
  doRequestExit: parseInt(process.env.MODBUS_DO_REQUEST_EXIT ?? '3', 10),
  doTaskComplete: parseInt(process.env.MODBUS_DO_TASK_COMPLETE ?? '4', 10),
}));
