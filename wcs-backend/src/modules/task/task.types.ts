export enum TaskState {
  IDLE = 'IDLE',
  AGV_IS_READY_FOR_PICKUP = 'AGV_IS_READY_FOR_PICKUP', // Step 2: AGV ready to pickup
  AGV_IN_SAFETY_ZONE = 'AGV_IN_SAFETY_ZONE', // Step 3: AGV crossed safety boundary
  WAITING_FOR_PLC = 'WAITING_FOR_PLC', // Step 4: AGV at dock, waiting for goods
  CONTINUING = 'CONTINUING', // Step 5: Goods loaded, AGV departing
  COMPLETED = 'COMPLETED', // Step 6: Task fully done
}

// This is the in-memory record of the current task
export interface TaskContext {
  state: TaskState;
  reqCode: string; // the unique ID we generated for this task
  rcsTaskCode: string; // the task code RCS gave back (needed for continueTask)
  standbyPosition: string; // intermediate stop — standby position (X)
  dockPosition: string; // intermediate stop — dock where goods are loaded (Y)
  destinationPosition: string; // final delivery point (used in continueTask) (Z)
  startedAt: Date;
  updatedAt: Date;
}
