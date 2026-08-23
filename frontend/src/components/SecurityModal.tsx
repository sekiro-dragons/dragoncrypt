import { Shield, Lock, KeyRound, Eye, Trash2, Clock, FileLock2 } from 'lucide-react';

type Props = {
    open: boolean;
    onClose: () => void;
};

export function SecurityModal({ open, onClose }: Props) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-red-400" />
                        <h2 className="text-lg font-semibold text-white">How it works</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition-colors text-sm px-3 py-1 rounded-lg hover:bg-zinc-800"
                    >
                        Close
                    </button>
                </div>

                <div className="px-6 py-6 space-y-6">
                    <p className="text-zinc-300 text-sm leading-relaxed">
                        This is a <span className="text-red-400 font-medium">zero-knowledge</span> secret
                        sharing app. Your content is encrypted in your browser before it ever touches the
                        server. The server can never read your secrets — not even the administrators.
                    </p>

                    <div className="space-y-4">
                        <Step
                            icon={<Lock className="w-5 h-5 text-red-400" />}
                            title="1. Encryption happens in your browser"
                            desc="When you create a secret, a random 256-bit AES key is generated locally. Your content is encrypted with AES-256-GCM before anything is sent to the server."
                        />
                        <Step
                            icon={<KeyRound className="w-5 h-5 text-red-400" />}
                            title="2. The key lives in the URL, not the database"
                            desc="The encryption key is placed in the URL fragment (after the #). Fragments are never sent to the server in HTTP requests — this is what makes 'the server can't read it' actually true."
                        />
                        <Step
                            icon={<Eye className="w-5 h-5 text-red-400" />}
                            title="3. Decryption is also client-side"
                            desc="When someone opens the link, the page reads the key from the URL fragment, fetches only the ciphertext from the server, and decrypts it entirely in the browser."
                        />
                        <Step
                            icon={<Trash2 className="w-5 h-5 text-red-400" />}
                            title="4. Burn after reading"
                            desc="If enabled, the server deletes the ciphertext immediately after the first successful view. It can never be viewed again — even with the same link."
                        />
                        <Step
                            icon={<Clock className="w-5 h-5 text-red-400" />}
                            title="5. Expiry"
                            desc="Secrets can self-destruct after 5 minutes, 1 hour, 1 day, 1 week, or never. Expired entries are automatically removed."
                        />
                        <Step
                            icon={<FileLock2 className="w-5 h-5 text-red-400" />}
                            title="6. Optional password protection"
                            desc="A password is combined with the encryption key using PBKDF2. The raw password is never sent to the server — if the wrong password is entered, decryption simply fails."
                        />
                    </div>

                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                        <h3 className="text-white font-medium text-sm mb-2">What the server stores</h3>
                        <ul className="text-zinc-400 text-sm space-y-1">
                            <li>— The encrypted ciphertext (unreadable without the key)</li>
                            <li>— The initialization vector (IV)</li>
                            <li>— A salt (only if you set a password)</li>
                            <li>— Expiry, burn flag, and view count metadata</li>
                        </ul>
                    </div>

                    <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4">
                        <h3 className="text-red-400 font-medium text-sm mb-2">
                            What the server never sees
                        </h3>
                        <ul className="text-zinc-300 text-sm space-y-1">
                            <li>— Your plaintext content</li>
                            <li>— The encryption key</li>
                            <li>— Your password (if you set one)</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Step({
    icon,
    title,
    desc,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
}) {
    return (
        <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                {icon}
            </div>
            <div>
                <h3 className="text-white font-medium text-sm mb-1">{title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}
