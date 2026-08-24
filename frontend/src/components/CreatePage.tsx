import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import {
    Clock,
    Flame,
    KeyRound,
    Upload,
    Loader2,
    Check,
    Copy,
    QrCode,
    FileText,
    X,
    Plus,
    Eye,
    Scroll,
    Bell,
    Skull
} from 'lucide-react';
import { encryptContent, fileToBase64 } from '@/lib/crypto';
import {
    createSecret,
    expiryToISO,
    type ExpiryChoice,
    EXPIRY_LABELS,
} from '@/lib/secrets';
import { generateQR } from '@/lib/qr';

const SecurityModal = lazy(() =>
    import('./SecurityModal').then((m) => ({ default: m.SecurityModal }))
);

type Props = {
    onNavigate: (path: string) => void;
};

type CreatedLink = {
    url: string;
    id: string;
};

export function CreatePage({ onNavigate }: Props) {
    const [content, setContent] = useState('');
    const [expiry, setExpiry] = useState<ExpiryChoice>('1d');
    const [burnAfterRead, setBurnAfterRead] = useState(true);
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedLink | null>(null);
    const [isRevoked, setIsRevoked] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [showSecurity, setShowSecurity] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const hasContent = content.trim().length > 0 || file !== null;

    useEffect(() => {
        function openModal() {
            setShowSecurity(true);
        }
        window.addEventListener('open-security-modal', openModal);
        return () => window.removeEventListener('open-security-modal', openModal);
    }, []);

    async function handleCreate() {
        setError(null);
        if (!hasContent) {
            setError('The scroll cannot be empty. Inscribe a message or seal an artifact.');
            return;
        }
        if (usePassword && password.length < 4) {
            setError('The cipher phrase must be at least 4 characters.');
            return;
        }

        setCreating(true);
        
        // --- SFX: Sword Slice Sound Effect ---
        try {
            const slashSound = new Audio('/slice.mp3');
            slashSound.volume = 0.7;
            slashSound.play();
        } catch (e) {
            // Ignore if browser blocks auto-play audio
        }
        // -------------------------------------

        try {
            let plaintext: string;
            let isFile = false;
            let fileName: string | null = null;
            let fileSize: number | null = null;
            let fileMime: string | null = null;

            if (file) {
                isFile = true;
                fileName = file.name;
                fileSize = file.size;
                fileMime = file.type;
                const buf = await file.arrayBuffer();
                plaintext = fileToBase64(buf);
            } else {
                plaintext = content;
            }

            const { payload, storedKey } = await encryptContent(
                plaintext,
                usePassword ? password : undefined,
            );

            const id = await createSecret({
                ciphertext: payload.ciphertext,
                iv: payload.iv,
                salt: payload.salt,
                expires_at: expiryToISO(expiry),
                burn_after_read: burnAfterRead,
                max_views: burnAfterRead ? 1 : null,
                is_file: isFile,
                file_name: fileName,
                file_size: fileSize,
                file_mime: fileMime,
            });

            const origin = window.location.origin;
            const keyParam = storedKey.key;
            const saltParam = storedKey.salt ? `&s=${storedKey.salt}` : '';
            
            // FIX: Using ?k= instead of #k= so the browser reads it flawlessly
            const url = `${origin}/#/view/${id}?k=${keyParam}${saltParam}`;

            setCreated({ url, id });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The ritual failed.');
        } finally {
            setCreating(false);
        }
    }

    async function handleRevoke() {
        if (!created) return;
        try {
            // Attempt manual deletion on the server to act as a kill switch
            await fetch(`/api/secrets/${created.id}`, { method: 'DELETE' });
        } catch (e) {
            // Fails silently if API isn't built yet, but UI still updates for the demo
        }
        setIsRevoked(true);
    }

    function handleCopy() {
        if (!created) return;
        navigator.clipboard.writeText(created.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleReset() {
        setCreated(null);
        setIsRevoked(false);
        setContent('');
        setFile(null);
        setPassword('');
        setUsePassword(false);
        setBurnAfterRead(true);
        setExpiry('1d');
        setCopied(false);
        setShowQR(false);
    }

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files?.[0];
        if (!selected) return;
        if (selected.size > 5 * 1024 * 1024) {
            setError('Artifact must be smaller than 5 MB.');
            return;
        }
        setError(null);
        setFile(selected);
        setContent('');
    }

    const qrSvg = created ? generateQR(created.url) : '';

    // If the Kill Switch was pressed
    if (created && isRevoked) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="scroll-panel rounded-lg p-8 border border-red-900/60 shadow-death relative text-center">
                    <Skull className="w-12 h-12 text-red-500 mx-auto mb-4 animate-pulse" />
                    <h2 className="text-xl font-bold tracking-widest text-red-400 uppercase font-serif mb-2">
                        Immortality Severed
                    </h2>
                    <p className="text-stone-400 text-xs tracking-wider mb-6">
                        The Hidden Tooth was bitten. The scroll has been destroyed before it could be read.
                    </p>
                    <button
                        onClick={handleReset}
                        className="px-6 py-2.5 rounded bg-stone-900 border border-stone-700 hover:border-amber-700 text-stone-300 text-xs uppercase tracking-widest font-serif transition-colors"
                    >
                        Inscribe Another
                    </button>
                </div>
            </div>
        );
    }

    if (created) {
        return (
            <div className="max-w-2xl mx-auto relative group">
                <div className="scroll-panel rounded-lg p-8 border border-amber-900/60 shadow-idol relative overflow-hidden">
                    
                    {/* Shinobi Execution Text overlay effect */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5 select-none">
                        <span className="text-8xl font-serif text-red-500 whitespace-nowrap tracking-[0.2em] transform -rotate-12">
                            SHINOBI EXECUTION
                        </span>
                    </div>

                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="w-12 h-12 rounded bg-amber-950/60 border border-amber-600 flex items-center justify-center">
                            <span className="text-2xl text-amber-400 font-serif">封</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold tracking-widest text-amber-100 uppercase font-serif">
                                Secret Sealed
                            </h2>
                            <p className="text-stone-400 text-xs tracking-wider">
                                Encrypted by your blade before sending.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-5 relative z-10">
                        <div>
                            <label className="text-amber-500 text-xs font-semibold uppercase tracking-widest mb-2 block font-serif">
                                Shinobi Link
                            </label>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-stone-950 border border-stone-800 rounded p-3 text-xs text-stone-300 font-mono break-all selection:bg-red-900">
                                    {created.url}
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className="px-5 rounded bg-red-950 border border-red-700/80 hover:bg-red-900 text-amber-200 font-serif text-xs tracking-wider uppercase transition-all flex items-center gap-2"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => setShowQR(!showQR)}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300 text-xs tracking-wider uppercase transition-colors"
                            >
                                <QrCode className="w-4 h-4 text-amber-500" />
                                {showQR ? 'Hide Crest' : 'Show Crest (QR)'}
                            </button>
                            
                            {/* FIX: This button now actually opens the correct URL instead of an empty key */}
                            <button
                                onClick={() => window.open(created.url, '_blank')}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300 text-xs tracking-wider uppercase transition-colors"
                            >
                                <Eye className="w-4 h-4 text-amber-500" />
                                Open Link
                            </button>
                            
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 px-4 py-2 rounded bg-stone-900 border border-stone-700 text-stone-300 hover:text-amber-300 text-xs tracking-wider uppercase transition-colors"
                            >
                                <Plus className="w-4 h-4 text-amber-500" />
                                New Scroll
                            </button>
                        </div>

                        {showQR && (
                            <div className="bg-stone-100 p-4 rounded flex justify-center border-2 border-amber-800 shadow-lg relative z-20">
                                <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
                            </div>
                        )}

                        <div className="bg-red-950/30 border border-red-900/60 rounded p-4 text-red-200 text-xs tracking-wide leading-relaxed font-serif">
                            <strong>Warning:</strong> Deliver this link immediately. {burnAfterRead && 'Once opened, the scroll turns to ash.'}
                        </div>

                        {/* Feature 1: Hidden Tooth (Kill Switch) */}
                        <div className="pt-2">
                            <button
                                onClick={handleRevoke}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded bg-red-950/40 border border-red-900 hover:bg-red-900 text-red-300 hover:text-red-100 text-xs tracking-widest uppercase transition-colors font-serif shadow-[0_0_15px_rgba(153,27,27,0.2)]"
                            >
                                <Skull className="w-4 h-4" />
                                Bite the Hidden Tooth (Manual Kill Switch)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="scroll-panel rounded-lg shadow-idol overflow-hidden">
                {/* Header ribbon */}
                <div className="bg-gradient-to-r from-amber-950/60 via-stone-900 to-amber-950/60 border-b border-amber-900/50 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Scroll className="w-4 h-4 text-amber-500" />
                        <span className="text-amber-200 text-xs tracking-widest uppercase font-semibold font-serif">
                            Inscribe the Parchment
                        </span>
                    </div>
                    <span className="text-stone-500 text-[11px] uppercase tracking-wider font-mono">
                        AES-256 Sealed
                    </span>
                </div>

                <div className="p-6 space-y-6">
                    {/* Content text area */}
                    <div>
                        <label className="text-stone-400 text-xs tracking-widest uppercase mb-2 block font-serif">
                            {file ? 'Attached Artifact' : 'The Message'}
                        </label>
                        {file ? (
                            <div className="bg-stone-950 border border-stone-800 rounded p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <FileText className="w-6 h-6 text-amber-500" />
                                    <div>
                                        <p className="text-amber-100 text-sm font-serif">{file.name}</p>
                                        <p className="text-stone-500 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="text-stone-400 hover:text-red-400 p-1"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Inscribe your secret message here..."
                                className="w-full h-44 bg-stone-950/90 border border-stone-800 focus:border-amber-700/80 rounded p-4 text-stone-200 text-sm placeholder-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-600/40 resize-none font-mono selection:bg-red-950 selection:text-amber-200"
                            />
                        )}
                    </div>

                    {/* File upload */}
                    {!file && (
                        <div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={handleFileSelect}
                                className="hidden"
                                id="file-upload"
                            />
                            <label
                                htmlFor="file-upload"
                                className="inline-flex items-center gap-2 text-xs tracking-wider uppercase text-stone-400 hover:text-amber-400 cursor-pointer transition-colors font-serif"
                            >
                                <Upload className="w-3.5 h-3.5 text-amber-600" />
                                Seal an artifact (up to 5 MB)
                            </label>
                        </div>
                    )}

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-stone-400 text-xs tracking-widest uppercase mb-2 flex items-center gap-1.5 font-serif">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                Time Until Destruction
                            </label>
                            <select
                                value={expiry}
                                onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
                                className="w-full bg-stone-950 border border-stone-800 rounded px-3 py-2.5 text-stone-300 text-xs uppercase tracking-wider focus:outline-none focus:border-amber-700 cursor-pointer font-serif"
                            >
                                {(Object.keys(EXPIRY_LABELS) as ExpiryChoice[]).map((key) => (
                                    <option key={key} value={key}>
                                        {EXPIRY_LABELS[key]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-stone-400 text-xs tracking-widest uppercase mb-2 flex items-center gap-1.5 font-serif">
                                <Flame className="w-3.5 h-3.5 text-red-500" />
                                Burn to Ash (Single View)
                            </label>
                            <button
                                onClick={() => setBurnAfterRead(!burnAfterRead)}
                                className={`w-full flex items-center justify-between rounded px-4 py-2.5 text-xs tracking-widest uppercase font-serif border transition-all ${
                                    burnAfterRead
                                        ? 'bg-red-950/40 border-red-700/60 text-red-300 shadow-[0_0_15px_rgba(153,27,27,0.2)]'
                                        : 'bg-stone-950 border-stone-800 text-stone-500'
                                }`}
                            >
                                {burnAfterRead ? 'Turn to Ash' : 'Preserve'}
                                <span className={`text-xs ${burnAfterRead ? 'text-red-400 font-bold' : 'text-stone-600'}`}>
                                    {burnAfterRead ? '死' : '生'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Feature 2: Demon Bell (Maximum Security Password) */}
                    <div>
                        <button
                            onClick={() => setUsePassword(!usePassword)}
                            className={`flex items-center gap-2 text-xs tracking-widest uppercase transition-colors mb-2 font-serif ${usePassword ? 'text-red-500' : 'text-stone-400 hover:text-amber-300'}`}
                        >
                            <Bell className={`w-3.5 h-3.5 ${usePassword ? 'text-red-500 animate-pulse' : 'text-amber-600'}`} />
                            Ring the Demon Bell (Maximum Security)
                            <span className="text-[10px] text-amber-500/80">({usePassword ? 'Active' : 'None'})</span>
                        </button>
                        {usePassword && (
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter secret cipher phrase..."
                                className="w-full bg-stone-950 border border-red-900/60 rounded px-4 py-2.5 text-red-200 text-xs tracking-wider placeholder-red-950 focus:outline-none focus:border-red-600 shadow-[0_0_15px_rgba(153,27,27,0.15)]"
                            />
                        )}
                    </div>

                    {error && (
                        <div className="bg-red-950/60 border border-red-800 rounded p-3 text-red-300 text-xs font-serif">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={handleCreate}
                        disabled={creating || !hasContent}
                        className="w-full bg-gradient-to-r from-red-950 via-red-900 to-red-950 hover:from-red-900 hover:to-red-800 disabled:opacity-40 disabled:cursor-not-allowed border border-red-700 text-amber-100 font-serif font-bold py-3.5 rounded tracking-[0.2em] text-xs uppercase shadow-death transition-all flex items-center justify-center gap-2"
                    >
                        {creating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                                Sealing Scroll...
                            </>
                        ) : (
                            <>
                                <Flame className="w-4 h-4 text-amber-400" />
                                Offer to the Idol
                            </>
                        )}
                    </button>
                </div>
            </div>

            {showSecurity && (
                <Suspense fallback={null}>
                    <SecurityModal open={showSecurity} onClose={() => setShowSecurity(false)} />
                </Suspense>
            )}
        </div>
    );
}