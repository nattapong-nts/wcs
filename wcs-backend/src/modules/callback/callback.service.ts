import { Injectable, Logger } from '@nestjs/common';
import type {
  AgvCallbackPayload,
  AgvCallbackResponse,
} from '../rcs/rcs.interfaces';
import { TaskService } from '../task/task.service';

@Injectable()
export class CallbackService {
  private readonly logger = new Logger(CallbackService.name);

  constructor(private readonly taskService: TaskService) {}

  async handleRcsAgvCallback(
    payload: AgvCallbackPayload,
  ): Promise<AgvCallbackResponse> {
    this.logger.log(
      `[agvCallback] method=${payload.method} reqCode=${payload.reqCode} taskCode=${payload.taskCode}`,
    );

    try {
      switch (payload.method) {
        case 'start':
          await this.taskService.onAgvStarted(payload.taskCode);
          break;

        // case 'outbin': {
        //   // Fix #4/#6: Use atomic onAgvArrivedAtDock which tolerates missed "start"
        //   // callback and safely drives through multiple state transitions.
        //   await this.taskService.onAgvArrivedAtDock(payload.reqCode);
        //   break;
        // }

        case 'out':
          // Do nothing
          this.logger.log(
            `[agvCallback] Out callback received for taskCode=${payload.taskCode}`,
          );
          break;

        case 'complete':
          // await this.taskService.onTaskComplete(payload.reqCode);
          await this.taskService.onAgvArrivedAtDock(payload.taskCode);
          break;

        // case 'cancel':
        //   this.logger.warn(
        //     `[agvCallback] Task cancelled by RCS: reqCode=${payload.reqCode}`,
        //   );
        //   await this.taskService.onTaskCancelled(payload.reqCode);
        //   break;

        default:
          this.logger.warn(
            `[agvCallback] Unknown method: ${String(payload.method)}`,
          );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[agvCallback] Error processing method=${payload.method}: ${message}`,
      );
      return { code: '1', message, reqCode: payload.reqCode, data: '' };
    }

    return {
      code: '0',
      message: 'successful',
      reqCode: payload.reqCode,
      data: '',
    };
  }
}
