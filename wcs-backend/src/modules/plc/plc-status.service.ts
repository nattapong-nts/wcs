import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import modbusConfig from 'src/config/modbus.config';
import { ModbusService } from '../modbus/modbus.service';
import { TaskService } from '../task/task.service';

export interface PlcStatus {
  connected: boolean;
  host: string;
  port: number;
  di: Record<string, boolean>;
  do: Record<string, boolean>;
  taskState: string | null;
  timestamp: string;
}

const EMPTY_DI = { 0: false, 1: false, 2: false };
const EMPTY_DO = { 0: false, 1: false, 2: false, 3: false, 4: false };

// How long (ms) a cached status read is considered fresh.
// Prevents redundant Modbus reads when multiple dashboard tabs poll simultaneously.
const STATUS_CACHE_TTL_MS = 400;

@Injectable()
export class PlcStatusService {
  private readonly logger = new Logger(PlcStatusService.name);

  private cachedStatus: PlcStatus | null = null;
  private cacheExpiresAt = 0;

  constructor(
    @Inject(modbusConfig.KEY)
    private readonly config: ConfigType<typeof modbusConfig>,
    private readonly modbusService: ModbusService,
    private readonly taskService: TaskService,
  ) {}

  async readAll(): Promise<PlcStatus> {
    const now = Date.now();
    if (this.cachedStatus && now < this.cacheExpiresAt) {
      return this.cachedStatus;
    }

    const status = await this.fetchFromDevice();
    this.cachedStatus = status;
    this.cacheExpiresAt = now + STATUS_CACHE_TTL_MS;
    return status;
  }

  private async fetchFromDevice(): Promise<PlcStatus> {
    const base = {
      connected: this.modbusService.isConnected,
      host: this.config.host,
      port: this.config.port,
      taskState: this.taskService.getCurrentTaskState(),
      timestamp: new Date().toISOString(),
    };

    if (!this.modbusService.isConnected) {
      return { ...base, di: EMPTY_DI, do: EMPTY_DO };
    }

    try {
      const coil = this.modbusService.coil;
      const [diValues, doValues] = await Promise.all([
        this.modbusService.readDiscreteInputs(coil.DI_PLC_REQUEST_PICKUP, 3),
        this.modbusService.readCoils(coil.DO_AGV_IS_READY_FOR_PICKUP, 5),
      ]);

      return {
        ...base,
        di: {
          0: diValues[0],
          1: diValues[1],
          2: diValues[2],
        },
        do: {
          0: doValues[0],
          1: doValues[1],
          2: doValues[2],
          3: doValues[3],
          4: doValues[4],
        },
      };
    } catch (err) {
      this.logger.error('Failed to read PLC status', (err as Error).message);
      return { ...base, connected: false, di: EMPTY_DI, do: EMPTY_DO };
    }
  }
}
