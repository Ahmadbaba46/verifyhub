-- BVN validation: same wallet-charged, charge-on-success pattern as the other checks.
INSERT INTO services (key, label, description, sort) VALUES
  ('bvn', 'BVN validation', 'Validate a BVN and view the linked details', 4)
ON CONFLICT (key) DO NOTHING;

INSERT INTO prices (key, service_key, label, amount_kobo) VALUES
  ('bvn_validate', 'bvn', 'BVN validation', 15000)
ON CONFLICT (key) DO NOTHING;
