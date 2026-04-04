import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import modbusConfig from './config/modbus.config';
import rcsConfig from './config/rcs.config';
import { ModbusModule } from './modules/modbus/modbus.module';
import { RcsModule } from './modules/rcs/rcs.module';
import { TaskModule } from './modules/task/task.module';
import { CallbackModule } from './modules/callback/callback.module';
import { PlcModule } from './modules/plc/plc.module';
import agvConfig from './config/agv.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [rcsConfig, modbusConfig, agvConfig],
    }),
    RcsModule,
    ModbusModule,
    TaskModule,
    CallbackModule,
    PlcModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
