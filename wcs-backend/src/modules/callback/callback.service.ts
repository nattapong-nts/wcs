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
        case 'begin':
          await this.taskService.onBeginCallback(
            payload.taskCode,
            payload.robotCode,
          );
          break;

        case 'complete':
          await this.taskService.onCompleteCallback(
            payload.taskCode,
            payload.robotCode,
          );
          break;

        case 'out':
          this.logger.log(
            `[agvCallback] Out callback received for taskCode=${payload.taskCode} — no action`,
          );
          break;

        case 'cancel':
          await this.taskService.onTaskCancelled(
            payload.taskCode,
            payload.robotCode,
          );
          break;

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
