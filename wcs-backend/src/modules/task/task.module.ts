import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskAuditService } from './task-audit.service';
import { ModbusModule } from '../modbus/modbus.module';
import { RcsModule } from '../rcs/rcs.module';

@Module({
  imports: [ModbusModule, RcsModule],
  providers: [TaskService, TaskAuditService],
  exports: [TaskService],
})
export class TaskModule {}
