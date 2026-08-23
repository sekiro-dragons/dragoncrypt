/**
 * Zero-knowledge crypto utilities.
 *
 * All encryption and decryption happens here, entirely in the browser, using the
 * Web Crypto API (crypto.subtle). The server NEVER sees plaintext content or the
 * encryption key.
 *
 * Security model:
 *  - A random 256-bit AES key is generated in the browser when a secret is created.
 *  - Content is encrypted with AES-256-GCM (authenticated encryption).
 *  - The key is NEVER sent to the server. It is placed in the URL fragment
 *    (#key=...) of the share link. URL fragments are not transmitted to the server
 *    in HTTP requests, so the server cannot read the key.
 *  - The viewing page reads the key from window.location.hash, fetches the
 *    ciphertext from the backend, and decrypts it client-side.
 *
 * Optional password protection:
 *  - When a password is set, we derive a key from the password using PBKDF2
 *    (SHA-256, 310,000 iterations) with a random salt.
 *  - We combine the random key and the password-derived key by XOR-ing them
 *    into the stored key, so decryption requires BOTH the URL fragment key AND
 *    the password. The server only ever stores the XOR result + salt — it
 *    cannot derive either key.
 *  - The raw password is NEVER sent to the server. Decryption failing IS the
 *    password verification.
 */

const SUBtle = crypto.subtle;

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // 96-bit IV is standard for AES-GCM
const KEY_BYTES = 32; // 256-bit key

export type EncryptedPayload = {
    ciphertext: string; // base64
    iv: string; // base64
    salt: string | null; // base64, null if no password
};

export type StoredKey = {
    key: string; // base64 — the key material to put in the URL fragment
    salt: string | null; // base64 salt, if password was used
};

export type DecryptionInputs = {
    ciphertext: string; // base64
    iv: string; // base64
    salt: string | null; // base64 or null
    urlKey: string; // base64 key from the URL fragment
    password?: string; // optional password
};

/** Convert ArrayBuffer to base64 string. */
export function bufToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/** Convert base64 string to Uint8Array. */
export function base64ToBuf(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Generate cryptographically random bytes. */
export function randomBytes(length: number): Uint8Array {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return arr;
}

/** Generate a random 256-bit AES key and return it as base64. */
export function generateKeyBase64(): string {
    return bufToBase64(randomBytes(KEY_BYTES).buffer);
}

/** Import raw key bytes (base64) as a CryptoKey for AES-GCM. */
async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
    return SUBtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
    ]);
}

/** Derive a 256-bit key from a password using PBKDF2 (SHA-256). */
async function derivePasswordKey(
    password: string,
    salt: Uint8Array,
): Promise<Uint8Array> {
    const baseKey = await SUBtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits'],
    );
    const bits = await SUBtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        KEY_BYTES * 8,
    );
    return new Uint8Array(bits);
}

/** XOR two equal-length byte arrays. */
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.length !== b.length) {
        throw new Error('Key length mismatch during XOR');
    }
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        out[i] = a[i] ^ b[i];
    }
    return out;
}

/**
 * Encrypt content client-side.
 *
 * @param content Plaintext string (text content or base64-encoded file data).
 * @param password Optional password. If provided, the stored key is XOR-combined
 *                 with a PBKDF2-derived key so both the URL key and the password
 *                 are required to decrypt.
 * @returns The encrypted payload (ciphertext + IV + salt as base64) and the key
 *          material to place in the URL fragment.
 */
export async function encryptContent(
    content: string,
    password?: string,
): Promise<{ payload: EncryptedPayload; storedKey: StoredKey }> {
    // 1. Generate a random AES key.
    const randomKeyBytes = randomBytes(KEY_BYTES);
    const iv = randomBytes(IV_BYTES);

    let salt: Uint8Array | null = null;
    let effectiveKeyBytes: Uint8Array;

    if (password) {
        // Derive a key from the password and XOR it with the random key.
        // The XOR result is what we store in the URL fragment. The server only
        // ever sees the salt (needed to re-derive the password key on decrypt).
        salt = randomBytes(SALT_BYTES);
        const passwordKeyBytes = await derivePasswordKey(password, salt);
        effectiveKeyBytes = xorBytes(randomKeyBytes, passwordKeyBytes);
    } else {
        effectiveKeyBytes = randomKeyBytes;
    }

    // 2. Encrypt the content with the random key (NOT the XOR'd key).
    const cryptoKey = await importAesKey(randomKeyBytes);
    const plaintext = new TextEncoder().encode(content);
    const ciphertextBuf = await SUBtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        plaintext,
    );

    return {
        payload: {
            ciphertext: bufToBase64(ciphertextBuf),
            iv: bufToBase64(iv.buffer),
            salt: salt ? bufToBase64(salt.buffer) : null,
        },
        storedKey: {
            key: bufToBase64(effectiveKeyBytes.buffer),
            salt: salt ? bufToBase64(salt.buffer) : null,
        },
    };
}

/**
 * Decrypt content client-side using the key from the URL fragment and an
 * optional password.
 *
 * @throws if the key or password is wrong (AES-GCM authentication fails).
 */
export async function decryptContent(
    inputs: DecryptionInputs,
): Promise<string> {
    const urlKeyBytes = base64ToBuf(inputs.urlKey);

    let randomKeyBytes: Uint8Array;

    if (inputs.salt && inputs.password) {
        // Re-derive the password key and XOR it back out to recover the random key.
        const salt = base64ToBuf(inputs.salt);
        const passwordKeyBytes = await derivePasswordKey(inputs.password, salt);
        randomKeyBytes = xorBytes(urlKeyBytes, passwordKeyBytes);
    } else if (inputs.salt && !inputs.password) {
        // A password was set but none was provided — cannot decrypt.
        throw new Error('This secret is password protected.');
    } else {
        randomKeyBytes = urlKeyBytes;
    }

    const cryptoKey = await importAesKey(randomKeyBytes);
    const iv = base64ToBuf(inputs.iv);
    const ciphertext = base64ToBuf(inputs.ciphertext);

    const plaintextBuf = await SUBtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext,
    );

    return new TextDecoder().decode(plaintextBuf);
}

/** Encode a file (ArrayBuffer) to base64 for encryption. */
export function fileToBase64(buf: ArrayBuffer): string {
    return bufToBase64(buf);
}

/** Decode base64 back to an ArrayBuffer for file download. */
export function base64ToFile(b64: string): ArrayBuffer {
    return base64ToBuf(b64).buffer;
}
