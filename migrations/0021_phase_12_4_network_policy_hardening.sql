-- Phase 12.4 network-policy security and ordering hardening.
-- These database guards mirror application-level validation so direct persistence
-- cannot make older device observations authoritative.

CREATE OR REPLACE FUNCTION validate_network_policy_report_order()
RETURNS TRIGGER AS $network_report_order$
BEGIN
  IF TG_TABLE_NAME='network_policy_sync_state' THEN
    IF OLD.last_reported_at IS NOT NULL
       AND NEW.last_reported_at IS NOT NULL
       AND NEW.last_reported_at < OLD.last_reported_at THEN
      RAISE EXCEPTION 'Out-of-order network policy report'
        USING ERRCODE='40001';
    END IF;
  ELSIF TG_TABLE_NAME='network_policy_capabilities' THEN
    IF OLD.reported_at IS NOT NULL
       AND NEW.reported_at < OLD.reported_at THEN
      RAISE EXCEPTION 'Out-of-order network capability report'
        USING ERRCODE='40001';
    END IF;
  END IF;
  RETURN NEW;
END;
$network_report_order$ LANGUAGE plpgsql;

CREATE TRIGGER network_policy_sync_report_order
BEFORE UPDATE ON network_policy_sync_state
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_report_order();

CREATE TRIGGER network_policy_capability_report_order
BEFORE UPDATE ON network_policy_capabilities
FOR EACH ROW EXECUTE FUNCTION validate_network_policy_report_order();

CREATE INDEX network_policy_sync_reported_idx
  ON network_policy_sync_state(last_reported_at DESC)
  WHERE last_reported_at IS NOT NULL;

CREATE INDEX network_policy_capability_reported_idx
  ON network_policy_capabilities(reported_at DESC);
