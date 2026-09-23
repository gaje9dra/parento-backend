/**
 * Domain persistence boundaries only. Concrete fields and tables belong to later phases.
 * These types intentionally avoid speculative production schema design.
 */
export interface Administrator {}
export interface ManagedDevice {}
export interface DeviceEnrollment {}
export interface DeviceCredential {}
export interface Policy {}
export interface ApplicationRule {}
export interface WebsiteRule {}
export interface DeviceEvent {}
export interface AuditEvent {}
