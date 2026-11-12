-- database/queries/system_settings.sql

-- name: GetSystemSetting :one
SELECT key, value, updated_at, updated_by
FROM system_settings
WHERE key = $1;

-- name: UpsertSystemSetting :one
INSERT INTO system_settings (key, value, updated_at, updated_by)
VALUES ($1, $2, NOW(), $3)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW(),
    updated_by = EXCLUDED.updated_by
RETURNING key, value, updated_at, updated_by;
