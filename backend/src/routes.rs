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
    let record = db::get_secret(&pool, &id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Check expiry
    if let Some(ref expires_at) = record.expires_at {
        if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(expires_at) {
            if exp < chrono::Utc::now() {
                let _ = db::delete_secret(&pool, &id).await;
                return Err(StatusCode::NOT_FOUND);
            }
        }
    }

    // Check max views
    if let Some(max) = record.max_views {
        if record.view_count >= max {
            let _ = db::delete_secret(&pool, &id).await;
            return Err(StatusCode::NOT_FOUND);
        }
    }

    // Increment view count
    let _ = db::increment_view(&pool, &id).await;

    // Burn after read
    if record.burn_after_read {
        let _ = db::delete_secret(&pool, &id).await;
    }

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
