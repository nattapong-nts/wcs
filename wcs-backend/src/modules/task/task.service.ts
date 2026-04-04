import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import agvConfig from 'src/config/agv.config';
import { generateReqCode } from 'src/utils';
import { COIL } from '../modbus/modbus.constants';
import { ModbusService } from '../modbus/modbus.service';
import { type AgvStatusResponse } from '../rcs/rcs.interfaces';
import { RcsService } from '../rcs/rcs.service';
import { TaskContext, TaskState } from './task.types';

const STATE_FILE = path.resolve(process.cwd(), 'task-state.json');

@Injectable()
export class TaskService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskService.name);

  private currentTask: TaskContext | null = null;
  private dockTimeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    @Inject(agvConfig.KEY)
    private readonly agvCfg: ConfigType<typeof agvConfig>,
    private readonly rcsService: RcsService,
    private readonly modbusService: ModbusService,
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.recoverPersistedTask();
  }

  onModuleDestroy(): void {
    this.persistTask();
  }

  // ─── Fix #7: Recover persisted task on startup ────────────────────────────
  private recoverPersistedTask(): void {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const saved = JSON.parse(raw) as TaskContext;
      // Revive Date objects (JSON.parse turns them into strings)
      saved.startedAt = new Date(saved.startedAt);
      saved.updatedAt = new Date(saved.updatedAt);
      this.currentTask = saved;
      this.logger.warn(
        `[RECOVERY] Restored task ${saved.reqCode} in state ${saved.state} from disk`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to recover task state from disk: ${(err as Error).message}`,
      );
    }
  }

  // ─── Fix #7: Persist every state change to disk ───────────────────────────
  private persistTask(): void {
    try {
      if (this.currentTask) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(this.currentTask, null, 2));
      } else {
        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
      }
    } catch (err) {
      this.logger.error(
        `Failed to persist task state: ${(err as Error).message}`,
      );
    }
  }

  // ─── Fix #11: Best-effort coil write — logs on failure, never throws ──────
  private async tryWriteCoil(
    address: number,
    value: boolean,
    label: string,
  ): Promise<void> {
    try {
      await this.modbusService.writeCoil(address, value);
    } catch (err) {
      this.logger.error(
        `Coil write failed [${label}] addr=${address} val=${value}: ${(err as Error).message} — PLC signal may be out of sync`,
      );
    }
  }

  // ─── Step 1: Dispatch ─────────────────────────────────────────────────────
  async dispatch(
    reqCode: string,
    standbyPosition: string,
    dockPosition: string,
    destinationPosition: string,
  ): Promise<void> {
    if (
      this.currentTask &&
      this.currentTask.state !== TaskState.IDLE &&
      this.currentTask.state !== TaskState.COMPLETED &&
      this.currentTask.state !== TaskState.TIMED_OUT
    ) {
      throw new Error(
        `Cannot dispatch: a task is already running in state ${this.currentTask.state}`,
      );
    }

    // Fix #2: Call RCS FIRST — only set state after it succeeds
    // positionCodePath only needs the dock (Y) — AGV navigates from its current position automatically
    const response = await this.rcsService.genAgvSchedulingTask({
      reqCode,
      taskTyp: 'F01',
      positionCodePath: [
        {
          positionCode: standbyPosition,
          type: '00',
        },
        {
          positionCode: dockPosition,
          type: '00',
        },
      ],
      priority: '1',
    });

    this.currentTask = {
      state: TaskState.AGV_IN_SAFETY_ZONE,
      reqCode,
      rcsTaskCode: response.data,
      standbyPosition,
      dockPosition,
      destinationPosition,
      startedAt: new Date(),
      updatedAt: new Date(),
    };
    this.persistTask();
  }

  // ─── RCS "start" callback — AGV has begun moving ─────────────────────────

  async onAgvStarted(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received start callback for unknown/mismatched task — ignoring`,
      );
      return;
    }
    if (this.currentTask.state !== TaskState.AGV_IN_SAFETY_ZONE) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received start callback in unexpected state ${this.currentTask.state} — ignoring`,
      );
      return;
    }
    this.transition(TaskState.AGV_IN_SAFETY_ZONE, 'RCS confirmed AGV started');
    this.persistTask();
    await this.tryWriteCoil(
      COIL.DO_AGV_IN_SAFETY_ZONE,
      true,
      'DO_AGV_IN_SAFETY_ZONE',
    );
  }

  // PLC request pickup
  async onPlcRequestPickup(): Promise<void> {
    // Guard: ignore if a task is already in flight
    if (
      this.currentTask &&
      this.currentTask.state !== TaskState.IDLE &&
      this.currentTask.state !== TaskState.COMPLETED &&
      this.currentTask.state !== TaskState.TIMED_OUT
    ) {
      this.logger.warn(
        `PLC request pickup but task already running in state ${this.currentTask.state} — ignoring`,
      );
      return;
    }

    // Guard: query RCS to confirm an AGV is idle (status=4) and online
    const reqCode = generateReqCode();
    let statusRes: AgvStatusResponse;
    try {
      statusRes = await this.rcsService.queryAgvStatus(reqCode);
    } catch (err) {
      this.logger.error(
        `Failed to query AGV status before dispatch: ${(err as Error).message} — aborting`,
      );
      return;
    }

    const availableAgv = statusRes.data.find(
      (a) => a.status === '4' && a.online,
    );
    if (!availableAgv) {
      this.logger.warn(
        `PLC request pickup but no idle online AGV found (statuses: ${statusRes.data.map((a) => `${a.robotCode}:${a.status}:online=${String(a.online)}`).join(', ')}) — aborting dispatch`,
      );
      return;
    }

    this.logger.log(
      `PLC request pickup — idle AGV ${availableAgv.robotCode} found, auto-dispatching`,
    );

    await this.dispatch(
      reqCode,
      this.agvCfg.standbyPosition,
      this.agvCfg.dockPosition,
      this.agvCfg.destinationPosition,
    );
  }

  // AGV arrived at dock (callback: 'out')
  async onAgvArrivedAtDock(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvArrivedAtDock: no matching active task — ignoring`,
      );
      return;
    }

    // AGV_IN_SAFETY_ZONE → WAITING_FOR_PLC
    if (this.currentTask.state === TaskState.AGV_IN_SAFETY_ZONE) {
      this.transition(TaskState.WAITING_FOR_PLC, 'AGV arrived at dock');
      await this.tryWriteCoil(
        COIL.DO_AGV_AT_DOCK_WAITING,
        true,
        'DO_AGV_AT_DOCK_WAITING',
      );
    }

    this.persistTask();
  }

  // ─── Step 5: Goods loaded — PLC DI 101 ───────────────────────────────────

  async onGoodsLoaded(): Promise<void> {
    if (
      !this.currentTask ||
      this.currentTask.state !== TaskState.WAITING_FOR_PLC
    ) {
      this.logger.warn(
        'Received goods-loaded but no task in WAITING_FOR_PLC — ignoring',
      );
      return;
    }

    // Fix #3: Call RCS FIRST — only advance state if it succeeds
    try {
      await this.rcsService.continueTask({
        reqCode: this.currentTask.reqCode,
        taskCode: this.currentTask.rcsTaskCode,
        nextPositionCode: {
          positionCode: this.currentTask.destinationPosition,
          type: '00',
        },
      });
    } catch (err) {
      // RCS failed — stay in WAITING_FOR_PLC so PLC DI 101 rising edge can retry
      this.logger.error(
        `[${this.currentTask.reqCode}] continueTask failed — staying in WAITING_FOR_PLC: ${(err as Error).message}`,
      );
      return;
    }

    this.transition(
      TaskState.CONTINUING,
      'RCS confirmed continueTask — AGV departing dock',
    );
    this.persistTask();
    await this.tryWriteCoil(COIL.DO_AGV_CONTINUING, true, 'DO_AGV_CONTINUING');
    this.logger.log(
      `[${this.currentTask.reqCode}] AGV departing dock toward ${this.currentTask.destinationPosition}`,
    );
  }

  // ─── Step 6: Task complete (callback: 'complete' or 'ctu') ──────────────────

  async onTaskComplete(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received end for unknown/mismatched task — returning ok`,
      );
      return;
    }

    const terminalStates = [
      TaskState.IDLE,
      TaskState.COMPLETED,
      TaskState.TIMED_OUT,
    ];
    if (terminalStates.includes(this.currentTask.state)) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received end in terminal state ${this.currentTask.state} — ignoring`,
      );
      return;
    }

    this.transition(TaskState.COMPLETED, 'RCS confirmed task end');
    this.persistTask();
    await this.tryWriteCoil(
      COIL.DO_AGV_TASK_COMPLETE,
      true,
      'DO_AGV_TASK_COMPLETE',
    );

    const reqCode = this.currentTask.reqCode;
    setTimeout(() => {
      void this.resetAllCoils().then(() => {
        if (this.currentTask?.state === TaskState.COMPLETED) {
          this.currentTask = null;
          this.persistTask();
          this.logger.log(
            `[${reqCode}] Task cleared — system ready for next dispatch`,
          );
        }
      });
    }, 5_000);
  }

  // ─── Cancel (RCS-initiated) ───────────────────────────────────────────────

  async onTaskCancelled(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received cancel for unknown task — ignoring`,
      );
      return;
    }
    this.transition(TaskState.IDLE, 'Task cancelled by RCS');
    await this.resetAllCoils();
    this.currentTask = null;
    this.persistTask();
    this.logger.log(`[taskCode=${taskCode}] Task cancelled and cleared`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getCurrentTaskState(): TaskState | null {
    return this.currentTask?.state ?? null;
  }

  private async resetAllCoils(): Promise<void> {
    await Promise.all([
      this.tryWriteCoil(
        COIL.DO_AGV_TASK_DISPATCHED,
        false,
        'DO_AGV_TASK_DISPATCHED',
      ),
      this.tryWriteCoil(
        COIL.DO_AGV_IN_SAFETY_ZONE,
        false,
        'DO_AGV_IN_SAFETY_ZONE',
      ),
      this.tryWriteCoil(
        COIL.DO_AGV_AT_DOCK_WAITING,
        false,
        'DO_AGV_AT_DOCK_WAITING',
      ),
      this.tryWriteCoil(COIL.DO_AGV_CONTINUING, false, 'DO_AGV_CONTINUING'),
      this.tryWriteCoil(
        COIL.DO_AGV_TASK_COMPLETE,
        false,
        'DO_AGV_TASK_COMPLETE',
      ),
    ]);
    this.logger.log('All DO coils reset to OFF');
  }

  getCurrentTaskReqCode(): string | null {
    return this.currentTask?.reqCode ?? null;
  }

  private transition(newState: TaskState, reason: string): void {
    const oldState = this.currentTask!.state;
    this.currentTask!.state = newState;
    this.currentTask!.updatedAt = new Date();
    this.logger.log(
      `[${this.currentTask!.reqCode}] ${oldState} → ${newState} (${reason})`,
    );
  }
}
