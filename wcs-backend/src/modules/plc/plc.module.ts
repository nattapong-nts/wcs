import { Module } from '@nestjs/common';
import { ModbusModule } from '../modbus/modbus.module';
import { TaskModule } from '../task/task.module';
import { PlcPollerService } from './plc-poller.service';

@Module({
  imports: [TaskModule, ModbusModule],
  providers: [PlcPollerService],
})
export class PlcModule {}
