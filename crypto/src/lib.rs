use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use thiserror::Error;

const PBKDF2_ITERATIONS: u32 = 310_000;
const SALT_BYTES: usize = 16;
const IV_BYTES: usize = 12;
const KEY_BYTES: usize = 32;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("encryption failed: {0}")]
    Encrypt(String),
    #[error("decryption failed: {0}")]
    Decrypt(String),
    #[error("invalid base64: {0}")]
    InvalidBase64(String),
    #[error("password required but not provided")]
    PasswordRequired,
}

/// Encrypted content payload — what gets stored on the server.
#[derive(Debug, Clone)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub iv: String,
    pub salt: Option<String>,
}

/// Key material — what goes into the URL fragment (never sent to server).
#[derive(Debug, Clone)]
pub struct StoredKey {
    pub key: String,
    pub salt: Option<String>,
}

/// Generate a cryptographically random 256-bit key as base64.
pub fn generate_key() -> String {
    let mut key = [0u8; KEY_BYTES];
    OsRng.fill_bytes(&mut key);
    BASE64.encode(key)
}

/// XOR two equal-length byte arrays.
fn xor_bytes(a: &[u8], b: &[u8]) -> Vec<u8> {
    assert_eq!(a.len(), b.len(), "XOR requires equal-length inputs");
    a.iter().zip(b.iter()).map(|(x, y)| x ^ y).collect()
}

/// Derive a 256-bit key from a password using PBKDF2-SHA256.
fn derive_password_key(password: &str, salt: &[u8]) -> Vec<u8> {
    let mut key = [0u8; KEY_BYTES];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key.to_vec()
}

fn b64_decode(s: &str) -> Result<Vec<u8>, CryptoError> {
    BASE64.decode(s).map_err(|e| CryptoError::InvalidBase64(e.to_string()))
}

/// Encrypt content. Returns (payload, stored_key).
///
/// If a password is provided, the URL key is XOR(random_key, password_key),
/// so decryption requires BOTH the URL key AND the password.
pub fn encrypt(content: &str, password: Option<&str>) -> Result<(EncryptedPayload, StoredKey), CryptoError> {
    // Generate random key and IV
    let mut random_key = [0u8; KEY_BYTES];
    let mut iv = [0u8; IV_BYTES];
    OsRng.fill_bytes(&mut random_key);
    OsRng.fill_bytes(&mut iv);

    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(&random_key)
        .map_err(|e| CryptoError::Encrypt(e.to_string()))?;

    // Encrypt
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(nonce, content.as_bytes())
        .map_err(|e| CryptoError::Encrypt(e.to_string()))?;

    let mut salt = None;
    let effective_key;

    if let Some(pwd) = password {
        let mut salt_bytes = [0u8; SALT_BYTES];
        OsRng.fill_bytes(&mut salt_bytes);
        let password_key = derive_password_key(pwd, &salt_bytes);
        effective_key = xor_bytes(&random_key, &password_key);
        salt = Some(BASE64.encode(salt_bytes));
    } else {
        effective_key = random_key.to_vec();
    }

    Ok((
        EncryptedPayload {
            ciphertext: BASE64.encode(&ciphertext),
            iv: BASE64.encode(iv),
            salt: salt.clone(),
        },
        StoredKey {
            key: BASE64.encode(&effective_key),
            salt,
        },
    ))
}

/// Decrypt content using the URL key and optional password.
pub fn decrypt(
    ciphertext: &str,
    iv: &str,
    salt: Option<&str>,
    url_key: &str,
    password: Option<&str>,
) -> Result<String, CryptoError> {
    let url_key_bytes = b64_decode(url_key)?;
    let iv_bytes = b64_decode(iv)?;
    let ciphertext_bytes = b64_decode(ciphertext)?;

    let random_key = if let Some(s) = salt {
        if let Some(pwd) = password {
            let salt_bytes = b64_decode(s)?;
            let password_key = derive_password_key(pwd, &salt_bytes);
            xor_bytes(&url_key_bytes, &password_key)
        } else {
            return Err(CryptoError::PasswordRequired);
        }
    } else {
        url_key_bytes
    };

    let cipher = Aes256Gcm::new_from_slice(&random_key)
        .map_err(|e| CryptoError::Decrypt(e.to_string()))?;

    let nonce = Nonce::from_slice(&iv_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext_bytes.as_slice())
        .map_err(|e| CryptoError::Decrypt(e.to_string()))?;

    String::from_utf8(plaintext).map_err(|e| CryptoError::Decrypt(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let content = "hello, dragoncrypt!";
        let (payload, key) = encrypt(content, None).unwrap();
        let result = decrypt(&payload.ciphertext, &payload.iv, payload.salt.as_deref(), &key.key, None).unwrap();
        assert_eq!(result, content);
    }

    #[test]
    fn encrypt_decrypt_with_password() {
        let content = "super secret data";
        let password = "hunter2";
        let (payload, key) = encrypt(content, Some(password)).unwrap();
        let result = decrypt(&payload.ciphertext, &payload.iv, payload.salt.as_deref(), &key.key, Some(password)).unwrap();
        assert_eq!(result, content);
    }

    #[test]
    fn wrong_password_fails() {
        let content = "secret";
        let (payload, key) = encrypt(content, Some("correct")).unwrap();
        let result = decrypt(&payload.ciphertext, &payload.iv, payload.salt.as_deref(), &key.key, Some("wrong"));
        assert!(result.is_err());
    }

    #[test]
    fn missing_password_fails() {
        let content = "secret";
        let (payload, key) = encrypt(content, Some("password")).unwrap();
        let result = decrypt(&payload.ciphertext, &payload.iv, payload.salt.as_deref(), &key.key, None);
        assert!(result.is_err());
    }
}
