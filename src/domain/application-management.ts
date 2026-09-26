export const APPLICATION_ACTIONS = ['ALLOW', 'BLOCK'] as const;
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];

export const APPLICATION_INSTALL_STATES = [
  'INSTALLED',
  'UNINSTALLED',
  'UNKNOWN',
] as const;
export type ApplicationInstallState =
  (typeof APPLICATION_INSTALL_STATES)[number];

export const APPLICATION_POLICY_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type ApplicationPolicyStatus =
  (typeof APPLICATION_POLICY_STATUSES)[number];

export const APPLICATION_ENFORCEMENT_STATUSES = [
  'UNKNOWN',
  'PENDING',
  'APPLIED',
  'PARTIALLY_APPLIED',
  'FAILED',
  'STALE',
] as const;
export type ApplicationEnforcementStatus =
  (typeof APPLICATION_ENFORCEMENT_STATUSES)[number];

export const APPLICATION_INVENTORY_FRESHNESS = [
  'FRESH',
  'STALE',
  'VERY_STALE',
  'NEVER_REPORTED',
  'DISCONNECTED',
  'REVOKED',
] as const;
export type ApplicationInventoryFreshness =
  (typeof APPLICATION_INVENTORY_FRESHNESS)[number];

export const APPLICATION_PACKAGE_NAME_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

export const isValidApplicationPackageName = (value: string): boolean =>
  value.length <= 255 && APPLICATION_PACKAGE_NAME_PATTERN.test(value);

export interface ApplicationInventoryItem {
  readonly managedDeviceId: string;
  readonly packageName: string;
  readonly label: string | null;
  readonly versionName: string | null;
  readonly versionCode: number | null;
  readonly installState: ApplicationInstallState;
  readonly enabled: boolean | null;
  readonly category: string | null;
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly receivedAt: Date;
}

export interface ApplicationInventoryState {
  readonly managedDeviceId: string;
  readonly synchronizationId: string | null;
  readonly observedAt: Date | null;
  readonly receivedAt: Date | null;
}

export interface ApplicationPolicyRule {
  readonly id: string;
  readonly policyId: string;
  readonly packageName: string;
  readonly action: ApplicationAction;
}

export interface ApplicationPolicy {
  readonly id: string;
  readonly adminId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: ApplicationPolicyStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly rules: ApplicationPolicyRule[];
}

export interface ApplicationPolicyAssignment {
  readonly managedDeviceId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly assignedAt: Date;
  readonly assignedBy: string;
}

export interface ApplicationEnforcementState {
  readonly managedDeviceId: string;
  readonly desiredPolicyId: string | null;
  readonly desiredPolicyVersion: number | null;
  readonly reportedPolicyId: string | null;
  readonly reportedPolicyVersion: number | null;
  readonly status: ApplicationEnforcementStatus;
  readonly synchronizationRequired: boolean;
  readonly synchronizationRequestedAt: Date | null;
  readonly lastReportedAt: Date | null;
  readonly failureCode: string | null;
}

export const calculateInventoryFreshness = (
  deviceStatus: { enrollmentStatus: string; operationalStatus: string },
  lastReceivedAt: Date | null,
  now: Date,
  staleSeconds: number,
  veryStaleSeconds: number,
  connected: boolean,
): ApplicationInventoryFreshness => {
  if (
    deviceStatus.enrollmentStatus === 'REVOKED' ||
    deviceStatus.operationalStatus === 'REVOKED'
  )
    return 'REVOKED';
  if (lastReceivedAt === null) return 'NEVER_REPORTED';
  if (!connected) return 'DISCONNECTED';
  const age = Math.max(0, now.getTime() - lastReceivedAt.getTime()) / 1000;
  if (age >= veryStaleSeconds) return 'VERY_STALE';
  if (age >= staleSeconds) return 'STALE';
  return 'FRESH';
};
