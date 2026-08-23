const API_BASE = '/api';

export type SecretRecord = {
    id: string;
    ciphertext: string;
    iv: string;
    salt: string | null;
    expires_at: string | null;
    burn_after_read: boolean;
    view_count: number;
    max_views: number | null;
    is_file: boolean;
    file_name: string | null;
    file_size: number | null;
    file_mime: string | null;
    created_at: string;
};

export type CreateSecretInput = {
    ciphertext: string;
    iv: string;
    salt: string | null;
    expires_at: string | null;
    burn_after_read: boolean;
    max_views: number | null;
    is_file: boolean;
    file_name: string | null;
    file_size: number | null;
    file_mime: string | null;
};

/**
 * Store a new encrypted secret. Returns the generated ID used in the share link.
 * Only ciphertext + IV + salt are sent — never the key or plaintext.
 */
export async function createSecret(input: CreateSecretInput): Promise<string> {
    const resp = await fetch(`${API_BASE}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to store secret: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    return data.id as string;
}

/**
 * Fetch a secret's ciphertext by ID.
 *
 * If the secret is burn-after-read, the server deletes it immediately after
 * fetching so it can never be viewed a second time. The server also increments
 * the view count and checks expiry/max_views.
 */
export async function fetchSecret(id: string): Promise<SecretRecord | null> {
    const resp = await fetch(`${API_BASE}/secrets/${id}`);

    if (resp.status === 404) {
        return null;
    }

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to fetch secret: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    return data as SecretRecord;
}

/** Manually delete a secret by ID (optional manual delete). */
export async function deleteSecret(id: string): Promise<void> {
    const resp = await fetch(`${API_BASE}/secrets/${id}`, {
        method: 'DELETE',
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to delete secret: ${resp.status} ${text}`);
    }
}

/** Compute the ISO expiry timestamp from a choice. */
export function expiryToISO(choice: ExpiryChoice): string | null {
    if (choice === 'never') return null;
    const now = new Date();
    switch (choice) {
        case '5m':
            now.setMinutes(now.getMinutes() + 5);
            break;
        case '1h':
            now.setHours(now.getHours() + 1);
            break;
        case '1d':
            now.setDate(now.getDate() + 1);
            break;
        case '1w':
            now.setDate(now.getDate() + 7);
            break;
    }
    return now.toISOString();
}

export type ExpiryChoice = '5m' | '1h' | '1d' | '1w' | 'never';

export const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
    '5m': '5 minutes',
    '1h': '1 hour',
    '1d': '1 day',
    '1w': '1 week',
    never: 'Never',
};
