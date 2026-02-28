-- Add token_version column for JWT invalidation on password change
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1;
