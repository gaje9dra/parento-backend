export const NETWORK_RULE_ACTIONS = ['ALLOW', 'BLOCK'] as const;
export type NetworkRuleAction = (typeof NETWORK_RULE_ACTIONS)[number];

export const NETWORK_POLICY_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type NetworkPolicyStatus = (typeof NETWORK_POLICY_STATUSES)[number];

export const NETWORK_ENFORCEMENT_STATUSES = [
  'UNKNOWN',
  'PENDING',
  'APPLIED',
  'PARTIALLY_APPLIED',
  'FAILED',
  'UNSUPPORTED',
  'STALE',
  'REVOKED',
] as const;
export type NetworkEnforcementStatus =
  (typeof NETWORK_ENFORCEMENT_STATUSES)[number];

export const NETWORK_POLICY_FRESHNESS = [
  'FRESH',
  'STALE',
  'VERY_STALE',
  'UNKNOWN',
  'NEVER_REPORTED',
] as const;
export type NetworkPolicyFreshness = (typeof NETWORK_POLICY_FRESHNESS)[number];

export const NETWORK_POLICY_CAPABILITY_MODES = [
  'UNKNOWN',
  'UNSUPPORTED',
  'SUPPORTED',
] as const;
export type NetworkPolicyCapabilityMode =
  (typeof NETWORK_POLICY_CAPABILITY_MODES)[number];

export interface NetworkPolicyRule {
  readonly id: string;
  readonly policyId: string;
  readonly domain: string;
  readonly action: NetworkRuleAction;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NetworkPolicy {
  readonly id: string;
  readonly adminId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: NetworkPolicyStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly rules: readonly NetworkPolicyRule[];
}

export interface NetworkPolicyAssignment {
  readonly managedDeviceId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly assignedAt: Date;
  readonly updatedAt: Date;
  readonly assignedBy: string;
}

export interface NetworkPolicySyncState {
  readonly managedDeviceId: string;
  readonly desiredPolicyId: string | null;
  readonly desiredPolicyVersion: number | null;
  readonly reportedPolicyId: string | null;
  readonly reportedPolicyVersion: number | null;
  readonly status: NetworkEnforcementStatus;
  readonly lastRequestedAt: Date | null;
  readonly lastReportedAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly updatedAt: Date;
}

export interface NetworkPolicyCapability {
  readonly managedDeviceId: string;
  readonly supported: boolean;
  readonly mode: NetworkPolicyCapabilityMode;
  readonly capabilityVersion: number | null;
  readonly reportedAt: Date;
  readonly updatedAt: Date;
}

export const normalizeDomain = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const wildcard = trimmed.startsWith('*.');
  const candidate = wildcard ? trimmed.slice(2) : trimmed;
  if (!candidate || candidate.includes('*')) throw new Error('Invalid domain.');
  if (candidate.length > 253) throw new Error('Domain is too long.');
  if (candidate.includes('/') || candidate.includes(':') || /[\u0000-\u001f\u007f]/.test(candidate)) {
    throw new Error('Invalid domain.');
  }
  const labels = candidate.split('.');
  if (labels.length < 2 || labels.some((label) => label.length < 1 || label.length > 63)) {
    throw new Error('Invalid domain.');
  }
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error('Invalid domain.');
  }
  return wildcard ? '*.' + candidate : candidate;
};

export const isValidNetworkDomain = (value: string): boolean => {
  try {
    normalizeDomain(value);
    return true;
  } catch {
    return false;
  }
};

export const networkRuleMatches = (ruleDomain: string, hostname: string): boolean => {
  const rule = normalizeDomain(ruleDomain);
  const host = normalizeDomain(hostname);
  if (!rule.startsWith('*.')) return host === rule;
  const suffix = rule.slice(2);
  return host.endsWith('.' + suffix) && host !== suffix;
};

export const compareNetworkRules = (
  a: NetworkPolicyRule,
  b: NetworkPolicyRule,
): number => {
  const aWildcard = a.domain.startsWith('*.');
  const bWildcard = b.domain.startsWith('*.');
  if (aWildcard !== bWildcard) return aWildcard ? 1 : -1;
  if (a.action !== b.action) return a.action === 'BLOCK' ? -1 : 1;
  return a.domain.localeCompare(b.domain);
};