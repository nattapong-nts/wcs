import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RcsService } from './rcs.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('rcs.timeout', 10000),
        maxRedirects: 3,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RcsService],
  exports: [RcsService],
})
export class RcsModule {}
