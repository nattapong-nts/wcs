import { Module } from '@nestjs/common';
import { ModbusModule } from '../modbus/modbus.module';
import { TaskModule } from '../task/task.module';
import { PlcController } from './plc.controller';
import { PlcPollerService } from './plc-poller.service';
import { PlcStatusService } from './plc-status.service';

@Module({
  imports: [TaskModule, ModbusModule],
  controllers: [PlcController],
  providers: [PlcPollerService, PlcStatusService],
  exports: [PlcStatusService],
})
export class PlcModule {}
