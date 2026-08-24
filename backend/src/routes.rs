use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePool;

use crate::db::{self, CreateSecretInput, SecretRecord};

pub async fn create_secret(
    State(pool): State<SqlitePool>,
    Json(input): Json<CreateSecretInput>,
) -> Result<Json<Value>, StatusCode> {
    let id = db::create_secret(&pool, input)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "id": id })))
}

pub async fn get_secret(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<SecretRecord>, StatusCode> {
    let mut tx = pool.begin().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let record = sqlx::query_as::<_, SecretRecord>(
        r#"
        SELECT id, ciphertext, iv, salt, expires_at, burn_after_read, view_count,
               max_views, is_file, file_name, file_size, file_mime, created_at
        FROM secrets WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Check expiry
    if let Some(ref expires_at) = record.expires_at {
        if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(expires_at) {
            if exp < chrono::Utc::now() {
                let _ = sqlx::query("DELETE FROM secrets WHERE id = ?")
                    .bind(&id)
                    .execute(&mut *tx)
                    .await;
                return Err(StatusCode::NOT_FOUND);
            }
        }
    }

    // Check max views
    if let Some(max) = record.max_views {
        if record.view_count >= max {
            let _ = sqlx::query("DELETE FROM secrets WHERE id = ?")
                .bind(&id)
                .execute(&mut *tx)
                .await;
            return Err(StatusCode::NOT_FOUND);
        }
    }

    // Increment view count
    sqlx::query("UPDATE secrets SET view_count = view_count + 1 WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Burn after read
    if record.burn_after_read {
        sqlx::query("DELETE FROM secrets WHERE id = ?")
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    tx.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(record))
}

pub async fn delete_secret(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    db::delete_secret(&pool, &id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": "0.1.0"
    }))
}
