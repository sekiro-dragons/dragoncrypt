import { useState, useEffect, useRef } from 'react';
import {
    Loader2,
    Eye,
    KeyRound,
    Download,
    Clock,
    Flame,
    Plus,
    FileText,
    Scroll,
    Bell
} from 'lucide-react';
import { decryptContent, base64ToFile } from '@/lib/crypto';
import { fetchSecret, type SecretRecord } from '@/lib/secrets';

type Props = {
    id: string;
    fragment: string;
    onNavigate: (path: string) => void;
};

type ViewState =
    | { status: 'loading' }
    | { status: 'not-found' }
    | { status: 'needs-password' }
    | { status: 'decrypted'; content: string; record: SecretRecord }
    | { status: 'error'; message: string };

// Helper function to format milliseconds into minutes and seconds
function formatTime(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

export function ViewPage({ id, fragment, onNavigate }: Props) {
    const [state, setState] = useState<ViewState>({ status: 'loading' });
    const [password, setPassword] = useState('');
    const [record, setRecord] = useState<SecretRecord | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const fetchedRef = useRef(false);

    function parseFragment(frag: string): { key: string; salt: string | null } | null {
        const hash = frag.startsWith('#') ? frag.slice(1) : frag;
        const cleanHash = hash.replace(/\+/g, '%2B');
        const params = new URLSearchParams(cleanHash);
        const key = params.get('k');
        const salt = params.get('s');
        if (!key) return null;
        return { key, salt };
    }

    async function attemptDecrypt(rec: SecretRecord, pwd?: string) {
        const parsed = parseFragment(fragment);
        if (!parsed) {
            setState({ status: 'error', message: 'No cipher key found in this scroll.' });
            return;
        }

        setDecrypting(true);
        try {
            const plaintext = await decryptContent({
                ciphertext: rec.ciphertext,
                iv: rec.iv,
                salt: parsed.salt ?? rec.salt,
                urlKey: parsed.key,
                password: pwd,
            });

            setState({ status: 'decrypted', content: plaintext, record: rec });
        } catch {
            if (parsed.salt || rec.salt) {
                setState({ status: 'needs-password' });
            } else {
                setState({
                    status: 'error',
                    message: 'Decryption failed. The parchment has been corrupted.',
                });
            }
        } finally {
            setDecrypting(false);
        }
    }

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        async function load() {
            try {
                const rec = await fetchSecret(id);
                if (!rec) {
                    setState({ status: 'not-found' });
                    return;
                }
                setRecord(rec);

                const parsed = parseFragment(fragment);
                if (!parsed) {
                    setState({ status: 'error', message: 'No decryption key in the link.' });
                    return;
                }

                if (parsed.salt || rec.salt) {
                    setState({ status: 'needs-password' });
                    return;
                }

                await attemptDecrypt(rec);
            } catch {
                setState({
                    status: 'error',
                    message: 'Failed to retrieve the scroll from the idol.',
                });
            }
        }
        load();
    }, [id, fragment]);

    // Feature 3: Incense Burner (Visual Countdown Logic)
    useEffect(() => {
        if (state.status !== 'decrypted' || !state.record.expires_at) return;
        
        const expiryTime = new Date(state.record.expires_at).getTime();

        const timer = setInterval(() => {
            const now = Date.now();
            const difference = expiryTime - now;

            if (difference <= 0) {
                // Time has run out, auto-trigger the Death screen
                setState({ status: 'not-found' });
                clearInterval(timer);
            } else {
                setTimeLeft(difference);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [state]);

    function handlePasswordSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!record || !password) return;
        attemptDecrypt(record, password);
    }

    function handleDownload() {
        if (state.status !== 'decrypted' || !record) return;
        const blob = new Blob([base64ToFile(state.content)], { type: record.file_mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = record.file_name || 'download';
        a.click();
        URL.revokeObjectURL(url);
    }

    if (state.status === 'loading') {
        return (
            <div className="max-w-md mx-auto my-auto p-12 text-center">
                <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-4" />
                <p className="text-stone-400 text-xs tracking-widest uppercase font-serif">
                    Unrolling the scroll...
                </p>
            </div>
        );
    }

    // THE SEKIRO DEATH SCREEN (死)
    if (state.status === 'not-found') {
        return (
            <div className="fixed inset-0 bg-stone-950/95 flex flex-col items-center justify-center z-50 p-6 animate-death">
                <div className="relative">
                    <h1 className="text-[120px] sm:text-[160px] text-red-600 font-bold leading-none select-none tracking-widest drop-shadow-[0_0_35px_rgba(220,38,38,0.8)]">
                        死
                    </h1>
                </div>
                <h2 className="text-amber-100 font-serif text-xl sm:text-2xl mt-4 tracking-[0.3em] uppercase font-bold text-center">
                    The Scroll Has Turned to Ash
                </h2>
                <p className="text-stone-500 text-xs tracking-widest uppercase mt-2 text-center max-w-sm">
                    This secret was burned after reading or dissolved with time.
                </p>
                <button
                    onClick={() => onNavigate('/')}
                    className="mt-8 px-6 py-2.5 rounded bg-red-950 border border-red-700/80 hover:bg-red-900 text-amber-100 font-serif text-xs tracking-[0.2em] uppercase transition-all shadow-[0_0_20px_rgba(153,27,27,0.4)]"
                >
                    Resurrect (Inscribe New Secret)
                </button>
            </div>
        );
    }

    if (state.status === 'needs-password') {
        return (
            <div className="max-w-md mx-auto my-auto">
                <div className="scroll-panel rounded-lg p-8 shadow-idol border border-red-900/40">
                    <div className="w-12 h-12 rounded bg-red-950/40 border border-red-700/60 flex items-center justify-center mx-auto mb-4">
                        <Bell className="w-6 h-6 text-red-500 animate-pulse" />
                    </div>
                    <h2 className="text-lg font-bold text-red-400 text-center tracking-widest uppercase font-serif mb-1">
                        Demon Bell Active
                    </h2>
                    <p className="text-stone-400 text-xs text-center mb-6 font-serif">
                        This parchment is sealed with an ancient cipher phrase.
                    </p>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter cipher phrase..."
                            autoFocus
                            className="w-full bg-stone-950 border border-red-900/60 rounded p-3 text-red-200 text-xs tracking-wider placeholder-red-950 focus:outline-none focus:border-red-600 shadow-[0_0_15px_rgba(153,27,27,0.15)]"
                        />
                        <button
                            type="submit"
                            disabled={decrypting || !password}
                            className="w-full bg-red-950 hover:bg-red-900 border border-red-700/80 text-amber-100 font-serif text-xs tracking-widest uppercase py-3 rounded transition-all shadow-[0_0_15px_rgba(153,27,27,0.3)]"
                        >
                            {decrypting ? 'Breaking Seal...' : 'Break Seal'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <div className="max-w-md mx-auto my-auto p-8 scroll-panel rounded-lg text-center">
                <h2 className="text-lg font-serif text-red-400 uppercase tracking-widest mb-2">
                    Corrupted Parchment
                </h2>
                <p className="text-stone-400 text-xs mb-6">{state.message}</p>
                <button
                    onClick={() => onNavigate('/')}
                    className="px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 text-xs tracking-wider uppercase"
                >
                    Return to Idol
                </button>
            </div>
        );
    }

    const rec = state.record;
    return (
        <div className="max-w-2xl mx-auto my-auto">
            <div className="scroll-panel rounded-lg shadow-idol overflow-hidden">
                <div className="bg-amber-950/40 border-b border-amber-900/40 px-6 py-3 flex items-center gap-2">
                    <Scroll className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-200 text-xs font-serif tracking-widest uppercase">
                        Decrypted in your browser • Zero-Knowledge Verified
                    </span>
                </div>

                <div className="p-6 space-y-4">
                    
                    {/* Incense Burner Timer Element */}
                    {timeLeft !== null && (
                        <div className="mb-6 bg-stone-950/50 p-4 rounded border border-stone-800">
                            <div className="flex justify-between text-[11px] text-amber-500/80 font-serif uppercase tracking-widest mb-2">
                                <span className="flex items-center gap-2"><Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse"/> Incense Burner (Auto-Destruct)</span>
                                <span className="text-orange-400 font-bold">{formatTime(timeLeft)}</span>
                            </div>
                            <div className="h-1.5 bg-stone-900 rounded-full overflow-hidden border border-stone-800">
                                <div className="h-full bg-gradient-to-r from-amber-700 via-orange-500 to-red-500 shadow-[0_0_15px_rgba(217,119,6,0.9)] animate-pulse" style={{ width: '100%' }} />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {rec.burn_after_read && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/60 border border-red-800 text-red-300 text-[11px] font-serif uppercase tracking-wider">
                                <Flame className="w-3 h-3 text-red-500" /> Burned to Ash
                            </span>
                        )}
                        {rec.expires_at && !timeLeft && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-stone-900 border border-stone-700 text-stone-400 text-[11px] font-serif uppercase tracking-wider">
                                <Clock className="w-3 h-3 text-amber-600" /> Expires {new Date(rec.expires_at).toLocaleTimeString()}
                            </span>
                        )}
                    </div>

                    {rec.is_file ? (
                        <div className="bg-stone-950 border border-stone-800 rounded p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="w-6 h-6 text-amber-500" />
                                <div>
                                    <p className="text-amber-100 text-sm font-serif">{rec.file_name}</p>
                                    <p className="text-stone-500 text-xs">{rec.file_size ? `${(rec.file_size / 1024).toFixed(1)} KB` : ''}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleDownload}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-red-950 border border-red-700 hover:bg-red-900 text-amber-200 text-xs uppercase tracking-wider font-serif transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" /> Claim Artifact
                            </button>
                        </div>
                    ) : (
                        <div className="bg-stone-950 border border-stone-800 rounded p-4 relative">
                            <pre className="text-amber-100 text-sm whitespace-pre-wrap break-words font-mono selection:bg-red-950 relative z-10">
                                {state.content}
                            </pre>
                        </div>
                    )}

                    {rec.burn_after_read && (
                        <div className="bg-red-950/30 border border-red-900/40 rounded p-3">
                            <p className="text-red-300 text-xs font-serif tracking-wider">
                                <strong>Note:</strong> This secret has already been deleted from the server. Refreshing or reopening will trigger the Death screen.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => onNavigate('/')}
                        className="flex items-center gap-2 mx-auto mt-4 px-5 py-2.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-700 text-stone-300 text-xs uppercase tracking-widest font-serif transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5 text-amber-500" /> Inscribe Another
                    </button>
                </div>
            </div>
        </div>
    );
}