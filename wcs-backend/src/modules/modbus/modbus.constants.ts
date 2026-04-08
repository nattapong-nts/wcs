export const COIL = {
  // Digital Inputs (your app READS these from PLC)
  DI_PLC_REQUEST_PICKUP: 0, // Step 2: PLC requests AGV dispatch
  DI_JOB_SETUP_COMPLETE: 1, // Step 5: Goods loaded on AGV at dock
  DI_ITEMS_UNLOADED: 2, // Step 9: PLC confirms goods unloaded at destination

  // Digital Outputs (your app WRITES these to notify PLC)
  DO_AGV_IS_READY_FOR_PICKUP: 0, // Step 1: AGV at standby and idle
  DO_REQUEST_TO_ENTER: 1, // Step 3: AGV moving toward dock (open entry gate/sensors)
  DO_AGV_AT_DOCK_WAITING: 2, // Step 4: AGV at dock, ready to receive goods
  DO_REQUEST_TO_EXIT: 3, // Step 6: AGV moving toward notification point (open exit gate/sensors)
  DO_AGV_TASK_COMPLETE: 4, // Step 8: AGV arrived at destination
} as const;
