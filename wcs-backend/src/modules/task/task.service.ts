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
import { generateReqCode, isAtPosition } from 'src/utils';
import { COIL } from '../modbus/modbus.constants';
import { ModbusService } from '../modbus/modbus.service';
import { type AgvStatusResponse } from '../rcs/rcs.interfaces';
import { RcsService } from '../rcs/rcs.service';
import { TaskAuditService } from './task-audit.service';
import { TaskContext, TaskState } from './task.types';

const STATE_FILE = path.resolve(process.cwd(), 'task-state.json');

@Injectable()
export class TaskService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskService.name);
  private agvStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private agvStatusPolling = false;

  private lastAgvReadySignal: boolean | null = null;

  private currentTask: TaskContext | null = null;

  // Bug #5: Serialize concurrent RCS callbacks — duplicate callbacks from RCS
  // must not race each other through the state machine.
  private processingCallback = false;

  constructor(
    @Inject(agvConfig.KEY)
    private readonly agvCfg: ConfigType<typeof agvConfig>,
    private readonly rcsService: RcsService,
    private readonly modbusService: ModbusService,
    private readonly audit: TaskAuditService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.recoverPersistedTask();
    this.startCheckingAgvStatus();
  }

  onModuleDestroy(): void {
    this.agvStatusPolling = false;
    if (this.agvStatusTimer) {
      clearTimeout(this.agvStatusTimer);
      this.agvStatusTimer = null;
    }
  }

  // ─── AGV status polling ───────────────────────────────────────────────────

  private startCheckingAgvStatus() {
    const ms = this.agvCfg.checkAgvStatusIntervalMs;
    this.logger.log(`Checking AGV status every ${ms}ms`);
    this.agvStatusPolling = true;
    this.scheduleAgvStatusPoll(ms);
  }

  private scheduleAgvStatusPoll(ms: number): void {
    if (!this.agvStatusPolling) return;
    this.agvStatusTimer = setTimeout(() => {
      void this.pollAgvStatus(ms);
    }, ms);
  }

  private async pollAgvStatus(ms: number): Promise<void> {
    const reqCode = generateReqCode();
    try {
      const statusRes = await this.rcsService.queryAgvStatus(reqCode);
      const availableAgv = statusRes.data.find(
        (a) =>
          a.status === '4' &&
          a.online &&
          a.robotCode !== this.currentTask?.robotCode &&
          isAtPosition(
            a.posX,
            a.posY,
            this.agvCfg.standbyPosition,
            this.agvCfg.positionTolerance,
          ),
      );
      const isReady = !!availableAgv;

      if (isReady !== this.lastAgvReadySignal) {
        this.lastAgvReadySignal = isReady;
        await this.onAgvReadyForPickupChanged(isReady);
        if (!isReady) {
          this.logger.warn(
            `No idle AGV at standby position ${this.agvCfg.standbyPosition}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`queryAgvStatus failed: ${(err as Error).message}`);
    } finally {
      this.scheduleAgvStatusPoll(ms);
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private recoverPersistedTask(): void {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const saved = JSON.parse(raw) as TaskContext;
      saved.startedAt = new Date(saved.startedAt);
      saved.updatedAt = new Date(saved.updatedAt);
      this.currentTask = saved;
      this.logger.warn(
        `[RECOVERY] Restored task ${saved.reqCode} in state ${saved.state} from disk`,
      );
      // Bug #6: Restore DO coils to match the recovered state so the PLC sees
      // the correct signals immediately after a WCS restart.
      void this.restoreCoilsForState(saved.state);
    } catch (err) {
      this.logger.error(
        `Failed to recover task state from disk: ${(err as Error).message}`,
      );
    }
  }

  // Bug #6: Write coils that correspond to a given in-flight state.
  // Called after crash recovery so the PLC is not left with stale OFF signals.
  private async restoreCoilsForState(state: TaskState): Promise<void> {
    // Start from all-off, then apply what should be on for the recovered state.
    await this.resetAllCoils();
    switch (state) {
      case TaskState.AGV_ENTERING:
        await this.tryWriteCoil(
          COIL.DO_REQUEST_TO_ENTER,
          true,
          'DO_REQUEST_TO_ENTER',
        );
        break;
      case TaskState.WAITING_FOR_PLC:
        await this.tryWriteCoil(
          COIL.DO_AGV_AT_DOCK_WAITING,
          true,
          'DO_AGV_AT_DOCK_WAITING',
        );
        break;
      case TaskState.AGV_EXITING:
        await this.tryWriteCoil(
          COIL.DO_REQUEST_TO_EXIT,
          true,
          'DO_REQUEST_TO_EXIT',
        );
        break;
      case TaskState.AGV_AT_DESTINATION:
        await this.tryWriteCoil(
          COIL.DO_AGV_TASK_COMPLETE,
          true,
          'DO_AGV_TASK_COMPLETE',
        );
        break;
      default:
        break;
    }
    this.logger.warn(`[RECOVERY] Coils restored for state ${state}`);
  }

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

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  // Bug #7: DO_AGV_IS_READY_FOR_PICKUP is managed exclusively by the AGV
  // status poller. Resetting it here would cause a flicker (OFF for up to 5 s)
  // followed by the poller turning it back ON on its next cycle. Instead we
  // reset lastAgvReadySignal so the poller re-evaluates and writes the correct
  // value on its next tick without any race.
  private async resetAllCoils(): Promise<void> {
    await Promise.all([
      this.tryWriteCoil(COIL.DO_REQUEST_TO_ENTER, false, 'DO_REQUEST_TO_ENTER'),
      this.tryWriteCoil(
        COIL.DO_AGV_AT_DOCK_WAITING,
        false,
        'DO_AGV_AT_DOCK_WAITING',
      ),
      this.tryWriteCoil(COIL.DO_REQUEST_TO_EXIT, false, 'DO_REQUEST_TO_EXIT'),
      this.tryWriteCoil(
        COIL.DO_AGV_TASK_COMPLETE,
        false,
        'DO_AGV_TASK_COMPLETE',
      ),
    ]);
    // Force the poller to re-check and re-write DO0 on the next cycle.
    this.lastAgvReadySignal = null;
    this.logger.log('All DO coils reset to OFF');
  }

  private transition(newState: TaskState, reason: string): void {
    const oldState = this.currentTask!.state;
    this.currentTask!.state = newState;
    this.currentTask!.updatedAt = new Date();
    this.logger.log(
      `[${this.currentTask!.reqCode}] ${oldState} → ${newState} (${reason})`,
    );
  }

  getCurrentTaskState(): TaskState | null {
    return this.currentTask?.state ?? null;
  }

  getCurrentTaskRcsTaskCode(): string | null {
    return this.currentTask?.rcsTaskCode ?? null;
  }

  getCurrentTask(): Readonly<typeof this.currentTask> {
    return this.currentTask;
  }

  // Manual operator reset — clears the in-flight task and resets all DO coils.
  // Does NOT call RCS cancelTask; use this when RCS already considers the task
  // finished/cancelled or when the AGV has been manually moved away.
  async forceResetTask(): Promise<{
    cleared: boolean;
    prevState: string | null;
  }> {
    const prevState = this.currentTask?.state ?? null;
    if (this.processingCallback) {
      this.logger.warn('[forceReset] state machine is busy — resetting lock');
      this.processingCallback = false;
    }
    await this.resetAllCoils();
    this.currentTask = null;
    this.persistTask();
    this.logger.warn(
      `[forceReset] Task force-reset by operator (was: ${prevState ?? 'none'})`,
    );
    this.audit.log('force_reset', { prevState });
    return { cleared: true, prevState };
  }

  // ─── Step 1: AGV ready at standby ────────────────────────────────────────

  private async onAgvReadyForPickupChanged(isReady: boolean): Promise<void> {
    await this.tryWriteCoil(
      COIL.DO_AGV_IS_READY_FOR_PICKUP,
      isReady,
      'DO_AGV_IS_READY_FOR_PICKUP',
    );
    if (isReady) {
      this.logger.log(
        'AGV is at standby position and idle — DO_AGV_IS_READY_FOR_PICKUP → ON',
      );
      this.audit.log('agv_ready_at_standby');
    }
  }

  // ─── Step 2: PLC requests pickup → dispatch ───────────────────────────────

  async onPlcRequestPickup(): Promise<void> {
    if (
      this.currentTask &&
      this.currentTask.state !== TaskState.IDLE &&
      this.currentTask.state !== TaskState.COMPLETED
    ) {
      this.logger.warn(
        `PLC request pickup but task already running in state ${this.currentTask.state} — ignoring`,
      );
      return;
    }

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

    // const availableAgv = statusRes.data.find(
    //   (a) => a.status === '4' && a.online,
    // );
    // const isReady =
    //   !!availableAgv &&
    //   isAtPosition(
    //     availableAgv.posX,
    //     availableAgv.posY,
    //     this.agvCfg.standbyPosition,
    //     this.agvCfg.positionTolerance,
    //   );

    // if (!isReady) {
    //   this.logger.warn(
    //     `PLC request pickup but no idle online AGV found (statuses: ${statusRes.data.map((a) => `${a.robotCode}:${a.status}:online=${String(a.online)}`).join(', ')}) — aborting dispatch`,
    //   );
    //   return;
    // }

    // Find all idle AGVs at the standby zone
    const candidates = statusRes.data.filter(
      (a) =>
        a.status === '4' &&
        a.online &&
        isAtPosition(
          a.posX,
          a.posY,
          this.agvCfg.standbyPosition,
          this.agvCfg.positionTolerance,
        ),
    );
    // .sort((a, b) => parseInt(b.battery) - parseInt(a.battery)); // highest battery first
    const selectedAgv = candidates[0];

    if (!selectedAgv) {
      this.logger.warn(
        `PLC request pickup but no idle AGV at standby (all: ${statusRes.data.map((a) => `${a.robotCode}:${a.status}`).join(', ')})`,
      );
      return;
    }

    this.logger.log(
      `PLC request pickup — idle AGV ${selectedAgv?.robotCode} found, auto-dispatching`,
    );
    this.audit.log('plc_request_pickup', {
      reqCode,
      robotCode: selectedAgv.robotCode,
    });

    await this.dispatch(
      reqCode,
      selectedAgv.robotCode,
      this.agvCfg.standbyPosition,
      this.agvCfg.dockPosition,
      this.agvCfg.notificationPosition,
      this.agvCfg.destinationPosition,
    );
  }

  async dispatch(
    reqCode: string,
    robotCode: string,
    standbyPosition: string,
    dockPosition: string,
    notificationPosition: string,
    destinationPosition: string,
  ): Promise<void> {
    if (
      this.currentTask &&
      this.currentTask.state !== TaskState.IDLE &&
      this.currentTask.state !== TaskState.COMPLETED
    ) {
      throw new Error(
        `Cannot dispatch: a task is already running in state ${this.currentTask.state}`,
      );
    }

    const response = await this.rcsService.genAgvSchedulingTask({
      reqCode,
      taskTyp: 'F01new',
      positionCodePath: [
        { positionCode: dockPosition, type: '00' },
        { positionCode: notificationPosition, type: '00' },
        { positionCode: destinationPosition, type: '00' },
        { positionCode: standbyPosition, type: '00' },
      ],
      priority: '1',
      podDir: '180',
      agvCode: robotCode,
    });

    this.currentTask = {
      state: TaskState.AGV_ENTERING,
      reqCode,
      rcsTaskCode: response.data,
      robotCode,
      standbyPosition,
      dockPosition,
      notificationPosition,
      destinationPosition,
      startedAt: new Date(),
      updatedAt: new Date(),
    };
    this.persistTask();

    this.audit.log('task_dispatched', {
      reqCode,
      rcsTaskCode: response.data,
      standbyPosition,
      dockPosition,
      notificationPosition,
      destinationPosition,
    });
  }

  // ─── RCS callback routers ─────────────────────────────────────────────────

  // Bug #5 (extended): Single mutex covering ALL state-machine transitions —
  // both RCS callbacks and PLC-triggered events. Prevents stale duplicate RCS
  // callbacks from racing in the instant after onGoodsLoaded / onTaskComplete
  // releases the AGV and transitions state.
  private acquireLock(caller: string): boolean {
    if (this.processingCallback) {
      this.logger.warn(`[lock] ${caller}: state machine busy — dropping`);
      return false;
    }
    this.processingCallback = true;
    return true;
  }

  private releaseLock(): void {
    this.processingCallback = false;
  }

  async onBeginCallback(taskCode: string, robotCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onBeginCallback: no matching active task — ignoring`,
      );
      return;
    }
    if (this.currentTask.robotCode !== robotCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onBeginCallback: robotCode mismatch (expected ${this.currentTask.robotCode}, got ${robotCode}) — ignoring`,
      );
      return;
    }
    if (!this.acquireLock(`onBeginCallback[${taskCode}]`)) return;
    try {
      switch (this.currentTask.state) {
        case TaskState.AGV_ENTERING:
          await this.onAgvRequestToEnter(taskCode);
          break;

        case TaskState.AGV_EXITING:
          await this.onAgvRequestToExit(taskCode);
          break;

        case TaskState.AGV_AT_NOTIFICATION:
          // AGV starting leg 3 (notification → destination) — no coil action needed
          this.transition(
            TaskState.AGV_TO_DESTINATION,
            'RCS begin — AGV moving toward destination',
          );
          this.persistTask();
          break;

        default:
          this.logger.warn(
            `[taskCode=${taskCode}] onBeginCallback: unexpected state ${this.currentTask.state} — ignoring`,
          );
      }
    } finally {
      this.releaseLock();
    }
  }

  async onCompleteCallback(taskCode: string, robotCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onCompleteCallback: no matching active task — ignoring`,
      );
      return;
    }
    if (this.currentTask.robotCode !== robotCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onCompleteCallback: robotCode mismatch (expected ${this.currentTask.robotCode}, got ${robotCode}) — ignoring`,
      );
      return;
    }
    if (!this.acquireLock(`onCompleteCallback[${taskCode}]`)) return;
    try {
      switch (this.currentTask.state) {
        case TaskState.AGV_ENTERING:
          await this.onAgvArrivedAtDock(taskCode);
          break;

        case TaskState.AGV_EXITING:
          await this.onAgvAtNotification(taskCode);
          break;

        case TaskState.AGV_AT_NOTIFICATION: // leg 3 begin callback not configured — complete fires directly
        case TaskState.AGV_TO_DESTINATION:
          await this.onAgvAtDestination(taskCode);
          break;

        default:
          this.logger.warn(
            `[taskCode=${taskCode}] onCompleteCallback: unexpected state ${this.currentTask.state} — ignoring`,
          );
      }
    } finally {
      this.releaseLock();
    }
  }

  // ─── Step 3: AGV request to enter (begin leg 1) ───────────────────────────

  async onAgvRequestToEnter(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvRequestToEnter: no matching active task — ignoring`,
      );
      return;
    }
    this.transition(
      TaskState.AGV_ENTERING,
      'RCS begin — AGV moving toward dock',
    );
    this.persistTask();
    await this.tryWriteCoil(
      COIL.DO_REQUEST_TO_ENTER,
      true,
      'DO_REQUEST_TO_ENTER',
    );
    this.logger.log(`[taskCode=${taskCode}] DO_REQUEST_TO_ENTER → ON`);
    this.audit.log('agv_request_to_enter', {
      reqCode: this.currentTask.reqCode,
      taskCode,
    });
  }

  // ─── Step 4: AGV arrived at dock (complete leg 1) ─────────────────────────

  async onAgvArrivedAtDock(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvArrivedAtDock: no matching active task — ignoring`,
      );
      return;
    }
    this.transition(TaskState.WAITING_FOR_PLC, 'AGV arrived at dock');
    await this.tryWriteCoil(
      COIL.DO_REQUEST_TO_ENTER,
      false,
      'DO_REQUEST_TO_ENTER',
    );
    await this.tryWriteCoil(
      COIL.DO_AGV_AT_DOCK_WAITING,
      true,
      'DO_AGV_AT_DOCK_WAITING',
    );
    this.persistTask();
    this.audit.log('agv_arrived_at_dock', {
      reqCode: this.currentTask.reqCode,
      taskCode,
    });
  }

  // ─── Step 5: Goods loaded → continueTask to notification ──────────────────

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
    if (!this.acquireLock('onGoodsLoaded')) return;
    try {
      // Bug #2: Turn DO_AGV_AT_DOCK_WAITING OFF before releasing the AGV so the
      // PLC knows the dock is clear the moment goods are confirmed loaded.
      await this.tryWriteCoil(
        COIL.DO_AGV_AT_DOCK_WAITING,
        false,
        'DO_AGV_AT_DOCK_WAITING',
      );

      try {
        await this.rcsService.continueTask({
          reqCode: generateReqCode(),
          taskCode: this.currentTask.rcsTaskCode,
          // nextPositionCode: {
          //   positionCode: this.currentTask.notificationPosition,
          //   type: '00',
          // },
        });
      } catch (err) {
        // Roll back DO2 — continueTask failed so the AGV is still at the dock.
        await this.tryWriteCoil(
          COIL.DO_AGV_AT_DOCK_WAITING,
          true,
          'DO_AGV_AT_DOCK_WAITING',
        );
        this.logger.error(
          `[${this.currentTask.reqCode}] continueTask (→notification) failed — staying in WAITING_FOR_PLC: ${(err as Error).message}`,
        );
        return;
      }

      this.transition(
        TaskState.AGV_EXITING,
        'RCS confirmed continueTask — AGV departing dock toward destination',
      );
      this.persistTask();
      this.logger.log(
        `[${this.currentTask.reqCode}] AGV departing dock toward notification point ${this.currentTask.notificationPosition}`,
      );
      this.audit.log('goods_loaded', {
        reqCode: this.currentTask.reqCode,
        taskCode: this.currentTask.rcsTaskCode,
      });
    } finally {
      this.releaseLock();
    }
  }

  // ─── Step 6: AGV request to exit (begin leg 2) ────────────────────────────

  async onAgvRequestToExit(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvRequestToExit: no matching active task — ignoring`,
      );
      return;
    }
    this.transition(
      TaskState.AGV_EXITING,
      'RCS begin — AGV moving toward notification point',
    );
    this.persistTask();
    await this.tryWriteCoil(
      COIL.DO_REQUEST_TO_EXIT,
      true,
      'DO_REQUEST_TO_EXIT',
    );
    this.logger.log(`[taskCode=${taskCode}] DO_REQUEST_TO_EXIT → ON`);
    this.audit.log('agv_request_to_exit', {
      reqCode: this.currentTask.reqCode,
      taskCode,
    });
  }

  // ─── Step 7: AGV at notification point (complete leg 2) ───────────────────

  async onAgvAtNotification(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvAtNotification: no matching active task — ignoring`,
      );
      return;
    }

    this.transition(
      TaskState.AGV_AT_NOTIFICATION,
      'AGV arrived at notification point',
    );
    await this.tryWriteCoil(
      COIL.DO_REQUEST_TO_EXIT,
      false,
      'DO_REQUEST_TO_EXIT',
    );

    try {
      await this.rcsService.continueTask({
        reqCode: generateReqCode(),
        taskCode: this.currentTask.rcsTaskCode,
        // nextPositionCode: {
        //   positionCode: this.currentTask.destinationPosition,
        //   type: '00',
        // },
      });
    } catch (err) {
      this.logger.error(
        `[${this.currentTask.reqCode}] continueTask (→destination) failed — staying in AGV_AT_NOTIFICATION: ${(err as Error).message}`,
      );
      this.persistTask();
      return;
    }

    this.persistTask();
    this.logger.log(
      `[${this.currentTask.reqCode}] AGV departing notification point toward destination ${this.currentTask.destinationPosition}`,
    );
    this.audit.log('agv_at_notification', {
      reqCode: this.currentTask.reqCode,
      taskCode,
    });
  }

  // ─── Step 8: AGV at destination (complete leg 3) ──────────────────────────

  async onAgvAtDestination(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onAgvAtDestination: no matching active task — ignoring`,
      );
      return;
    }
    this.transition(TaskState.AGV_AT_DESTINATION, 'AGV arrived at destination');
    this.persistTask();
    await this.tryWriteCoil(
      COIL.DO_AGV_TASK_COMPLETE,
      true,
      'DO_AGV_TASK_COMPLETE',
    );
    this.logger.log(`[taskCode=${taskCode}] DO_AGV_TASK_COMPLETE → ON`);
    this.audit.log('agv_at_destination', {
      reqCode: this.currentTask.reqCode,
      taskCode,
    });
  }

  // ─── Step 9: Goods unloaded → continueTask back to standby ───────────────

  async onTaskComplete(taskCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onTaskComplete: no matching active task — ignoring`,
      );
      return;
    }

    // Bug #3: Only accept the unload signal when the AGV has actually arrived
    // at the destination. Firing DI2 earlier (accidentally or maliciously)
    // would otherwise complete the task while the AGV is still in transit.
    if (this.currentTask.state !== TaskState.AGV_AT_DESTINATION) {
      this.logger.warn(
        `[taskCode=${taskCode}] onTaskComplete: unexpected state ${this.currentTask.state} — ignoring (expected AGV_AT_DESTINATION)`,
      );
      return;
    }

    if (!this.acquireLock(`onTaskComplete[${taskCode}]`)) return;
    try {
      this.audit.log('goods_unloaded', {
        reqCode: this.currentTask.reqCode,
        taskCode,
      });

      // Send AGV back to standby
      try {
        await this.rcsService.continueTask({
          reqCode: generateReqCode(),
          taskCode: this.currentTask.rcsTaskCode,
          // nextPositionCode: {
          //   positionCode: this.currentTask.standbyPosition,
          //   type: '00',
          // },
        });
      } catch (err) {
        this.logger.error(
          `[${this.currentTask.reqCode}] continueTask (→standby) failed: ${(err as Error).message}`,
        );
      }

      this.transition(TaskState.COMPLETED, 'Goods unloaded — task complete');
      this.persistTask();

      this.audit.log('task_complete', {
        reqCode: this.currentTask.reqCode,
        taskCode,
      });

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
    } finally {
      this.releaseLock();
    }
  }

  // ─── Cancel (RCS-initiated) ───────────────────────────────────────────────

  async onTaskCancelled(taskCode: string, robotCode: string): Promise<void> {
    if (!this.currentTask || this.currentTask.rcsTaskCode !== taskCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] Received cancel for unknown task — ignoring`,
      );
      return;
    }
    // Multi-AGV safety: reject callbacks from AGVs not assigned to this task
    if (this.currentTask.robotCode !== robotCode) {
      this.logger.warn(
        `[taskCode=${taskCode}] onTaskCancelled: robotCode mismatch (expected ${this.currentTask.robotCode}, got ${robotCode}) — ignoring`,
      );
      return;
    }

    this.transition(TaskState.IDLE, 'Task cancelled by RCS');
    await this.resetAllCoils();
    this.currentTask = null;
    this.persistTask();
    this.logger.log(`[taskCode=${taskCode}] Task cancelled and cleared`);
  }
}
