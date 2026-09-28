import { describe, expect, it } from 'vitest';
import { isValidNetworkDomain, networkRuleMatches, normalizeDomain } from '../src/domain/network-policy.js';

describe('network policy domain validation', () => {
  it('normalizes exact domains deterministically', () => {
    expect(normalizeDomain(' Example.COM ')).toBe('example.com');
  });
  it('accepts explicit subdomain wildcards only', () => {
    expect(normalizeDomain('*.Example.com')).toBe('*.example.com');
    expect(networkRuleMatches('*.example.com', 'www.example.com')).toBe(true);
    expect(networkRuleMatches('*.example.com', 'example.com')).toBe(false);
  });
  it('rejects ambiguous or malformed hostnames', () => {
    expect(isValidNetworkDomain('')).toBe(false);
    expect(isValidNetworkDomain('example')).toBe(false);
    expect(isValidNetworkDomain('example..com')).toBe(false);
    expect(isValidNetworkDomain('https://example.com')).toBe(false);
    expect(isValidNetworkDomain('*.')).toBe(false);
    expect(isValidNetworkDomain('foo.*.example.com')).toBe(false);
    expect(isValidNetworkDomain('example.com/command')).toBe(false);
  });
});