import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import agvConfig from 'src/config/agv.config';
import { COIL } from '../modbus/modbus.constants';
import { ModbusService } from '../modbus/modbus.service';
import { RcsService } from '../rcs/rcs.service';
import { TaskAuditService } from './task-audit.service';
import { TaskService } from './task.service';
import { TaskState } from './task.types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockModbus = {
  writeCoil: jest.fn().mockResolvedValue(undefined),
  readDiscreteInputs: jest.fn().mockResolvedValue([false, false, false]),
  readCoils: jest.fn().mockResolvedValue([false, false, false, false, false]),
  isConnected: true,
};

const mockRcs = {
  genAgvSchedulingTask: jest.fn().mockResolvedValue({
    code: '0',
    data: 'TASK-001',
    message: 'successful',
    reqCode: 'req1',
    interrupt: false,
  }),
  continueTask: jest.fn().mockResolvedValue({
    code: '0',
    message: 'successful',
    reqCode: 'req2',
  }),
  queryAgvStatus: jest.fn().mockResolvedValue({
    code: '0',
    data: [],
    interrupt: false,
    message: 'successful',
    reqCode: 'req3',
  }),
  cancelTask: jest.fn().mockResolvedValue({
    code: '0',
    message: 'successful',
    reqCode: 'req4',
  }),
};

const mockAudit = { log: jest.fn() };

const AGV_CFG = {
  standbyPosition: '012000BB012000',
  dockPosition: '012000BB011000',
  notificationPosition: '012000BB013000',
  destinationPosition: '012000BB014000',
  checkAgvStatusIntervalMs: 999999,
  positionTolerance: 100,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createService(): Promise<TaskService> {
  // Remove any persisted state before each test
  const stateFile = require('path').resolve(process.cwd(), 'task-state.json');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TaskService,
      { provide: agvConfig.KEY, useValue: AGV_CFG },
      { provide: ModbusService, useValue: mockModbus },
      { provide: RcsService, useValue: mockRcs },
      { provide: TaskAuditService, useValue: mockAudit },
    ],
  }).compile();

  const service = module.get(TaskService);
  // Skip onModuleInit (AGV polling + recovery) — we test those separately
  return service;
}

