-- Emails are only sent to confirmed addresses. Identified users' emails come from the host app and count as confirmed.
ALTER TABLE contacts ADD COLUMN email_verified_at INTEGER;
UPDATE contacts SET email_verified_at = created_at WHERE is_identified = 1 AND email IS NOT NULL;
