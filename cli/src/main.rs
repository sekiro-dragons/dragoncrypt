use clap::{Parser, Subcommand};
use dragoncrypt_crypto::{encrypt, decrypt};
use serde::Deserialize;
use serde_json::json;
use std::io::{Read, IsTerminal};

/// Zero-knowledge secret sharing from your terminal.
#[derive(Parser)]
#[command(name = "dragoncrypt", version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Backend server URL
    #[arg(long, global = true, default_value = "http://localhost:3001")]
    server: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Encrypt and store a secret on the server
    Seal {
        /// Read secret from file instead of stdin
        #[arg(short, long)]
        file: Option<String>,

        /// Expiry duration (5m, 1h, 1d, 1w, never)
        #[arg(short = 'e', long = "expiry", default_value = "24h")]
        expiry: String,

        /// Delete after first read
        #[arg(short, long)]
        one_life: bool,

        /// Protect with a password
        #[arg(short, long)]
        password: Option<String>,

        /// Frontend URL for the share link
        #[arg(long, default_value = "http://localhost:5173")]
        frontend: String,

        /// Copy share URL to clipboard
        #[arg(short, long)]
        copy: bool,

        /// Print only the share URL
        #[arg(short, long)]
        quiet: bool,
    },

    /// Fetch and decrypt a secret from the server
    Unseal {
        /// Share URL of the secret
        url: String,

        /// Decryption password
        #[arg(short, long)]
        password: Option<String>,

        /// Write to file instead of stdout
        #[arg(short, long)]
        output: Option<String>,

        /// Copy content to clipboard
        #[arg(short, long)]
        copy: bool,

        /// Print only the decrypted content
        #[arg(short, long)]
        quiet: bool,
    },

    /// Delete a secret from the server before it expires
    Sever {
        /// Share URL of the secret to delete
        url: String,

        /// Skip confirmation prompt
        #[arg(short, long)]
        force: bool,

        /// Print only the result
        #[arg(short, long)]
        quiet: bool,
    },

    /// Check whether the backend server is reachable
    Status,
}

