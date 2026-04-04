import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch(NotFoundException)
export class NotFoundExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(NotFoundExceptionFilter.name);

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    this.logger.warn(
      `Route not found: ${request.method} ${request.url} | Body: ${JSON.stringify(request.body)}`,
    );

    response.status(status).json({
      code: '404',
      message: `Cannot ${request.method} ${request.url}`,
      reqCode: '',
      data: '',
    });
  }
}
