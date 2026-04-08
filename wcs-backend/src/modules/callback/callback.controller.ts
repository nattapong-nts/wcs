import { Body, Controller, Post } from '@nestjs/common';
import { CallbackService } from './callback.service';
import type {
  AgvCallbackPayload,
  AgvCallbackResponse,
} from '../rcs/rcs.interfaces';

@Controller('callback')
export class CallbackController {
  constructor(private readonly callbackService: CallbackService) {}

  @Post('wcs')
  async handleAgvCallback(
    @Body() body: AgvCallbackPayload,
  ): Promise<AgvCallbackResponse> {
    return await this.callbackService.handleRcsAgvCallback(body);
  }
}