#[derive(Deserialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[derive(Deserialize)]
struct CreateResponse {
    id: String,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct SecretResponse {
    ciphertext: String,
    iv: String,
    salt: Option<String>,
    expires_at: Option<String>,
    burn_after_read: bool,
    view_count: i64,
    is_file: bool,
    file_name: Option<String>,
    file_size: Option<i64>,
    created_at: String,
}

/// Parse a dragoncrypt URL into (id, key, salt).
fn parse_url(url: &str) -> Result<(String, String, Option<String>), String> {
    // Format: http://.../#/view/{id}#k={key}&s={salt}
    let hash_part = url.split("#/view/").nth(1)
        .ok_or("Invalid URL: missing /#/view/")?;

    let id_and_frag = hash_part;
    let (id, fragment) = if let Some(pos) = id_and_frag.find('#') {
        (&id_and_frag[..pos], &id_and_frag[pos+1..])
    } else {
        (id_and_frag, "")
    };

    if id.is_empty() {
        return Err("Invalid URL: empty secret ID".to_string());
    }

    // Parse fragment as key=value pairs
    let mut key = None;
    let mut salt = None;
    for part in fragment.split('&') {
        if let Some(v) = part.strip_prefix("k=") {
            key = Some(v.to_string());
        } else if let Some(v) = part.strip_prefix("s=") {
            salt = Some(v.to_string());
        }
    }

    let key = key.ok_or("Invalid URL: no key in fragment (#k=...)")?;
    Ok((id.to_string(), key, salt))
}

fn expires_to_iso(choice: &str) -> Option<String> {
    match choice {
        "never" => None,
        _ => {
            let now = chrono::Utc::now();
            let dt = match choice {
                "5m" => now + chrono::Duration::minutes(5),
                "1h" => now + chrono::Duration::hours(1),
                "1d" => now + chrono::Duration::days(1),
                "1w" => now + chrono::Duration::weeks(1),
                _ => {
                    eprintln!("Invalid expiry: {}. Use 5m, 1h, 1d, 1w, or never.", choice);
                    std::process::exit(2);
                }
            };
            Some(dt.to_rfc3339())
        }
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    match cli.command {
        Commands::Seal { file, expiry, one_life, password, frontend, copy, quiet } => {
            // Read content
            let content = if let Some(path) = &file {
                std::fs::read_to_string(path).unwrap_or_else(|e| {
                    eprintln!("Error: Cannot read file '{}': {}", path, e);
                    std::process::exit(1);
                })
            } else {
                // Check if stdin is a terminal (interactive)
                let is_terminal = std::io::stdin().is_terminal();
                if is_terminal && !quiet {
                    eprintln!("Type your secret, then press Ctrl+D to seal (or Ctrl+C to cancel).");
                    eprintln!();
                }

                let mut buf = String::new();
                std::io::stdin().read_to_string(&mut buf).unwrap_or_else(|e| {
                    eprintln!("Error: Failed to read stdin: {}", e);
                    std::process::exit(1);
                });

                let trimmed = buf.trim();
                if trimmed.is_empty() {
                    if is_terminal {
                        eprintln!();
                        eprintln!("Error: No content entered.");
                    } else {
                        eprintln!("Error: No content piped in. Use -f <file> or pipe content.");
                    }
                    eprintln!("  Usage: dc seal              (type content, Ctrl+D to finish)");
                    eprintln!("         dc seal -f file.txt  (seal a file)");
                    eprintln!("         echo 'hi' | dc seal  (pipe content)");
                    std::process::exit(1);
                }
                buf
            };

            // Encrypt
            let (payload, stored_key) = encrypt(&content, password.as_deref())
                .unwrap_or_else(|e| {
                    eprintln!("Encryption failed: {}", e);
                    std::process::exit(1);
                });

            // Store on server
            let is_file = file.is_some();
            let file_name = file.as_ref().map(|f| {
                std::path::Path::new(f).file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default()
            });
            let file_size = file.as_ref().and_then(|f| {
                std::fs::metadata(f).ok().map(|m| m.len() as i64)
            });
            let max_views = if one_life { Some(1) } else { None };

            let body = json!({
                "ciphertext": payload.ciphertext,
                "iv": payload.iv,
                "salt": payload.salt,
                "expires_at": expires_to_iso(&expiry),
                "burn_after_read": one_life,
                "max_views": max_views,
                "is_file": is_file,
                "file_name": file_name,
                "file_size": file_size,
                "file_mime": None::<String>,
            });

            let resp = client.post(format!("{}/api/secrets", cli.server))
                .json(&body)
                .send()
                .await
                .unwrap_or_else(|e| {
                    if e.is_connect() {
                        eprintln!("Error: Cannot connect to server at {}", cli.server);
                        eprintln!("  Is the backend running? Start it with: cargo run -p dragoncrypt-backend");
                    } else {
                        eprintln!("Error: Request failed: {}", e);
                    }
                    std::process::exit(3);
                });

            if !resp.status().is_success() {
                eprintln!("Server error: {}", resp.status());
                std::process::exit(3);
            }

            let create_resp: CreateResponse = resp.json().await.unwrap_or_else(|e| {
                eprintln!("Error: Server returned unexpected response: {}", e);
                std::process::exit(3);
            });

            // Build share URL
            let mut url = format!("{}/#/view/{}#k={}", frontend, create_resp.id, stored_key.key);
            if let Some(ref s) = stored_key.salt {
                url.push_str(&format!("&s={}", s));
            }

            if quiet {
                println!("{}", url);
            } else {
                println!();
                println!("Sealed.");
                println!();
                println!("URL:      {}", url);
                println!("Expiry:   {}", expiry);
                println!("One Life: {}", if one_life { "yes" } else { "no" });
                println!();
                println!("Share the URL. The key is in the fragment (#) — it never touches the server.");
            }

            if copy {
                // Best effort clipboard
                #[cfg(target_os = "linux")]
                {
                    use std::process::Command;
                    let _ = Command::new("xclip")
                        .args(["-selection", "clipboard"])
                        .arg(&url)
                        .status();
                }
                #[cfg(target_os = "macos")]
                {
                    use std::process::Command;
                    let _ = Command::new("pbcopy")
                        .status();
                }
            }
        }

        Commands::Unseal { url, password, output, copy, quiet } => {
            let (id, key, salt) = parse_url(&url).unwrap_or_else(|e| {
                eprintln!("{}", e);
                std::process::exit(2);
            });

            // Fetch from server
            let resp = client.get(format!("{}/api/secrets/{}", cli.server, id))
                .send()
                .await
                .unwrap_or_else(|e| {
                    if e.is_connect() {
                        eprintln!("Error: Cannot connect to server at {}", cli.server);
                        eprintln!("  Is the backend running? Start it with: cargo run -p dragoncrypt-backend");
                    } else {
                        eprintln!("Error: Request failed: {}", e);
                    }
                    std::process::exit(3);
                });

            if resp.status() == 404 {
                eprintln!("Secret not found. It may have expired, been burned, or been severed.");
                std::process::exit(5);
            }
            if !resp.status().is_success() {
                eprintln!("Server error: {}", resp.status());
                std::process::exit(3);
            }

            let secret: SecretResponse = resp.json().await.unwrap_or_else(|e| {
                eprintln!("Error: Server returned unexpected response: {}", e);
                std::process::exit(3);
            });

            // Determine if password is needed
            let effective_salt = salt.as_deref().or(secret.salt.as_deref());
            let pwd = if effective_salt.is_some() && password.is_none() {
                eprint!("Enter password: ");
                let mut buf = String::new();
                std::io::stdin().read_line(&mut buf).unwrap();
                Some(buf.trim().to_string())
            } else {
                password
            };

            // Decrypt
            let plaintext = decrypt(
                &secret.ciphertext,
                &secret.iv,
                effective_salt,
                &key,
                pwd.as_deref(),
            )
            .unwrap_or_else(|e| {
                eprintln!("Decryption failed: {}", e);
                eprintln!("The link may be corrupted or the password is wrong.");
                std::process::exit(4);
            });

            // Output
            if quiet {
                print!("{}", plaintext);
            } else {
                println!();
                println!("Unsealed.");
                println!();
                println!("ID:       {}", id);
                if let Some(ref exp) = secret.expires_at {
                    println!("Expires:  {}", exp);
                }
                println!("Burned:   {}", if secret.burn_after_read { "yes" } else { "no" });
                println!();
                println!("-----------------------------------");
                println!();
                println!("{}", plaintext);
                println!();
                println!("-----------------------------------");
            }

            // Save to file
            if let Some(path) = &output {
                std::fs::write(path, &plaintext).unwrap_or_else(|e| {
                    eprintln!("Failed to write to '{}': {}", path, e);
                    std::process::exit(1);
                });
                if !quiet {
                    println!();
                    println!("Saved to {}", path);
                }
            }

            // Clipboard
            if copy {
                #[cfg(target_os = "linux")]
                {
                    use std::process::Command;
                    let _ = Command::new("xclip")
                        .args(["-selection", "clipboard"])
                        .arg(&plaintext)
                        .status();
                }
                #[cfg(target_os = "macos")]
                {
                    use std::process::Command;
                    let _ = Command::new("pbcopy")
                        .status();
                }
            }
        }

        Commands::Sever { url, force, quiet } => {
            let (id, _, _) = parse_url(&url).unwrap_or_else(|e| {
                eprintln!("{}", e);
                std::process::exit(2);
            });

            if !force {
                eprintln!("Sever secret {}?", id);
                eprintln!("  This cannot be undone.");
                eprint!("  Confirm? [y/N] ");
                let mut buf = String::new();
                std::io::stdin().read_line(&mut buf).unwrap_or_else(|e| {
                    eprintln!("Error reading input: {}", e);
                    std::process::exit(1);
                });
                if !buf.trim().to_lowercase().starts_with('y') {
                    eprintln!("Aborted.");
                    return;
                }
            }

            let resp = client.delete(format!("{}/api/secrets/{}", cli.server, id))
                .send()
                .await
                .unwrap_or_else(|e| {
                    if e.is_connect() {
                        eprintln!("Error: Cannot connect to server at {}", cli.server);
                        eprintln!("  Is the backend running? Start it with: cargo run -p dragoncrypt-backend");
                    } else {
                        eprintln!("Error: Request failed: {}", e);
                    }
                    std::process::exit(3);
                });

            if !resp.status().is_success() {
                eprintln!("Server error: {}", resp.status());
                std::process::exit(3);
            }

            if quiet {
                println!("severed");
            } else {
                println!("{} severed.", id);
            }
        }

        Commands::Status => {
            let resp = client.get(format!("{}/api/health", cli.server))
                .send()
                .await
                .unwrap_or_else(|e| {
                    if e.is_connect() {
                        eprintln!("Error: Cannot reach server at {}", cli.server);
                        eprintln!("  Is the backend running? Start it with: cargo run -p dragoncrypt-backend");
                    } else {
                        eprintln!("Error: Request failed: {}", e);
                    }
                    std::process::exit(3);
                });

            if !resp.status().is_success() {
                eprintln!("Server returned error: {}", resp.status());
                std::process::exit(3);
            }

            let health: HealthResponse = resp.json().await.unwrap_or_else(|e| {
                eprintln!("Error: Server returned unexpected response: {}", e);
                std::process::exit(3);
            });
            println!();
            println!("Server:    {}", cli.server);
            println!("Status:    {}", health.status);
            println!("Version:   {}", health.version);
            println!();
        }
    }
}
