export type DeviceConnectionState='UNKNOWN'|'CONNECTING'|'CONNECTED'|'DISCONNECTED'|'STALE';
export interface DeviceSession {
 readonly id:string; readonly managedDeviceId:string; readonly credentialId:string; readonly state:DeviceConnectionState;
 readonly createdAt:Date; readonly lastActivityAt:Date; readonly connectedAt:Date|null; readonly disconnectedAt:Date|null; readonly expiresAt:Date;
}
