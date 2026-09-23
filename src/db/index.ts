import type {
  Administrator,
  ApplicationRule,
  AuditEvent,
  DeviceCredential,
  DeviceEnrollment,
  DeviceEvent,
  ManagedDevice,
  Policy,
  WebsiteRule,
} from './entities.js';

export interface Database {
  readonly kind: 'abstract';
  readonly entities: {
    administrator: Administrator;
    managedDevice: ManagedDevice;
    deviceEnrollment: DeviceEnrollment;
    deviceCredential: DeviceCredential;
    policy: Policy;
    applicationRule: ApplicationRule;
    websiteRule: WebsiteRule;
    deviceEvent: DeviceEvent;
    auditEvent: AuditEvent;
  };
}

export const database: Database = {
  kind: 'abstract',
  entities: {
    administrator: {},
    managedDevice: {},
    deviceEnrollment: {},
    deviceCredential: {},
    policy: {},
    applicationRule: {},
    websiteRule: {},
    deviceEvent: {},
    auditEvent: {},
  },
};
