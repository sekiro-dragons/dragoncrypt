use chrono::Utc;
use sqlx::sqlite::SqlitePool;

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize, serde::Deserialize)]
pub struct SecretRecord {
    pub id: String,
    pub ciphertext: String,
    pub iv: String,
    pub salt: Option<String>,
    pub expires_at: Option<String>,
    pub burn_after_read: bool,
    pub view_count: i64,
    pub max_views: Option<i64>,
    pub is_file: bool,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub file_mime: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct CreateSecretInput {
    pub ciphertext: String,
    pub iv: String,
    pub salt: Option<String>,
    pub expires_at: Option<String>,
    pub burn_after_read: Option<bool>,
    pub max_views: Option<i64>,
    pub is_file: Option<bool>,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub file_mime: Option<String>,
}

pub async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS secrets (
            id TEXT PRIMARY KEY,
            ciphertext TEXT NOT NULL,
            iv TEXT NOT NULL,
            salt TEXT,
            expires_at TEXT,
            burn_after_read INTEGER NOT NULL DEFAULT 0,
            view_count INTEGER NOT NULL DEFAULT 0,
            max_views INTEGER,
            is_file INTEGER NOT NULL DEFAULT 0,
            file_name TEXT,
            file_size INTEGER,
            file_mime TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_secrets_expires_at ON secrets(expires_at) WHERE expires_at IS NOT NULL",
    )
    .execute(pool)
    .await?;

    tracing::info!("Database initialized");
    Ok(())
}

pub async fn create_secret(pool: &SqlitePool, input: CreateSecretInput) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let burn = input.burn_after_read.unwrap_or(false);
    let is_file = input.is_file.unwrap_or(false);

    sqlx::query(
        r#"
        INSERT INTO secrets (id, ciphertext, iv, salt, expires_at, burn_after_read, max_views, is_file, file_name, file_size, file_mime)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&input.ciphertext)
    .bind(&input.iv)
    .bind(&input.salt)
    .bind(&input.expires_at)
    .bind(burn as i64)
    .bind(input.max_views)
    .bind(is_file as i64)
    .bind(&input.file_name)
    .bind(input.file_size)
    .bind(&input.file_mime)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn get_secret(pool: &SqlitePool, id: &str) -> Result<Option<SecretRecord>, sqlx::Error> {
    let row: Option<SecretRecord> = sqlx::query_as(
        r#"
        SELECT id, ciphertext, iv, salt, expires_at, burn_after_read, view_count,
               max_views, is_file, file_name, file_size, file_mime, created_at
        FROM secrets WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

pub async fn increment_view(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE secrets SET view_count = view_count + 1 WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_secret(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM secrets WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_expired(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query("DELETE FROM secrets WHERE expires_at IS NOT NULL AND expires_at < ?")
        .bind(&now)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}
