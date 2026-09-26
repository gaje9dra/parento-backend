export const APPLICATION_RULE_ACTIONS = ['ALLOW', 'BLOCK'] as const;
export type ApplicationRuleAction = (typeof APPLICATION_RULE_ACTIONS)[number];

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

export type ApplicationInstallState =
  'INSTALLED' | 'UPDATED' | 'UNINSTALLED' | 'UNKNOWN';

export interface ApplicationInventoryItem {
  readonly managedDeviceId: string;
  readonly packageName: string;
  readonly label: string | null;
  readonly versionName: string | null;
  readonly versionCode: number | null;
  readonly installState: ApplicationInstallState;
  readonly enabled: boolean | null;
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly lastReceivedAt: Date;
  readonly sourceCategory: string | null;
}

export interface ApplicationPolicyRule {
  readonly policyId: string;
  readonly packageName: string;
  readonly action: ApplicationRuleAction;
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
  readonly rules: readonly ApplicationPolicyRule[];
}

export interface ApplicationPolicyAssignment {
  readonly managedDeviceId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly assignedAt: Date;
  readonly updatedAt: Date;
  readonly assignedBy: string;
}

export interface ApplicationPolicySyncState {
  readonly managedDeviceId: string;
  readonly desiredPolicyId: string | null;
  readonly desiredPolicyVersion: number | null;
  readonly reportedPolicyId: string | null;
  readonly reportedPolicyVersion: number | null;
  readonly status: ApplicationEnforcementStatus;
  readonly lastRequestedAt: Date | null;
  readonly lastReportedAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly updatedAt: Date;
}

export const isValidAndroidPackageName = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(value) &&
  value.length <= 255;
