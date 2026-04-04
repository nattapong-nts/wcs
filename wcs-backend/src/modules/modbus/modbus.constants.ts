export const COIL = {
  // Digital Inputs (your app READS these from PLC)
  DI_PLC_REQUEST_PICKUP: 100, // Step 2: PLC ready, send AGV now
  DI_JOB_SETUP_COMPLETE: 101, // Step 5: Goods loaded on AGV
  DI_ITEMS_UNLOADED: 102, // Step 6: PLC confirms done

  // Digital Outputs (your app WRITES these to notify PLC)
  DO_AGV_IS_READY_FOR_PICKUP: 0, // Step 1: AGV heading to dock
  DO_AGV_IN_SAFETY_ZONE: 1, // Step 3: AGV crossed safety boundary
  DO_AGV_AT_DOCK_WAITING: 2, // Step 4: AGV at dock, ready for goods
  DO_AGV_CONTINUING: 3, // Step 5: AGV received goods, departing
  DO_AGV_TASK_COMPLETE: 4, // Step 6: AGV task finished
} as const;
