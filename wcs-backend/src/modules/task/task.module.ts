import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { ModbusModule } from '../modbus/modbus.module';
import { RcsModule } from '../rcs/rcs.module';

@Module({
  imports: [ModbusModule, RcsModule],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
