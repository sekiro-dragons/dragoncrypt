import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Plus, Flame, Scroll, Volume2, VolumeX } from 'lucide-react';
import { CreatePage } from '@/components/CreatePage';
import { ViewPage } from '@/components/ViewPage';

type Route =
    | { name: 'home' }
    | { name: 'view'; id: string; fragment: string };

function parseRoute(): Route {
    const hash = window.location.hash;
    // Matches #/view/<id>#k=... or #/view/<id>?k=... (Fixes the decryption key parsing)
    const viewMatch = hash.match(/^#\/view\/([^#?]+)(.*)?$/);
    if (viewMatch) {
        return {
            name: 'view',
            id: viewMatch[1],
            fragment: viewMatch[2] || '',
        };
    }
    return { name: 'home' };
}

export default function App() {
    const [route, setRoute] = useState<Route>(parseRoute);
    const [isMuted, setIsMuted] = useState(true);
    const audioRef = useRef<HTMLAudioElement>(null);

    const toggleAudio = () => {
        if (audioRef.current) {
            if (isMuted) {
                audioRef.current.play();
                audioRef.current.muted = false;
            } else {
                audioRef.current.pause();
            }
            setIsMuted(!isMuted);
        }
    };

    useEffect(() => {
        function onHashChange() {
            setRoute(parseRoute());
        }
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const navigate = useCallback((path: string) => {
        window.location.hash = path;
        setRoute(parseRoute());
    }, []);

    return (
        <div className="min-h-screen ember-bg text-stone-200 flex flex-col selection:bg-red-950 selection:text-amber-200">
            
            {/* The gritty ash noise texture overlay */}
            <div className="ash-overlay"></div>

            {/* Ambient Idol Fire Light (Blended with the background) */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[450px] bg-amber-500/10 rounded-full blur-[140px] mix-blend-screen" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-red-900/15 rounded-full blur-[150px] mix-blend-color-dodge" />
            </div>

            {/* Background Audio Player */}
            <audio ref={audioRef} src="/sekiro-theme.mp3" loop />
            
            {/* Floating Audio Toggle */}
            <button
                onClick={toggleAudio}
                className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-stone-900/80 backdrop-blur-md border border-amber-800/60 rounded-full flex items-center justify-center text-amber-500 hover:text-amber-300 hover:border-amber-500 hover:shadow-[0_0_15px_rgba(217,119,6,0.4)] transition-all cursor-pointer"
                title={isMuted ? "Play Theme" : "Mute Theme"}
            >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Header - Now slightly more transparent */}
            <header className="relative z-10 border-b border-amber-900/30 bg-stone-950/50 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-3 group text-left"
                    >
                        <div className="w-10 h-10 rounded bg-stone-900/80 border border-amber-800/50 flex items-center justify-center group-hover:border-red-600 group-hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all">
                            <span className="text-red-500 font-serif font-bold text-xl drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]">竜</span>
                        </div>
                        <div>
                            <span className="text-amber-100 font-bold tracking-[0.2em] text-lg block font-serif uppercase drop-shadow-md">
                                Dragoncrypt
                            </span>
                            <span className="text-stone-400 text-[11px] tracking-widest block uppercase font-bold">
                                影は二度死ぬ • Secrets Die Twice
                            </span>
                        </div>
                    </button>

                    <div className="flex items-center gap-4">
                        <a
                            href="#how-it-works"
                            onClick={(e) => {
                                e.preventDefault();
                                navigate('/');
                                setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('open-security-modal'));
                                }, 50);
                            }}
                            className="hidden sm:flex items-center gap-2 text-xs tracking-widest text-stone-300 hover:text-amber-300 transition-colors uppercase font-bold drop-shadow-md"
                        >
                            <Scroll className="w-4 h-4 text-amber-500" />
                            The Shinobi Code
                        </a>
                        <button
                            onClick={() => {
                                navigate('/');
                                setTimeout(() => {
                                    document.getElementById('create-section')?.scrollIntoView({ behavior: 'smooth' });
                                }, 50);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded bg-amber-950/40 border border-amber-800/60 hover:border-amber-500 text-amber-100 text-xs tracking-widest font-bold uppercase hover:shadow-[0_0_20px_rgba(217,119,6,0.3)] transition-all backdrop-blur-sm"
                        >
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                            New Secret
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Section */}
            <main className="relative z-10 flex-1 flex flex-col">
                {route.name === 'home' && <HomePage onNavigate={navigate} />}
                {route.name === 'view' && (
                    <ViewPage
                        id={route.id}
                        fragment={route.fragment}
                        onNavigate={navigate}
                    />
                )}
            </main>

            {/* Footer */}
            <footer className="relative z-10 border-t border-amber-900/30 py-6 bg-stone-950/60 backdrop-blur-md">
                <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-stone-400 text-xs tracking-wider text-center sm:text-left font-bold">
                        Encrypted with client-side AES-256-GCM. Unreadable by the server.
                    </p>
                    <div className="flex items-center gap-4 text-stone-400 text-xs tracking-widest uppercase font-bold">
                        <span className="flex items-center gap-1.5 hover:text-amber-300 transition-colors cursor-default">
                            <Flame className="w-3.5 h-3.5 text-amber-500" /> Sculptor's Flame
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-red-400 transition-colors cursor-default">
                            <Shield className="w-3.5 h-3.5 text-red-500" /> Zero Knowledge
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function HomePage({ onNavigate }: { onNavigate: (path: string) => void }) {
    return (
        <div className="flex-1 flex flex-col">
            {/* Hero */}
            <section className="px-6 pt-16 pb-12 text-center">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded border border-amber-800/40 bg-stone-900/60 text-amber-400 text-xs tracking-widest uppercase mb-6 shadow-sm backdrop-blur-md">
                    <Flame className="w-3.5 h-3.5 text-amber-500" />
                    Commune with the Sculptor's Idol
                </div>
                <h1 className="text-4xl sm:text-6xl font-extrabold text-stone-100 mb-4 tracking-[0.15em] uppercase font-serif drop-shadow-lg">
                    Secrets Written in <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-red-500 to-amber-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                        Ash & Blood
                    </span>
                </h1>
                <p className="text-stone-300 text-base sm:text-lg max-w-xl mx-auto mb-8 font-serif leading-relaxed drop-shadow-md">
                    Whisper words into an ancient scroll. Once read by the recipient, the parchment burns into nothingness.
                </p>
                <div className="flex items-center justify-center gap-4">
                    <a
                        href="#create-section"
                        onClick={(e) => {
                            e.preventDefault();
                            document.getElementById('create-section')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="px-6 py-3 rounded bg-red-950/80 border border-red-700/60 hover:border-red-500 hover:bg-red-900 text-amber-100 font-serif text-xs tracking-widest uppercase shadow-[0_0_20px_rgba(153,27,27,0.3)] transition-all backdrop-blur-sm"
                    >
                        Inscribe a Secret
                    </a>
                </div>
            </section>

            {/* Form Section */}
            <section id="create-section" className="px-6 pb-20 scroll-mt-20">
                <CreatePage onNavigate={onNavigate} />
            </section>
        </div>
    );
}