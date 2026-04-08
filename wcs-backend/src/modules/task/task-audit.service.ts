import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

@Injectable()
export class TaskAuditService {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.DailyRotateFile({
          dirname: './logs/task-audit',
          filename: 'task-events-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '7d',
          // zippedArchive: true,
        }),
      ],
    });
  }

  log(event: string, context: Record<string, unknown> = {}): void {
    this.logger.info({ event, ...context });
  }
}
