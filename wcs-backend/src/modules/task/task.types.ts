export enum TaskState {
  IDLE = 'IDLE',
  AGV_IS_READY_FOR_PICKUP = 'AGV_IS_READY_FOR_PICKUP', // AGV at standby, ready
  AGV_ENTERING = 'AGV_ENTERING', // Step 3: AGV moving toward dock
  WAITING_FOR_PLC = 'WAITING_FOR_PLC', // Step 4: AGV at dock, waiting for goods to be loaded
  AGV_EXITING = 'AGV_EXITING', // Step 6: AGV moving from dock toward notification point
  AGV_AT_NOTIFICATION = 'AGV_AT_NOTIFICATION', // Step 7: AGV at notification point, continuing to destination
  AGV_TO_DESTINATION = 'AGV_TO_DESTINATION', // AGV moving from notification point to destination
  AGV_AT_DESTINATION = 'AGV_AT_DESTINATION', // Step 8: AGV arrived at destination, waiting for unload
  COMPLETED = 'COMPLETED', // Step 9: Task fully done, coils being cleared
}

export interface TaskContext {
  state: TaskState;
  reqCode: string; // unique ID we generated for this task
  rcsTaskCode: string; // task code RCS gave back (needed for continueTask)
  robotCode: string; // robot code RCS gave back (needed for continueTask)
  standbyPosition: string; // where AGV waits when idle (A)
  dockPosition: string; // where goods are loaded onto AGV (B)
  notificationPosition: string; // where AGV pauses so PLC can re-enable security sensor (C)
  destinationPosition: string; // where goods are unloaded (D)
  startedAt: Date;
  updatedAt: Date;
}
