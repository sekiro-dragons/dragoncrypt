/*
 # Create secrets table for zero-knowledge secret sharing
 
 ## Purpose
 Stores encrypted "secrets" (text or files) shared via the app. The server is
 zero-knowledge: it only ever receives and stores ciphertext + IV. The
 decryption key lives in the URL fragment of the share link and is NEVER
 transmitted to the server.
 
 ## New Tables
 - `secrets`
 - `id` (uuid, primary key) — public identifier used in the share URL.
 - `ciphertext` (text, not null) — base64-encoded AES-256-GCM ciphertext.
 - `iv` (text, not null) — base64-encoded initialization vector for AES-GCM.
 - `salt` (text, nullable) — base64-encoded salt used for PBKDF2 key derivation
 when an optional password is set. Null when no password is used.
 - `expires_at` (timestamptz, nullable) — when the secret expires. Null = never.
 - `burn_after_read` (boolean, not null, default false) — if true, the ciphertext
 is deleted immediately after the first successful read.
 - `view_count` (integer, not null, default 0) — number of times the ciphertext
 was fetched (for the sender's access log).
 - `max_views` (integer, nullable) — optional limit on views before deletion.
 - `is_file` (boolean, not null, default false) — whether the content is a file.
 - `file_name` (text, nullable) — original file name (encrypted client-side? No —
 stored in plaintext metadata since it's not sensitive on its own, but kept
 minimal). Actually we store it as part of the encrypted payload, so this is
 just a flag. We keep file_name for UX on the view page.
 - `file_size` (integer, nullable) — original file size in bytes.
 - `created_at` (timestamptz, default now) — creation timestamp.
 
 ## Security
 - RLS enabled on `secrets`.
 - This is a no-auth (anonymous, frictionless) app, so policies allow
 `anon, authenticated` to perform all CRUD — the security comes from the
 client-side encryption, not from row-level access control. Anyone with a
 secret ID can fetch its ciphertext, but without the URL-fragment key the
 ciphertext is meaningless.
 - No `user_id` column — no accounts, no login.
 
 ## Notes
 1. The `view_count` is incremented on each read via an UPDATE in the read path.
 2. Expired entries are cleaned up by a scheduled cleanup (or lazily on read).
 3. `burn_after_read` secrets are deleted immediately after the first successful
 fetch in the read path.
 4. The password hash is NOT stored — password protection works by deriving part
 of the decryption key from the password via PBKDF2; if the wrong password is
 used, decryption fails. The server never sees the password.
 */
CREATE TABLE IF NOT EXISTS secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ciphertext text NOT NULL,
    iv text NOT NULL,
    salt text,
    expires_at timestamptz,
    burn_after_read boolean NOT NULL DEFAULT false,
    view_count integer NOT NULL DEFAULT 0,
    max_views integer,
    is_file boolean NOT NULL DEFAULT false,
    file_name text,
    file_size integer,
    file_mime text,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
-- Allow anonymous access: the security model is encryption-based, not access-based.
DROP POLICY IF EXISTS "anon_select_secrets" ON secrets;
CREATE POLICY "anon_select_secrets" ON secrets FOR
SELECT TO anon,
    authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_secrets" ON secrets;
CREATE POLICY "anon_insert_secrets" ON secrets FOR
INSERT TO anon,
    authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_secrets" ON secrets;
CREATE POLICY "anon_update_secrets" ON secrets FOR
UPDATE TO anon,
    authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_secrets" ON secrets;
CREATE POLICY "anon_delete_secrets" ON secrets FOR DELETE TO anon,
authenticated USING (true);
-- Index for expiry-based cleanup queries
CREATE INDEX IF NOT EXISTS idx_secrets_expires_at ON secrets (expires_at)
WHERE expires_at IS NOT NULL;