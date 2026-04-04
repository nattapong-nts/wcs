import { registerAs } from '@nestjs/config';

export default registerAs('rcs', () => ({
  baseUrl: process.env.RCS_BASE_URL ?? '',
  apiKey: process.env.RCS_API_KEY ?? '',
  timeout: parseInt(process.env.RCS_TIMEOUT ?? '10000', 10),
  retryAttempts: parseInt(process.env.RCS_RETRY_ATTEMPTS ?? '3', 10),
  retryDelay: parseInt(process.env.RCS_RETRY_DELAY ?? '1000', 10),
  genAgvSchedulingTaskApiPath:
    process.env.RCS_GEN_AGV_SCHEDULING_TASK_API_PATH ?? '',
  continueAgvTaskApiPath: process.env.RCS_CONTINUE_AGV_TASK_API_PATH ?? '',
}));
