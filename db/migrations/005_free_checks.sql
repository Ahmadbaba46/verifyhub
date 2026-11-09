-- Per-user "free checks" flag: a staff member who runs checks without a wallet charge.
-- Only users explicitly granted this run free; it is not tied to the admin role.
ALTER TABLE users ADD COLUMN free_checks boolean NOT NULL DEFAULT false;

-- Keep existing admins' free testing working out of the box; narrow it from the Users page.
UPDATE users SET free_checks = true WHERE role = 'admin';
