import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import modbusConfig from 'src/config/modbus.config';
import { ModbusService } from '../modbus/modbus.service';
import { TaskService } from '../task/task.service';

@Injectable()
export class PlcPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlcPollerService.name);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isPolling = false;

  // Edge detection — only fire on OFF→ON transition, not while signal stays ON
  private lastPickupSignal = false;
  private lastGoodsLoadedSignal = false;
  private lastItemsUnloadedSignal = false;

  // Fix #10: On the first poll after a (re)connect, seed "last" values from the actual
  // PLC state so we don't treat pre-existing ON signals as new rising edges.
  private isFirstPollAfterConnect = true;

  private isDispatching = false;

  constructor(
    @Inject(modbusConfig.KEY)
    private readonly config: ConfigType<typeof modbusConfig>,
    private readonly taskService: TaskService,
    private readonly modbusService: ModbusService,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  onModuleDestroy() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling() {
    const ms = this.config.pollIntervalMs;
    this.logger.log(`Starting PLC poll loop every ${ms}ms`);
    this.isPolling = true;
    this.schedulePoll(ms);
  }

  private schedulePoll(ms: number): void {
    if (!this.isPolling) return;
    this.pollTimer = setTimeout(() => {
      void this.pollAndReschedule(ms);
    }, ms);
  }

  private async pollAndReschedule(ms: number): Promise<void> {
    try {
      await this.pollPlc();
    } catch (error) {
      this.logger.error('Error in poll cycle', error);
    } finally {
      this.schedulePoll(ms);
    }
  }

  private async pollPlc() {
    if (!this.modbusService.isConnected) {
      // Mark that the next successful poll should seed the edge-detection baseline
      this.isFirstPollAfterConnect = true;
      return;
    }
    try {
      // Read all 3 DI signals in a single batch request
      const [pickup, goodsLoaded, itemsUnloaded] =
        await this.modbusService.readDiscreteInputs(
          this.modbusService.coil.DI_PLC_REQUEST_PICKUP,
          3,
        );

      // Fix #10: Seed "last" values on first poll after (re)connect.
      // Prevents phantom rising-edge events for signals that were already ON.
      if (this.isFirstPollAfterConnect) {
        this.lastPickupSignal = pickup;
        this.lastGoodsLoadedSignal = goodsLoaded;
        this.lastItemsUnloadedSignal = itemsUnloaded;
        this.isFirstPollAfterConnect = false;
        this.logger.log(
          `PLC edge-detection seeded after reconnect: DI0=${pickup} DI1=${goodsLoaded} DI2=${itemsUnloaded}`,
        );
        return;
      }

      // Step 2: PLC ready for pickup (rising edge only) — auto-dispatches AGV
      if (pickup && !this.lastPickupSignal && !this.isDispatching) {
        this.logger.log('PLC request pickup (rising edge)');
        this.isDispatching = true;
        try {
          await this.taskService.onPlcRequestPickup();
        } finally {
          this.isDispatching = false;
        }
      }

      // Step 5: Goods loaded on AGV (rising edge only)
      if (goodsLoaded && !this.lastGoodsLoadedSignal) {
        this.logger.log('Goods loaded (rising edge)');
        await this.taskService.onGoodsLoaded();
      }

      // Step 6: Items unloaded (rising edge only) — completes the task
      if (itemsUnloaded && !this.lastItemsUnloadedSignal) {
        this.logger.log('Items unloaded (rising edge)');
        const rcsTaskCode = this.taskService.getCurrentTaskRcsTaskCode();
        if (rcsTaskCode) {
          await this.taskService.onTaskComplete(rcsTaskCode);
        }
      }

      this.lastPickupSignal = pickup;
      this.lastGoodsLoadedSignal = goodsLoaded;
      this.lastItemsUnloadedSignal = itemsUnloaded;
    } catch (error) {
      this.logger.error('Error polling PLC', error);
    }
  }
}
