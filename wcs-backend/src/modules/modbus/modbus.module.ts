import { Module } from '@nestjs/common';
import { ModbusService } from './modbus.service';

@Module({
  providers: [ModbusService],
  exports: [ModbusService],
})
export class ModbusModule {}
