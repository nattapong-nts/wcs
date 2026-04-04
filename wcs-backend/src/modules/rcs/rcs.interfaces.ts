export interface AgvPositionCodePath {
  positionCode: string;
  type: string;
}

export interface AgvSchedulingTaskRequest {
  reqCode: string;
  taskTyp: string;
  positionCodePath: AgvPositionCodePath[];
  priority: string;
}

export interface AgvSchedulingTaskResponse {
  code: string;
  data: string;
  interrupt: boolean;
  message: string;
  reqCode: string;
}

export interface AgvContinueTaskRequest {
  reqCode: string;
  taskCode: string;
  nextPositionCode: AgvPositionCodePath;
}

export interface AgvContinueTaskResponse {
  code: string;
  message: string;
  reqCode: string;
}

export interface AgvCancelTaskRequest {
  reqCode: string;
  taskCode: string;
  forceCancel?: string; // "0" = put down at current location (default), "1" = carry back
}

export interface AgvCancelTaskResponse {
  code: string;
  message: string;
  reqCode: string;
}

export type AgvCallbackMethod = 'start' | 'out' | 'complete' | 'cancel' | 'ctu';

export interface AgvCallbackPayload {
  reqCode: string;
  method: AgvCallbackMethod;
  taskCode: string;
  robotCode: string;
  currentPositionCode?: string;
  podCode?: string;
  podDir?: string;
  mapCode?: string;
  mapDataCode?: string;
  cooX?: string;
  cooY?: string;
  wbCode?: string;
  stgBinCode?: string;
  ctnrCode?: string;
  ctnrTyp?: string;
  materialLot?: string;
  materialType?: string;
  roadWayCode?: string;
  seq?: string;
  eqpCode?: string;
  data?: string;
  reqTime?: string;
}

export interface AgvCallbackResponse {
  code: string;
  message: string;
  reqCode: string;
  data: string;
}

// status codes: "1"=task completed, "2"=executing task, "3"=abnormal task,
// "4"=idle, "5"=robot stopped, "7"=charging, "8"=curve movement, and others
export interface AgvStatusItem {
  robotCode: string;
  status: string;
  online: boolean;
  battery: string;
  posX: string;
  posY: string;
  speed: string;
  mapCode: string;
  podCode?: string;
  podDir?: string;
  robotDir?: string;
  robotIp?: string;
  stop?: string;
  exclType?: string;
  timestamp?: number;
}

export interface AgvStatusRequest {
  reqCode: string;
}

export interface AgvStatusResponse {
  code: string;
  data: AgvStatusItem[];
  interrupt: boolean;
  message: string;
  msgErrCode?: string;
  reqCode: string;
}