async function dispatchTask(service: TaskService): Promise<void> {
  await service.dispatch(
    'req-test',
    'AGV-001',
    AGV_CFG.standbyPosition,
    AGV_CFG.dockPosition,
    AGV_CFG.notificationPosition,
    AGV_CFG.destinationPosition,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await createService();
  });

  // ── dispatch ────────────────────────────────────────────────────────────

  describe('dispatch', () => {
    it('sets state to AGV_ENTERING and stores rcsTaskCode', async () => {
      await dispatchTask(service);
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_ENTERING);
      expect(service.getCurrentTaskRcsTaskCode()).toBe('TASK-001');
    });

    it('calls genAgvSchedulingTask with correct params', async () => {
      await dispatchTask(service);
      expect(mockRcs.genAgvSchedulingTask).toHaveBeenCalledWith(
        expect.objectContaining({
          reqCode: 'req-test',
          taskTyp: 'F01new',
          agvCode: 'AGV-001',
        }),
      );
    });

    it('throws if a task is already running', async () => {
      await dispatchTask(service);
      await expect(dispatchTask(service)).rejects.toThrow(
        /Cannot dispatch.*already running/,
      );
    });
  });

  // ── onBeginCallback ─────────────────────────────────────────────────────

  describe('onBeginCallback', () => {
    beforeEach(async () => {
      await dispatchTask(service);
    });

    it('writes DO_REQUEST_TO_ENTER ON in AGV_ENTERING state', async () => {
      await service.onBeginCallback('TASK-001', 'AGV-001');
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_REQUEST_TO_ENTER,
        true,
      );
    });

    it('ignores callback with wrong taskCode', async () => {
      await service.onBeginCallback('WRONG-TASK', 'AGV-001');
      expect(mockModbus.writeCoil).not.toHaveBeenCalledWith(
        COIL.DO_REQUEST_TO_ENTER,
        true,
      );
    });

    it('ignores callback with wrong robotCode', async () => {
      await service.onBeginCallback('TASK-001', 'WRONG-ROBOT');
      expect(mockModbus.writeCoil).not.toHaveBeenCalledWith(
        COIL.DO_REQUEST_TO_ENTER,
        true,
      );
    });
  });

  // ── onCompleteCallback — dock arrival ───────────────────────────────────

  describe('onCompleteCallback (dock arrival)', () => {
    beforeEach(async () => {
      await dispatchTask(service);
    });

    it('transitions to WAITING_FOR_PLC and writes DO2 ON', async () => {
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.WAITING_FOR_PLC);
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_REQUEST_TO_ENTER,
        false,
      );
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_AGV_AT_DOCK_WAITING,
        true,
      );
    });
  });

  // ── onGoodsLoaded ─────────────────────────────────────────────────────

  describe('onGoodsLoaded', () => {
    beforeEach(async () => {
      await dispatchTask(service);
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      mockModbus.writeCoil.mockClear();
      mockRcs.continueTask.mockClear();
    });

    it('transitions to AGV_EXITING, turns off DO2, calls continueTask', async () => {
      await service.onGoodsLoaded();
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_EXITING);
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_AGV_AT_DOCK_WAITING,
        false,
      );
      expect(mockRcs.continueTask).toHaveBeenCalledTimes(1);
    });

    it('rolls back DO2 if continueTask fails', async () => {
      mockRcs.continueTask.mockRejectedValueOnce(new Error('RCS down'));
      await service.onGoodsLoaded();
      expect(service.getCurrentTaskState()).toBe(TaskState.WAITING_FOR_PLC);
      // DO2 turned off then back on
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_AGV_AT_DOCK_WAITING,
        false,
      );
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_AGV_AT_DOCK_WAITING,
        true,
      );
    });

    it('ignores if not in WAITING_FOR_PLC', async () => {
      // Force state past WAITING_FOR_PLC
      await service.onGoodsLoaded(); // → AGV_EXITING
      mockRcs.continueTask.mockClear();
      await service.onGoodsLoaded();
      expect(mockRcs.continueTask).not.toHaveBeenCalled();
    });
  });

  // ── Full flow: dock → notification → destination ─────────────────────

  describe('full flow through notification to destination', () => {
    beforeEach(async () => {
      await dispatchTask(service);
      // Leg 1 complete → at dock
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      // Goods loaded → AGV_EXITING
      await service.onGoodsLoaded();
      mockModbus.writeCoil.mockClear();
      mockRcs.continueTask.mockClear();
    });

    it('complete callback at notification: turns off DO3, auto-continues', async () => {
      // Leg 2 complete → at notification
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_AT_NOTIFICATION);
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_REQUEST_TO_EXIT,
        false,
      );
      expect(mockRcs.continueTask).toHaveBeenCalledTimes(1);
    });

    it('complete callback at destination: writes DO4 ON', async () => {
      // Leg 2 complete
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      mockModbus.writeCoil.mockClear();
      // Leg 3 complete → at destination
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_AT_DESTINATION);
      expect(mockModbus.writeCoil).toHaveBeenCalledWith(
        COIL.DO_AGV_TASK_COMPLETE,
        true,
      );
    });
  });

  // ── onTaskComplete ────────────────────────────────────────────────────

  describe('onTaskComplete', () => {
    beforeEach(async () => {
      await dispatchTask(service);
      await service.onCompleteCallback('TASK-001', 'AGV-001'); // dock
      await service.onGoodsLoaded(); // exiting
      await service.onCompleteCallback('TASK-001', 'AGV-001'); // notification
      await service.onCompleteCallback('TASK-001', 'AGV-001'); // destination
      mockRcs.continueTask.mockClear();
    });

    it('transitions to COMPLETED and calls continueTask to standby', async () => {
      await service.onTaskComplete('TASK-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.COMPLETED);
      expect(mockRcs.continueTask).toHaveBeenCalledTimes(1);
    });

    it('rejects if not in AGV_AT_DESTINATION', async () => {
      await service.onTaskComplete('TASK-001'); // → COMPLETED
      mockRcs.continueTask.mockClear();
      await service.onTaskComplete('TASK-001');
      expect(mockRcs.continueTask).not.toHaveBeenCalled();
    });
  });

  // ── Mutex / lock ──────────────────────────────────────────────────────

  describe('mutex lock', () => {
    it('drops duplicate callback while lock is held', async () => {
      await dispatchTask(service);
      // Simulate slow callback: make writeCoil hang until we resolve
      let resolveCoil!: () => void;
      mockModbus.writeCoil.mockImplementationOnce(
        () => new Promise<void>((r) => (resolveCoil = r)),
      );

      const first = service.onBeginCallback('TASK-001', 'AGV-001');
      // While first is blocked on writeCoil, send a duplicate
      const second = service.onBeginCallback('TASK-001', 'AGV-001');
      resolveCoil();
      await first;
      await second;
      // writeCoil should have been called only once (the first callback)
      expect(mockModbus.writeCoil).toHaveBeenCalledTimes(1);
    });
  });

  // ── onTaskCancelled ───────────────────────────────────────────────────

  describe('onTaskCancelled', () => {
    beforeEach(async () => {
      await dispatchTask(service);
    });

    it('clears task and resets coils', async () => {
      await service.onTaskCancelled('TASK-001', 'AGV-001');
      expect(service.getCurrentTaskState()).toBeNull();
    });

    it('ignores cancel for wrong taskCode', async () => {
      await service.onTaskCancelled('WRONG', 'AGV-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_ENTERING);
    });

    it('ignores cancel for wrong robotCode', async () => {
      await service.onTaskCancelled('TASK-001', 'WRONG');
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_ENTERING);
    });
  });

  // ── forceResetTask ────────────────────────────────────────────────────

  describe('forceResetTask', () => {
    it('clears task and resets coils', async () => {
      await dispatchTask(service);
      const result = await service.forceResetTask();
      expect(result).toEqual({
        cleared: true,
        prevState: TaskState.AGV_ENTERING,
      });
      expect(service.getCurrentTaskState()).toBeNull();
    });

    it('works even with no active task', async () => {
      const result = await service.forceResetTask();
      expect(result).toEqual({ cleared: true, prevState: null });
    });
  });

  // ── 5s cleanup timer safety (Bug B) ───────────────────────────────────

  describe('cleanup timer does not clobber new task', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('timer from completed task does not affect a new task', async () => {
      // Complete the full flow
      await dispatchTask(service);
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      await service.onGoodsLoaded();
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      await service.onCompleteCallback('TASK-001', 'AGV-001');
      await service.onTaskComplete('TASK-001');
      expect(service.getCurrentTaskState()).toBe(TaskState.COMPLETED);

      // Force reset and start a new task before the 5s timer fires
      await service.forceResetTask();
      mockRcs.genAgvSchedulingTask.mockResolvedValueOnce({
        code: '0',
        data: 'TASK-002',
        message: 'successful',
        reqCode: 'req-new',
        interrupt: false,
      });
      await service.dispatch(
        'req-new',
        'AGV-002',
        AGV_CFG.standbyPosition,
        AGV_CFG.dockPosition,
        AGV_CFG.notificationPosition,
        AGV_CFG.destinationPosition,
      );
      expect(service.getCurrentTaskRcsTaskCode()).toBe('TASK-002');

      // Fire the old cleanup timer
      jest.advanceTimersByTime(6000);
      // Allow async .then() in setTimeout to flush
      await Promise.resolve();

      // New task must survive
      expect(service.getCurrentTaskState()).toBe(TaskState.AGV_ENTERING);
      expect(service.getCurrentTaskRcsTaskCode()).toBe('TASK-002');
    });
  });
});
