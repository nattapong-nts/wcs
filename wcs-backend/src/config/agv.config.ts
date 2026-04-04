import { registerAs } from '@nestjs/config';

export default registerAs('agv', () => ({
  standbyPosition: process.env.AGV_STANDBY_POSITION ?? '000000',
  dockPosition: process.env.AGV_DOCK_POSITION ?? '000000',
  destinationPosition: process.env.AGV_DESTINATION_POSITION ?? '000000',
}));
