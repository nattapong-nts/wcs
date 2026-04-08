import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import modbusConfig from 'src/config/modbus.config';
import * as net from 'net';
import { ModbusTCPClient } from 'jsmodbus';

@Injectable()
export class ModbusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModbusService.name);

  private socket: net.Socket;
  private client: ModbusTCPClient;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(modbusConfig.KEY)
    private readonly config: ConfigType<typeof modbusConfig>,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.cleanup();
  }

  // connection management
  private connect() {
    this.socket = new net.Socket();
    this.client = new ModbusTCPClient(
      this.socket,
      this.config.unitId,
      this.config.timeout,
    );

    this.socket.on('connect', () => {
      this.connected = true;
      this.logger.log(
        `Connected to Modbus PLC at ${this.config.host}:${this.config.port}`,
      );
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.logger.log('Modbus connection closed, Reconnecting...');
      this.scheduleReconnect();
    });

    this.socket.on('error', (error) => {
      this.connected = false;
      this.logger.error('Modbus connection error', error);
    });

    this.socket.connect(this.config.port, this.config.host);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.logger.log('Attempting to reconnect to Modbus PLC...');
      this.connect();
    }, this.config.reconnectDelay);
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.destroy();
  }

  /**
   * Read a single Discrete Input (DI) from the PLC.
   * Use this for coil addresses 100–102 (things PLC signals TO you).
   *
   * @param address  The DI coil address (e.g. COIL.DI_PLC_REQUEST_PICKUP = 100)
   * @returns true = signal ON, false = signal OFF
   */
  async readDiscreteInput(address: number): Promise<boolean> {
    this.ensureConnected();
    try {
      const response = await this.client.readDiscreteInputs(address, 1);
      return !!response.response.body.valuesAsArray[0];
    } catch (err) {
      this.logger.error(
        `Failed to read DI coil at address ${address}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Write a single coil (DO) to the PLC.
   * Use this for coil addresses 0–4 (things you signal TO the PLC).
   *
   * @param address  The DO coil address (e.g. COIL.DO_AGV_TASK_DISPATCHED = 0)
   * @param value    true = ON, false = OFF
   */
  async writeCoil(address: number, value: boolean): Promise<void> {
    this.ensureConnected();
    try {
      await this.client.writeSingleCoil(address, value);
      this.logger.debug(
        `Written coil at address ${address} = ${value ? 'ON' : 'OFF'}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to write DO coil at address ${address}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Read multiple Discrete Inputs at once (efficient batch read).
   * Reads `count` DI coils starting at `startAddress`.
   *
   * @returns array of booleans, index 0 = startAddress
   */
  async readDiscreteInputs(
    startAddress: number,
    count: number,
  ): Promise<boolean[]> {
    this.ensureConnected();
    try {
      const response = await this.client.readDiscreteInputs(
        startAddress,
        count,
      );
      return response.response.body.valuesAsArray.map((v) => !!v);
    } catch (err) {
      this.logger.error(
        `Failed to read DI coils at ${startAddress}+${count}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async readCoils(startAddress: number, count: number): Promise<boolean[]> {
    this.ensureConnected();
    try {
      const response = await this.client.readCoils(startAddress, count);
      return response.response.body.valuesAsArray.map((v) => !!v);
    } catch (err) {
      this.logger.error(
        `Failed to read COILS at ${startAddress}+${count}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Live coil addresses resolved from config / environment variables. */
  get coil() {
    return {
      DI_PLC_REQUEST_PICKUP: this.config.diPickup,
      DI_JOB_SETUP_COMPLETE: this.config.diGoodsLoaded,
      DI_ITEMS_UNLOADED: this.config.diItemsUnloaded,
      DO_AGV_IS_READY_FOR_PICKUP: this.config.doAgvReady,
      DO_REQUEST_TO_ENTER: this.config.doRequestEnter,
      DO_AGV_AT_DOCK_WAITING: this.config.doAtDock,
      DO_REQUEST_TO_EXIT: this.config.doRequestExit,
      DO_AGV_TASK_COMPLETE: this.config.doTaskComplete,
    } as const;
  }

  // Helper
  private ensureConnected() {
    if (!this.connected) {
      throw new Error(
        `Modbus client is not connected to ${this.config.host}:${this.config.port}`,
      );
    }
  }
}
