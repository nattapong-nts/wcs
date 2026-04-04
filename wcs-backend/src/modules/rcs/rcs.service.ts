import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import rcsConfig from 'src/config/rcs.config';
import type { ConfigType } from '@nestjs/config';
import {
  AgvCancelTaskRequest,
  AgvCancelTaskResponse,
  AgvContinueTaskRequest,
  AgvContinueTaskResponse,
  AgvSchedulingTaskRequest,
  AgvSchedulingTaskResponse,
  AgvStatusRequest,
  AgvStatusResponse,
} from './rcs.interfaces';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RcsService {
  private readonly logger = new Logger(RcsService.name);

  constructor(
    @Inject(rcsConfig.KEY)
    private readonly config: ConfigType<typeof rcsConfig>,
    private readonly httpService: HttpService,
  ) {}

  async genAgvSchedulingTask(
    request: AgvSchedulingTaskRequest,
  ): Promise<AgvSchedulingTaskResponse> {
    this.logger.log(
      `Generating AGV scheduling task for request: ${JSON.stringify(request)}`,
    );

    // const mockResponse: AgvSchedulingTaskResponse = {
    //   code: '0',
    //   data: '1234567890',
    //   interrupt: false,
    //   message: 'success',
    //   reqCode: request.reqCode,
    // };

    // return mockResponse;

    const url = `${this.config.baseUrl}${this.config.genAgvSchedulingTaskApiPath}`;
    const response = await this.executeWithRetry<AgvSchedulingTaskResponse>(
      () =>
        firstValueFrom(
          this.httpService.post<AgvSchedulingTaskResponse>(url, request, {
            headers: this.getHeaders(),
          }),
        ),
    );

    if (!response || typeof response.code !== 'string') {
      throw new Error(
        `RCS returned invalid response shape: ${JSON.stringify(response)}`,
      );
    }

    if (response.code !== '0') {
      this.logger.error(
        `AGV scheduling task failed: code=${response.code}, message=${response.message}`,
      );
      throw new Error(
        `RCS scheduling task failed (code: ${response.code}): ${response.message}`,
      );
    }

    this.logger.log(
      `AGV scheduling task created: rcsTaskId=${response.data}, reqCode=${request.reqCode}`,
    );
    return response;
  }

  async continueTask(
    request: AgvContinueTaskRequest,
  ): Promise<AgvContinueTaskResponse> {
    this.logger.log(
      `Continuing AGV task for request: ${JSON.stringify(request)}`,
    );

    // // mock response
    // return { code: '0', message: 'success', reqCode: request.reqCode };

    const url = `${this.config.baseUrl}${this.config.continueAgvTaskApiPath}`;
    const response = await this.executeWithRetry<AgvContinueTaskResponse>(() =>
      firstValueFrom(
        this.httpService.post<AgvContinueTaskResponse>(url, request, {
          headers: this.getHeaders(),
        }),
      ),
    );

    if (!response || typeof response.code !== 'string') {
      throw new Error(
        `RCS returned invalid response shape: ${JSON.stringify(response)}`,
      );
    }

    if (response.code !== '0') {
      this.logger.error(
        `AGV task continuation failed: code=${response.code}, message=${response.message}`,
      );
      throw new Error(
        `RCS task continuation failed (code: ${response.code}): ${response.message}`,
      );
    }

    this.logger.log(`AGV task continued: reqCode=${request.reqCode}`);
    return response;
  }

  async queryAgvStatus(reqCode: string): Promise<AgvStatusResponse> {
    this.logger.log(`Querying AGV status: reqCode=${reqCode}`);

    // const mockResponse: AgvStatusResponse = {
    //   code: '0',
    //   data: [
    //     {
    //       robotCode: 'SIM-001',
    //       status: '4',
    //       online: true,
    //       battery: '100',
    //       posX: '0',
    //       posY: '0',
    //       speed: '0',
    //       mapCode: 'SIM',
    //     },
    //   ],
    //   interrupt: false,
    //   message: 'success',
    //   reqCode,
    // };

    // return mockResponse;

    const request: AgvStatusRequest = { reqCode };
    const url = `${this.config.baseUrl}/rcms/services/rest/hikRpcService/queryAgvStatus`;
    const response = await this.executeWithRetry<AgvStatusResponse>(() =>
      firstValueFrom(
        this.httpService.post<AgvStatusResponse>(url, request, {
          headers: this.getHeaders(),
        }),
      ),
    );

    if (!response || typeof response.code !== 'string') {
      throw new Error(
        `RCS returned invalid response shape: ${JSON.stringify(response)}`,
      );
    }

    if (response.code !== '0') {
      this.logger.error(
        `queryAgvStatus failed: code=${response.code}, message=${response.message}`,
      );
      throw new Error(
        `RCS queryAgvStatus failed (code: ${response.code}): ${response.message}`,
      );
    }

    this.logger.log(
      `AGV status: ${response.data.map((a) => `${a.robotCode}:status=${a.status}:online=${String(a.online)}`).join(', ')}`,
    );
    return response;
  }

  async cancelTask(
    request: AgvCancelTaskRequest,
  ): Promise<AgvCancelTaskResponse> {
    this.logger.log(`Cancelling AGV task: ${JSON.stringify(request)}`);

    const url = `${this.config.baseUrl}/rcms/services/rest/hikRpcService/cancelTask`;
    const response = await this.executeWithRetry<AgvCancelTaskResponse>(() =>
      firstValueFrom(
        this.httpService.post<AgvCancelTaskResponse>(
          url,
          { ...request, forceCancel: request.forceCancel ?? '0' },
          { headers: this.getHeaders() },
        ),
      ),
    );

    if (!response || typeof response.code !== 'string') {
      throw new Error(
        `RCS returned invalid response shape: ${JSON.stringify(response)}`,
      );
    }

    if (response.code !== '0') {
      this.logger.error(
        `AGV task cancel failed: code=${response.code}, message=${response.message}`,
      );
      throw new Error(
        `RCS cancel task failed (code: ${response.code}): ${response.message}`,
      );
    }

    this.logger.log(`AGV task cancelled: reqCode=${request.reqCode}`);
    return response;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }
    return headers;
  }

  private async executeWithRetry<T>(
    operation: () => Promise<{ data: T }>,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await operation();
        return response.data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `RCS request failed (attempt ${attempt}/${this.config.retryAttempts}): ${lastError.message}`,
        );

        if (attempt < this.config.retryAttempts) {
          await this.sleep(this.config.retryDelay * attempt);
        }
      }
    }

    this.logger.error(
      `RCS request failed after ${this.config.retryAttempts} attempts`,
    );

    throw lastError ?? new Error('RCS request failed');
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
