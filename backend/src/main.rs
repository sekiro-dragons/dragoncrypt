mod db;
mod routes;

use axum::{routing::{get, post}, Router};
use sqlx::sqlite::SqlitePool;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    // Load .env
    let _ = dotenvy::dotenv();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .init();

    // Database — create data/ dir if needed, default to sqlite:data/dragoncrypt.db
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        let data_dir = std::path::Path::new("data");
        std::fs::create_dir_all(data_dir).ok();
        "sqlite:data/dragoncrypt.db?mode=rwc".to_string()
    });
    let pool = SqlitePool::connect(&database_url)
        .await
        .expect("Failed to connect to database");

    db::init_db(&pool).await.expect("Failed to initialize database");

    // Periodic cleanup of expired secrets
    let cleanup_pool = pool.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            match db::delete_expired(&cleanup_pool).await {
                Ok(n) if n > 0 => tracing::info!("Cleaned up {} expired secrets", n),
                Err(e) => tracing::error!("Cleanup failed: {}", e),
                _ => {}
            }
        }
    });

    // CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Routes
    let app = Router::new()
        .route("/api/secrets", post(routes::create_secret))
        .route("/api/secrets/{id}", get(routes::get_secret).delete(routes::delete_secret))
        .route("/api/health", get(routes::health))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(pool);

    // Server
    let port = std::env::var("SERVER_PORT").unwrap_or_else(|_| "3001".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Dragoncrypt server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
