'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Song } from '../interface';
import { emitGameEvent, getSocket, onGameEvent } from '../lib/socketClient';

// Pool file mapping
const POOL_FILES: Record<string, string> = {
    newbieQual1: '/pools/N1 - newbieQual1.json',
    newbieQual2: '/pools/N2 - newbieQual2.json',
    newbieSemi: '/pools/N3 - newbieSemi.json',
    newbieFinals: '/pools/N4 - newbieFinals.json',
    proQual: '/pools/P1 - proTop3216.json',
    proTop8: '/pools/P2 - proTop8.json',
    proSemi: '/pools/P3 - proSemi.json',
    proFinals: '/pools/P4 - proFinals.json',
    top32: '/pools/top32.json',
};

// Available pools
const POOL_OPTIONS = [
    { id: 'newbieQual1', name: 'Bảng dưới - Vòng loại 1', file: 'N1 - newbieQual1.json' },
    { id: 'newbieQual2', name: 'Bảng dưới - Vòng loại 2', file: 'N2 - newbieQual2.json' },
    { id: 'newbieSemi', name: 'Bảng dưới - Bán kết', file: 'N3 - newbieSemi.json' },
    { id: 'newbieFinals', name: 'Bảng dưới - Chung kết', file: 'N4 - newbieFinals.json' },
    { id: 'proQual', name: 'Bảng trên - Vòng 32 và 16', file: 'P1 - proTop3216.json' },
    { id: 'proTop8', name: 'Bảng trên - Vòng 8', file: 'P2 - proTop8.json' },
    { id: 'proSemi', name: 'Bảng trên - Bán kết', file: 'P3 - proSemi.json' },
    { id: 'proFinals', name: 'Bảng trên - Chung kết', file: 'P4 - proFinals.json' },
    { id: 'top32', name: 'Top 32 (Custom)', file: 'top32.json' },
];

// Helper to ensure songs have id field
const ensureIds = (songs: any[]): Song[] => {
    return songs.map((song, index) => ({
        ...song,
        id: song.id || `${song.title}-${song.diff}-${index}`,
        isDx: String(song.isDx)
    }));
};

export default function ControllerPage() {
    const router = useRouter();

    // Settings state
    const [selectedPool, setSelectedPool] = useState('newbieSemi');
    const [songData, setSongData] = useState<Song[]>([]);
    const [isLoadingPool, setIsLoadingPool] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [randomCount, setRandomCount] = useState(4);
    const [pickCount, setPickCount] = useState(2);
    const [banCount, setBanCount] = useState(0);
    const [fixedSongs, setFixedSongs] = useState<Song[]>([]);
    const [lockedTracks, setLockedTracks] = useState<{ track3?: Song; track4?: Song }>({});
    const [hiddenTracks, setHiddenTracks] = useState<{ track3Hidden: boolean; track4Hidden: boolean }>({
        track3Hidden: false,
        track4Hidden: false
    });

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [poolSearch, setPoolSearch] = useState('');
    const [showPoolDropdown, setShowPoolDropdown] = useState(false);
    const [track3Search, setTrack3Search] = useState('');
    const [track4Search, setTrack4Search] = useState('');
    const [showTrack3Dropdown, setShowTrack3Dropdown] = useState(false);
    const [showTrack4Dropdown, setShowTrack4Dropdown] = useState(false);
    const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
    const [banPickLog, setBanPickLog] = useState<{ type: 'ban' | 'pick'; song: Song }[]>([]);

    // Stream text state
    const [streamText, setStreamText] = useState({
        player1: '', player1Tag: '', player1UseJson: false,
        player2: '', player2Tag: '', player2UseJson: false,
        player3: '', player3Tag: '', player3UseJson: false,
        player4: '', player4Tag: '', player4UseJson: false,
        roundName: '', roundUseJson: false
    });
    const [playerJsonData, setPlayerJsonData] = useState<{ name: string; tag: string }[]>([]);
    const [roundJsonData, setRoundJsonData] = useState<string[]>([]);
    const [showPlayerDropdown, setShowPlayerDropdown] = useState<number | null>(null);
    const [showRoundDropdown, setShowRoundDropdown] = useState(false);
    const [customPoolData, setCustomPoolData] = useState<Song[]>([]);

    // Game control state (synced with Home page)
    const [randomResults, setRandomResults] = useState<Song[]>([]);
    const [pickBanPoolSongs, setPickBanPoolSongs] = useState<Song[]>([]);
    const [bannedSongs, setBannedSongs] = useState<Song[]>([]);
    const [pickedSongs, setPickedSongs] = useState<Song[]>([]);
    const [showBanPick, setShowBanPick] = useState(false);
    const [showFinalResults, setShowFinalResults] = useState(false);
    const [selectedSongIndex, setSelectedSongIndex] = useState(0);
    const lastSyncTime = useRef(0);

    // Match control state
    const [matchSongs, setMatchSongs] = useState<Song[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [isMatchPhase, setIsMatchPhase] = useState(false);

    // Sync state from server when connecting/reconnecting
    useEffect(() => {
        const socket = getSocket();

        // Listen for full state sync from server
        const unsubFullSync = onGameEvent('FULL_STATE_SYNC', (state: any) => {
            console.log('🔄 Controller synced from server');
            if (state.randomResults?.length > 0) {
                setRandomResults(state.randomResults);
                setPickBanPoolSongs([...state.randomResults, ...(state.fixedSongs || [])]);
            }
            if (state.bannedSongs) setBannedSongs(state.bannedSongs);
            if (state.pickedSongs) setPickedSongs(state.pickedSongs);
            if (state.phase === 'banpick') setShowBanPick(true);
            if (state.phase === 'final') setShowFinalResults(true);
            if (state.phase === 'match') {
                setIsMatchPhase(true);
                setMatchSongs(state.matchSongs || []);
                setCurrentMatchIndex(state.currentMatchIndex || 0);
            }
        });

        return () => {
            unsubFullSync();
        };
    }, []);

    // Load settings from localStorage on mount
    useEffect(() => {
        const savedPool = localStorage.getItem('selectedPool');
        const savedRandomCount = localStorage.getItem('randomCount');
        const savedPickCount = localStorage.getItem('pickCount');
        const savedBanCount = localStorage.getItem('banCount');
        const savedFixedSongs = localStorage.getItem('fixedSongs');
        const savedLockedTracks = localStorage.getItem('lockedTracks');
        const savedHiddenTracks = localStorage.getItem('hiddenTracks');
        
        if (savedPool && POOL_FILES[savedPool]) {
            setSelectedPool(savedPool);
        }
        
        if (savedRandomCount) setRandomCount(parseInt(savedRandomCount));
        if (savedPickCount) setPickCount(parseInt(savedPickCount));
        if (savedBanCount) setBanCount(parseInt(savedBanCount));
        if (savedFixedSongs) setFixedSongs(JSON.parse(savedFixedSongs));
        if (savedLockedTracks) setLockedTracks(JSON.parse(savedLockedTracks));
        if (savedHiddenTracks) setHiddenTracks(JSON.parse(savedHiddenTracks));
        
        // Load ban/pick log
        const savedBanPickLog = localStorage.getItem('banPickLog');
        if (savedBanPickLog) setBanPickLog(JSON.parse(savedBanPickLog));
    }, []);

    // Listen for ban/pick log updates from main page
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'banPickLog' && e.newValue) {
                setBanPickLog(JSON.parse(e.newValue));
            }
        };

        // Also poll localStorage for updates (same tab won't trigger storage event)
        const pollInterval = setInterval(() => {
            const savedLog = localStorage.getItem('banPickLog');
            if (savedLog) {
                const parsed = JSON.parse(savedLog);
                setBanPickLog(parsed);
            }
        }, 1000);

        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            clearInterval(pollInterval);
        };
    }, []);

    // Load stream text data and JSON files
    useEffect(() => {
        const savedStreamText = localStorage.getItem('streamTextData');
        if (savedStreamText) {
            const parsed = JSON.parse(savedStreamText);
            setStreamText(prev => ({ ...prev, ...parsed }));
        }

        // Load player JSON data
        fetch('/players.json')
            .then(res => res.ok ? res.json() : [])
            .then(data => setPlayerJsonData(data))
            .catch(() => setPlayerJsonData([]));

        // Load round JSON data
        fetch('/rounds.json')
            .then(res => res.ok ? res.json() : [])
            .then(data => setRoundJsonData(data))
            .catch(() => setRoundJsonData([]));
    }, []);

    // Sync game state via BroadcastChannel (no API)
    const syncGameState = (updates: any) => {
        // Send to all display pages via BroadcastChannel
        if (updates.randomResults !== undefined) {
            emitGameEvent('RANDOM_COMPLETE', { results: updates.randomResults });
        }
        if (updates.showBanPick !== undefined && updates.showBanPick) {
            emitGameEvent('SHOW_BAN_PICK', {});
        }
        if (updates.showFinalResults !== undefined && updates.showFinalResults) {
            emitGameEvent('SHOW_FINAL_RESULTS', {});
        }
        if (updates.bannedSongs !== undefined && updates.bannedSongs.length === 0 &&
            updates.pickedSongs !== undefined && updates.pickedSongs.length === 0) {
            emitGameEvent('RESET', {});
        }
    };

    // Trigger preview (Start) - display 6 random songs
    const triggerPreview = (customCount?: number) => {
        const countToUse = customCount !== undefined ? customCount : randomCount;
        const availablePool = songData.filter(
            song => !fixedSongs.find(f => f.id === song.id) &&
                song.id !== lockedTracks.track3?.id &&
                song.id !== lockedTracks.track4?.id
        );

        if (availablePool.length < countToUse) {
            alert('Not enough songs in pool for preview!');
            return;
        }

        // Shuffle and pick songs based on randomCount for preview
        const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
        const previewSongs = shuffled.slice(0, countToUse);

        // Send preview to display pages
        emitGameEvent('PREVIEW_START', { previewSongs, randomCount: countToUse });
    };

    // Trigger random from controller
    const triggerRandom = () => {
        const availablePool = songData.filter(
            song => !fixedSongs.find(f => f.id === song.id) &&
                song.id !== lockedTracks.track3?.id &&
                song.id !== lockedTracks.track4?.id
        );

        if (availablePool.length < randomCount) {
            alert('Not enough songs in pool!');
            return;
        }

        // Shuffle and pick
        const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
        const results = shuffled.slice(0, randomCount);

        setRandomResults(results);
        setShowBanPick(false);
        setShowFinalResults(false);
        setBannedSongs([]);
        setPickedSongs([]);
        setSelectedSongIndex(0);

        // Send animation pool to display pages with randomCount
        const animationPool = shuffled.slice(0, Math.min(60, availablePool.length));
        emitGameEvent('RANDOM_START', { animationPool, randomCount });

        // Animate for 3 seconds then show results
        const animationStart = Date.now();
        const animate = () => {
            const elapsed = Date.now() - animationStart;
            if (elapsed < 3000) {
                const slots = shuffled.sort(() => Math.random() - 0.5).slice(0, randomCount);
                emitGameEvent('RANDOM_ANIMATION', { slots });
                requestAnimationFrame(animate);
            } else {
                emitGameEvent('RANDOM_COMPLETE', { results });
            }
        };
        animate();
    };

    // Go to ban/pick phase
    const goToBanPickPhase = () => {
        if (randomResults.length === 0) return;
        setPickBanPoolSongs([...randomResults, ...fixedSongs]);
        setShowBanPick(true);
        setShowFinalResults(false);
        emitGameEvent('SHOW_BAN_PICK', {});
    };

    // Ban a song
    const handleBanSong = (song: Song) => {
        if (bannedSongs.length >= banCount) return;
        const newBanned = [...bannedSongs, song];
        setBannedSongs(newBanned);

        // Update log
        const newLog = [...banPickLog, { type: 'ban' as const, song }];
        setBanPickLog(newLog);
        localStorage.setItem('banPickLog', JSON.stringify(newLog));

        // Sync via BroadcastChannel
        emitGameEvent('BAN_SONG', { song });
    };

    // Pick a song
    const handlePickSong = (song: Song) => {
        if (bannedSongs.length < banCount) return; // Must finish banning first
        if (pickedSongs.length >= pickCount) return;

        const newPicked = [...pickedSongs, song];
        setPickedSongs(newPicked);

        // Update log
        const newLog = [...banPickLog, { type: 'pick' as const, song }];
        setBanPickLog(newLog);
        localStorage.setItem('banPickLog', JSON.stringify(newLog));

        // Sync via BroadcastChannel
        emitGameEvent('PICK_SONG', { song });

        // Check if complete
        if (newPicked.length >= pickCount) {
            setTimeout(() => {
                setShowFinalResults(true);
                emitGameEvent('SHOW_FINAL_RESULTS', {});
            }, 500);
        }
    };

    // Reset game
    const handleGameReset = () => {
        setRandomResults([]);
        setPickBanPoolSongs([]);
        setBannedSongs([]);
        setPickedSongs([]);
        setFixedSongs([...fixedSongs]);
        setShowBanPick(false);
        setShowFinalResults(false);
        setSelectedSongIndex(0);
        setBanPickLog([]);
        setMatchSongs([]);
        setCurrentMatchIndex(0);
        setIsMatchPhase(false);
        localStorage.removeItem('banPickLog');

        emitGameEvent('RESET', {});
    };

    // Go to match display
    const goToMatch = () => {
        const songs = [
            ...pickedSongs,
            ...(lockedTracks.track3 ? [lockedTracks.track3] : []),
            ...(lockedTracks.track4 ? [lockedTracks.track4] : [])
        ];

        setMatchSongs(songs);
        setCurrentMatchIndex(0);
        setIsMatchPhase(true);

        // Save to localStorage for OBS fallback
        localStorage.setItem('matchSongs', JSON.stringify(songs));
        localStorage.setItem('matchCurrentIndex', '0');

        emitGameEvent('GO_TO_MATCH', { songs });
    };

    // Match navigation
    const matchNext = () => {
        if (currentMatchIndex < matchSongs.length - 1) {
            const newIndex = currentMatchIndex + 1;
            setCurrentMatchIndex(newIndex);
            localStorage.setItem('matchCurrentIndex', String(newIndex));
            emitGameEvent('MATCH_NEXT', {});
        }
    };

    const matchPrev = () => {
        if (currentMatchIndex > 0) {
            const newIndex = currentMatchIndex - 1;
            setCurrentMatchIndex(newIndex);
            localStorage.setItem('matchCurrentIndex', String(newIndex));
            emitGameEvent('MATCH_PREV', {});
        }
    };

    // Check if song is banned/picked
    const isSongBanned = (song: Song) => bannedSongs.some(s => s.id === song.id);
    const isSongPicked = (song: Song) => pickedSongs.some(s => s.id === song.id);
    const isSongProcessed = (song: Song) => isSongBanned(song) || isSongPicked(song);

    // Game phase info
    const isBanPhase = showBanPick && bannedSongs.length < banCount;
    const isPickPhase = showBanPick && bannedSongs.length >= banCount && pickedSongs.length < pickCount;
    const remainingBans = banCount - bannedSongs.length;
    const remainingPicks = pickCount - pickedSongs.length;

    // Get available (unprocessed) songs for navigation
    const getAvailableSongs = () => randomResults.filter(s => !isSongProcessed(s));

    // Keyboard navigation for game control
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle if we have random results and in ban/pick phase
            if (randomResults.length === 0) return;

            const availableSongs = getAvailableSongs();
            if (availableSongs.length === 0) return;

            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSongIndex(prev => {
                    const currentInAvailable = availableSongs.findIndex(s => s.id === randomResults[prev]?.id);
                    const newIndex = currentInAvailable > 0 ? currentInAvailable - 1 : availableSongs.length - 1;
                    return randomResults.findIndex(s => s.id === availableSongs[newIndex]?.id);
                });
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSongIndex(prev => {
                    const currentInAvailable = availableSongs.findIndex(s => s.id === randomResults[prev]?.id);
                    const newIndex = currentInAvailable < availableSongs.length - 1 ? currentInAvailable + 1 : 0;
                    return randomResults.findIndex(s => s.id === availableSongs[newIndex]?.id);
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selectedSong = randomResults[selectedSongIndex];
                if (selectedSong && !isSongProcessed(selectedSong) && showBanPick) {
                    if (isBanPhase) {
                        handleBanSong(selectedSong);
                    } else if (isPickPhase) {
                        handlePickSong(selectedSong);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [randomResults, selectedSongIndex, showBanPick, isBanPhase, isPickPhase, bannedSongs, pickedSongs]);

    // Push stream text via BroadcastChannel
    const pushStreamText = () => {
        const textData = {
            player1: streamText.player1,
            player1Tag: streamText.player1Tag,
            player2: streamText.player2,
            player2Tag: streamText.player2Tag,
            player3: streamText.player3,
            player3Tag: streamText.player3Tag,
            player4: streamText.player4,
            player4Tag: streamText.player4Tag,
            roundName: streamText.roundName
        };

        // Save to localStorage (for same browser tabs)
        localStorage.setItem('streamTextData', JSON.stringify(textData));
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'streamTextData',
            newValue: JSON.stringify(textData)
        }));

        // Send via BroadcastChannel
        emitGameEvent('SETTINGS_UPDATE', { textData });
    };

    // Save all settings to localStorage AND sync via BroadcastChannel
    const saveSettings = () => {
        localStorage.setItem('selectedPool', selectedPool);
        localStorage.setItem('randomCount', String(randomCount));
        localStorage.setItem('pickCount', String(pickCount));
        localStorage.setItem('banCount', String(banCount));
        localStorage.setItem('fixedSongs', JSON.stringify(fixedSongs));
        localStorage.setItem('lockedTracks', JSON.stringify(lockedTracks));
        localStorage.setItem('hiddenTracks', JSON.stringify(hiddenTracks));

        // Dispatch storage event for other tabs/windows
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'controllerSettings',
            newValue: Date.now().toString()
        }));

        // Sync via BroadcastChannel
        emitGameEvent('SETTINGS_UPDATE', {
            selectedPool,
            randomCount,
            pickCount,
            banCount,
            fixedSongs,
            lockedTracks,
            hiddenTracks
        });
    };

    // Auto-save when settings change
    useEffect(() => {
        console.log(lockedTracks);
        saveSettings();
    }, [selectedPool, randomCount, pickCount, banCount, fixedSongs, lockedTracks, hiddenTracks]);

    // Load pool data when selected pool changes
    useEffect(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const loadPool = async () => {
            setIsLoadingPool(true);
            const poolFile = POOL_FILES[selectedPool];

            if (!poolFile) {
                console.error('Unknown pool:', selectedPool);
                setSelectedPool('newbieSemi');
                return;
            }

            try {
                const res = await fetch(`${poolFile}?t=${Date.now()}`, {
                    signal: abortController.signal,
                    cache: 'no-store'
                });

                if (!res.ok) {
                    throw new Error(`Failed to load ${poolFile}`);
                }

                const data = await res.json();

                if (!abortController.signal.aborted) {
                    setSongData(ensureIds(data));
                }
            } catch (error: any) {
                if (error.name === 'AbortError') return;
                console.error('Error loading pool:', error);
            } finally {
                if (!abortController.signal.aborted) {
                    setIsLoadingPool(false);
                }
            }
        };

        loadPool();

        return () => {
            abortController.abort();
        };
    }, [selectedPool]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.track3-container') && showTrack3Dropdown) {
                setShowTrack3Dropdown(false);
            }
            if (!target.closest('.track4-container') && showTrack4Dropdown) {
                setShowTrack4Dropdown(false);
            }
            if (!target.closest('.pool-container') && showPoolDropdown) {
                setShowPoolDropdown(false);
            }
        };

        if (showTrack3Dropdown || showTrack4Dropdown || showPoolDropdown) {
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 0);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showTrack3Dropdown, showTrack4Dropdown, showPoolDropdown]);

    const handlePoolChange = (poolId: string) => {
        setSelectedPool(poolId);
        // Reset selections when pool changes
        setFixedSongs([]);
        setLockedTracks({});
        setShowPoolDropdown(false);
        setPoolSearch('');
    };

    // Settings limits
    const maxRandom = 6;
    const minRandom = 2;
    const maxPick = 4;
    const minPick = 2;
    const fixedCount = fixedSongs.length;
    const totalSongs = randomCount + fixedCount;

    const handleRandomIncrement = () => {
        if (randomCount < maxRandom) {
            const newCount = randomCount + 1;
            setRandomCount(newCount);

            // If already showing random results, trigger a new preview with updated count
            if (randomResults.length > 0) {
                triggerPreview(newCount);
            }
        }
    };

    const handleRandomDecrement = () => {
        if (randomCount > minRandom) {
            const newCount = randomCount - 1;
            setRandomCount(newCount);

            // If already showing random results, trigger a new preview with updated count
            if (randomResults.length > 0) {
                triggerPreview(newCount);
            }
        }
    };

    const handlePickIncrement = () => {
        if (pickCount < maxPick && pickCount + banCount < totalSongs) {
            setPickCount(pickCount + 1);
        }
    };

    const handlePickDecrement = () => {
        if (pickCount > minPick) setPickCount(pickCount - 1);
    };

    const handleBanIncrement = () => {
        if (pickCount + banCount < totalSongs) {
            setBanCount(banCount + 1);
        }
    };

    const handleBanDecrement = () => {
        if (banCount > 0) setBanCount(banCount - 1);
    };

    const toggleSong = (song: Song) => {
        const isSelected = fixedSongs.find(s => s.id === song.id);
        if (isSelected) {
            setFixedSongs(fixedSongs.filter(s => s.id !== song.id));
        } else {
            setFixedSongs([...fixedSongs, song]);
        }
    };

    const getDiffColor = (diff: string) => {
        switch (diff) {
            case 'EXPERT': return 'text-red-400';
            case 'MASTER': return 'text-purple-400';
            case 'RE:MASTER':
            case 'Re:MASTER': return 'text-pink-400';
            default: return 'text-purple-300';
        }
    };

    // Filter out locked tracks from available pool
    const availablePool = songData.filter(song =>
        song.id !== lockedTracks.track3?.id &&
        song.id !== lockedTracks.track4?.id
    );

    // Filter pools for locked track dropdowns
    const track3Options = songData
        .filter(s => s.id !== lockedTracks.track4?.id)
        .filter(s =>
            s.title.toLowerCase().includes(track3Search.toLowerCase()) ||
            s.artist.toLowerCase().includes(track3Search.toLowerCase()) ||
            s.diff.toLowerCase().includes(track3Search.toLowerCase())
        );

    const track4Options = songData
        .filter(s => s.id !== lockedTracks.track3?.id)
        .filter(s =>
            s.title.toLowerCase().includes(track4Search.toLowerCase()) ||
            s.artist.toLowerCase().includes(track4Search.toLowerCase()) ||
            s.diff.toLowerCase().includes(track4Search.toLowerCase())
        );

    // Sort: selected songs first, then filter by search
    const filteredPool = availablePool
        .filter(song =>
            song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            song.artist.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            const aSelected = fixedSongs.some(s => s.id === a.id);
            const bSelected = fixedSongs.some(s => s.id === b.id);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            return 0;
        });

    const filteredPools = POOL_OPTIONS.filter(p =>
        p.name.toLowerCase().includes(poolSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(poolSearch.toLowerCase())
    );

    const handleReset = () => {
        setFixedSongs([]);
        // Keep randomCount as is - don't reset
        setPickCount(2);
        setBanCount(0);
        setLockedTracks({});
        setHiddenTracks({ track3Hidden: false, track4Hidden: false });
    };

    // Handle file upload for players JSON
    const handlePlayersFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    setPlayerJsonData(data);
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
    };

    // Handle file upload for rounds JSON
    const handleRoundsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    setRoundJsonData(data);
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
    };

    // Download template functions
    const downloadPlayersTemplate = () => {
        const template = [
            { "name": "Player1", "tag": "Team1" },
            { "name": "Player2", "tag": "Team2" }
        ];
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'players-template.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadRoundsTemplate = () => {
        const template = [
            "Round of 32",
            "Round of 16",
            "Quarter Finals",
            "Semi Finals",
            "Grand Finals"
        ];
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rounds-template.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Download pool template
    const downloadPoolTemplate = () => {
        const template = [
            {
                "id": "0",
                "imgUrl": "https://example.com/cover.png",
                "artist": "Artist Name",
                "title": "Song Title",
                "lv": "13",
                "diff": "MASTER",
                "isDx": "True"
            }
        ];
        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pool-template.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Handle pool JSON file upload
    const handlePoolFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    const songsWithIds = data.map((song: any, index: number) => ({
                        ...song,
                        id: song.id || `custom-${index}`,
                        imgUrl: song.imgUrl || '/assets/testjacket.png',
                        isDx: String(song.isDx)
                    }));
                    setCustomPoolData(songsWithIds);
                    setSongData(songsWithIds);
                    alert(`Loaded ${songsWithIds.length} songs from file`);
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 p-4">
            <div className="max-w-full mx-auto px-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="w-10"></div>
                    <h1 className="text-2xl font-bold text-white text-center">
                        Controller Panel
                    </h1>
                    <button
                        onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                        className="w-10 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold flex items-center justify-center transition-all duration-300"
                        title="Keyboard Shortcuts"
                    >
                        <span
                            className="transition-transform duration-300"
                            style={{
                                transform: showKeyboardShortcuts ? 'rotate(90deg)' : 'rotate(0deg)'
                            }}
                        >
                            ▶
                        </span>
                    </button>
                </div>

                {/* Keyboard Shortcuts Panel */}
                {showKeyboardShortcuts && (
                    <div className="bg-gray-800 rounded-xl p-4 mb-6 animate-fade-in-down-simple">
                        <div className="flex items-start justify-between gap-6">
                            {/* Keyboard Shortcuts */}
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-white mb-3">Keyboard Shortcuts</h2>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">Space</kbd>
                                            <span className="text-gray-300">Start random</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">R</kbd>
                                            <span className="text-gray-300">Reset all</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">Enter</kbd>
                                            <span className="text-gray-300">Confirm / Go to match display</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">ESC</kbd>
                                            <span className="text-gray-300">Go back / Exit</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">←</kbd>
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">→</kbd>
                                            <span className="text-gray-300">Navigate songs (Ban/Pick)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">↑</kbd>
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">↓</kbd>
                                            <span className="text-gray-300">Navigate tracks (Match Display)</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">B</kbd>
                                            <span className="text-gray-300">Ban selected song</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <kbd className="px-2 py-1 bg-gray-700 rounded text-white font-mono">P</kbd>
                                            <span className="text-gray-300">Pick selected song</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Navigation */}
                            <div className="w-48">
                                <h2 className="text-lg font-semibold text-white mb-3">Quick Navigation</h2>
                                <div className="space-y-2">
                                    <a
                                        href="http://localhost:3000/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded text-center transition-colors"
                                    >
                                        Random
                                    </a>
                                    <a
                                        href="http://localhost:3000/text-display"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded text-center transition-colors"
                                    >
                                        Text Display
                                    </a>
                                    <a
                                        href="http://localhost:3000/match-display"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded text-center transition-colors"
                                    >
                                        Match Display
                                    </a>
                                    <a
                                        href="http://localhost:3000/song-selector"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded text-center transition-colors"
                                    >
                                        Song Selector
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-5 gap-4">
                    {/* Column 0 - Game Control */}
                    <div className="space-y-4">
                        {/* Game Control Panel */}
                        <div className="bg-gray-800 rounded-xl p-3">
                            <h2 className="text-sm font-semibold text-white mb-3">Game Control</h2>

                            {/* Phase Status */}
                            <div className="mb-3 p-2 bg-gray-700 rounded-lg text-center">
                                <span className={`text-sm font-bold ${showFinalResults ? 'text-green-400' :
                                    isPickPhase ? 'text-blue-400' :
                                        isBanPhase ? 'text-red-400' :
                                            randomResults.length > 0 ? 'text-yellow-400' :
                                                'text-gray-400'
                                }`}>
                                    {showFinalResults ? 'Complete' :
                                        isPickPhase ? `Pick Phase (${remainingPicks} left)` :
                                            isBanPhase ? `Ban Phase (${remainingBans} left)` :
                                                randomResults.length > 0 ? 'Random Done' :
                                                    'Ready'}
                                </span>
                            </div>

                            {/* Control Buttons */}
                            <div className="space-y-2">
                                <button
                                    onClick={() => triggerPreview()}
                                    disabled={isLoadingPool}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                                >
                                    Start
                                </button>

                                <button
                                    onClick={triggerRandom}
                                    disabled={isLoadingPool}
                                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                                >
                                    Random
                                </button>

                                <button
                                    onClick={goToBanPickPhase}
                                    disabled={randomResults.length === 0 || showBanPick}
                                    className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                                >
                                    Go to Ban/Pick
                                </button>

                                <button
                                    onClick={goToMatch}
                                    disabled={!showFinalResults}
                                    className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                                >
                                    Go to Match
                                </button>

                                <button
                                    onClick={handleGameReset}
                                    className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors"
                                >
                                    Reset Game
                                </button>
                            </div>

                            {/* Match Navigation */}
                            {isMatchPhase && matchSongs.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-700">
                                    <h3 className="text-sm font-semibold text-white mb-2">Match Control</h3>
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            onClick={matchPrev}
                                            disabled={currentMatchIndex === 0}
                                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                                        >
                                            ← Prev
                                        </button>
                                        <span className="text-white font-bold px-3">
                                            {currentMatchIndex + 1}/{matchSongs.length}
                                        </span>
                                        <button
                                            onClick={matchNext}
                                            disabled={currentMatchIndex === matchSongs.length - 1}
                                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                    {matchSongs[currentMatchIndex] && (
                                        <div className="mt-2 p-2 bg-gray-700 rounded-lg flex items-center gap-2">
                                            <img
                                                src={matchSongs[currentMatchIndex].imgUrl}
                                                alt={matchSongs[currentMatchIndex].title}
                                                className="w-12 h-12 rounded object-cover"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-medium truncate">
                                                    {matchSongs[currentMatchIndex].title}
                                                </p>
                                                <p className="text-gray-400 text-xs">
                                                    Track {currentMatchIndex + 1}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Random Results / Ban Pick Grid */}
                        {randomResults.length > 0 && (
                            <div className="bg-gray-800 rounded-xl p-3">
                                <h2 className="text-sm font-semibold text-white mb-2">
                                    {showBanPick ? (isBanPhase ? 'Select to Ban' : 'Select to Pick') : 'Random Results'}
                                </h2>
                                <div className="grid grid-cols-2 gap-2">
                                    {pickBanPoolSongs.map((song, index) => {
                                        const banned = isSongBanned(song);
                                        const picked = isSongPicked(song);
                                        const processed = banned || picked;

                                        return (
                                            <button
                                                key={song.id}
                                                onClick={() => {
                                                    setSelectedSongIndex(index);
                                                    if (showBanPick && !processed) {
                                                        if (isBanPhase) handleBanSong(song);
                                                        else if (isPickPhase) handlePickSong(song);
                                                    }
                                                }}
                                                disabled={!showBanPick || processed}
                                                className={`p-2 rounded-lg text-left transition-all ${index === selectedSongIndex && !processed ? 'ring-2 ring-yellow-400' : ''
                                                } ${banned ? 'bg-red-900/50 opacity-50' :
                                                    picked ? 'bg-green-900/50 border-2 border-green-500' :
                                                        showBanPick ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer' :
                                                            'bg-gray-700'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <img
                                                        src={song.imgUrl}
                                                        alt={song.title}
                                                        className="w-10 h-10 rounded object-cover"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white text-xs font-medium truncate">{song.title}</p>
                                                        <p className={`text-xs ${song.diff === 'MASTER' ? 'text-purple-400' :
                                                            song.diff === 'EXPERT' ? 'text-red-400' :
                                                                'text-pink-400'
                                                        }`}>
                                                            {song.diff} {song.lv}
                                                        </p>
                                                    </div>
                                                    {banned && <span className="text-red-400 text-lg">✕</span>}
                                                    {picked && <span className="text-green-400 text-lg">✓</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Column 1 - Pool & Settings */}
                    <div className="space-y-4">
                        {/* Pool Selection */}
                        <div className="bg-gray-800 rounded-xl p-3">
                            <h2 className="text-sm font-semibold text-white mb-2">Pool Selection</h2>
                            <div className="pool-container relative">
                                <input
                                    type="text"
                                    value={showPoolDropdown ? poolSearch : (POOL_OPTIONS.find(p => p.id === selectedPool)?.name || '')}
                                    placeholder="Search pool..."
                                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                    onFocus={() => {
                                        setShowPoolDropdown(true);
                                        setPoolSearch('');
                                    }}
                                    onChange={(e) => setPoolSearch(e.target.value)}
                                />
                                {showPoolDropdown && (
                                    <div className="absolute z-50 w-full mt-1 bg-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                        {filteredPools.map((pool) => (
                                            <div
                                                key={pool.id}
                                                className={`px-3 py-2 cursor-pointer hover:bg-purple-600 text-sm ${selectedPool === pool.id ? 'bg-purple-600' : ''}`}
                                                onClick={() => handlePoolChange(pool.id)}
                                            >
                                                <span className="text-white">{pool.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {isLoadingPool && (
                                <p className="text-yellow-400 text-sm mt-2">Loading pool...</p>
                            )}
                            <p className="text-gray-400 text-sm mt-2">
                                {songData.length} songs in pool
                            </p>

                            {/* Custom Pool Upload */}
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <label className="block text-xs text-gray-400 mb-1">Upload Custom Pool</label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handlePoolFileUpload}
                                    className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                                />
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-gray-500">{customPoolData.length > 0 ? `${customPoolData.length} custom songs` : ''}</p>
                                    <button
                                        onClick={downloadPoolTemplate}
                                        className="text-xs text-purple-400 hover:text-purple-300"
                                    >
                                        Template
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Game Settings */}
                        <div className="bg-gray-800 rounded-xl p-4">
                            <h2 className="text-lg font-semibold text-white mb-3">Game Settings</h2>
                            <div className="grid grid-cols-3 gap-4">
                                {/* Random Count */}
                                <div className="text-center">
                                    <p className="text-gray-300 text-sm mb-2">Random</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={handleRandomDecrement}
                                            disabled={randomCount <= minRandom}
                                            className="w-8 h-8 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            -
                                        </button>
                                        <span className="text-2xl font-bold text-white w-6">{randomCount}</span>
                                        <button
                                            onClick={handleRandomIncrement}
                                            disabled={randomCount >= maxRandom}
                                            className="w-8 h-8 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* Pick Count */}
                                <div className="text-center">
                                    <p className="text-gray-300 text-sm mb-2">Pick</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={handlePickDecrement}
                                            disabled={pickCount <= minPick}
                                            className="w-8 h-8 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            -
                                        </button>
                                        <span className="text-2xl font-bold text-white w-6">{pickCount}</span>
                                        <button
                                            onClick={handlePickIncrement}
                                            disabled={pickCount >= maxPick || pickCount + banCount >= totalSongs}
                                            className="w-8 h-8 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* Ban Count */}
                                <div className="text-center">
                                    <p className="text-gray-300 text-sm mb-2">Ban</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={handleBanDecrement}
                                            disabled={banCount <= 0}
                                            className="w-8 h-8 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            -
                                        </button>
                                        <span className="text-2xl font-bold text-white w-6">{banCount}</span>
                                        <button
                                            onClick={handleBanIncrement}
                                            disabled={pickCount + banCount >= totalSongs}
                                            className="w-8 h-8 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 rounded-lg text-white font-bold"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <p className="text-gray-400 text-sm mt-4 text-center">
                                Total: {totalSongs} (Random: {randomCount} + Fixed: {fixedCount})
                            </p>
                        </div>

                        {/* Locked Tracks */}
                        <div className="bg-gray-800 rounded-xl p-4">
                            <h2 className="text-lg font-semibold text-white mb-3">Locked Tracks</h2>
                            <div className="space-y-4">
                                {/* Track 3 */}
                                <div className="track3-container relative">
                                    <p className="text-gray-300 text-sm mb-2">Track 3</p>
                                    <input
                                        type="text"
                                        value={showTrack3Dropdown ? track3Search : (lockedTracks.track3?.title || '')}
                                        placeholder="Select song..."
                                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                        onFocus={() => {
                                            setShowTrack3Dropdown(true);
                                            setTrack3Search('');
                                        }}
                                        onChange={(e) => setTrack3Search(e.target.value)}
                                    />
                                    {showTrack3Dropdown && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            <div
                                                className="px-3 py-2 cursor-pointer hover:bg-red-600 text-gray-400 flex items-center gap-2"
                                                onClick={() => {
                                                    setLockedTracks({ ...lockedTracks, track3: undefined });
                                                    setShowTrack3Dropdown(false);
                                                }}
                                            >
                                                <span className="text-red-400">X</span> Clear selection
                                            </div>
                                            {/* This is for random button */}
                                            <div
                                                className="px-3 py-2 cursor-pointer hover:bg-purple-600 text-gray-400 flex items-center gap-2"
                                                onClick={() => {
                                                    setShowTrack3Dropdown(false);
                                                    localStorage.setItem('lockedTrackTarget', 'track3');
                                                    // A locked track was marked -> hand off to the
                                                    // random-locked-song page.
                                                    router.push('/random-locked-song');
                                                }}
                                            >
                                                <span className="text-gray-400">?</span>  Get Random
                                            </div>
                                            {track3Options.slice(0, 20).map((song) => (
                                                <div
                                                    key={song.id}
                                                    className={`px-3 py-2 cursor-pointer hover:bg-purple-600 flex items-center gap-2 ${lockedTracks.track3?.id === song.id ? 'bg-purple-600' : ''}`}
                                                    onClick={() => {
                                                        setLockedTracks({ ...lockedTracks, track3: song });
                                                        setShowTrack3Dropdown(false);
                                                        setTrack3Search('');
                                                    }}
                                                >
                                                    <img src={song.imgUrl} alt="" className="w-8 h-8 rounded object-cover" />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-white text-sm truncate block">{song.title}</span>
                                                        <span className={`text-xs ${getDiffColor(song.diff)}`}>{song.diff} {song.lv}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {lockedTracks.track3 && (
                                        <label className="flex items-center gap-2 mt-2 text-sm text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={hiddenTracks.track3Hidden}
                                                onChange={(e) => setHiddenTracks({ ...hiddenTracks, track3Hidden: e.target.checked })}
                                                className="rounded"
                                            />
                                            Hidden track
                                        </label>
                                    )}
                                </div>

                                {/* Track 4 */}
                                <div className="track4-container relative">
                                    <p className="text-gray-300 text-sm mb-2">Track 4</p>
                                    <input
                                        type="text"
                                        value={showTrack4Dropdown ? track4Search : (lockedTracks.track4?.title || '')}
                                        placeholder="Select song..."
                                        className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                        onFocus={() => {
                                            setShowTrack4Dropdown(true);
                                            setTrack4Search('');
                                        }}
                                        onChange={(e) => setTrack4Search(e.target.value)}
                                    />
                                    {showTrack4Dropdown && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                            <div
                                                className="px-3 py-2 cursor-pointer hover:bg-red-600 text-gray-400 flex items-center gap-2"
                                                onClick={() => {
                                                    setLockedTracks({ ...lockedTracks, track4: undefined });
                                                    setShowTrack4Dropdown(false);
                                                }}
                                            >
                                                <span className="text-red-400">✕</span> Clear selection
                                            </div>
                                            <div
                                                className="px-3 py-2 cursor-pointer hover:bg-purple-600 text-gray-400 flex items-center gap-2"
                                                onClick={() => {
                                                    setShowTrack4Dropdown(false);
                                                    localStorage.setItem('lockedTrackTarget', 'track4');
                                                    // A locked track was marked -> hand off to the
                                                    // random-locked-song page.
                                                    router.push('/random-locked-song');
                                                }}
                                            >
                                                <span className="text-gray-400">?</span>  Get Random
                                            </div>
                                            {track4Options.slice(0, 20).map((song) => (
                                                <div
                                                    key={song.id}
                                                    className={`px-3 py-2 cursor-pointer hover:bg-purple-600 flex items-center gap-2 ${lockedTracks.track4?.id === song.id ? 'bg-purple-600' : ''}`}
                                                    onClick={() => {
                                                        setLockedTracks({ ...lockedTracks, track4: song });
                                                        setShowTrack4Dropdown(false);
                                                        setTrack4Search('');
                                                    }}
                                                >
                                                    <img src={song.imgUrl} alt="" className="w-8 h-8 rounded object-cover" />
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-white text-sm truncate block">{song.title}</span>
                                                        <span className={`text-xs ${getDiffColor(song.diff)}`}>{song.diff} {song.lv}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {lockedTracks.track4 && (
                                        <label className="flex items-center gap-2 mt-2 text-sm text-gray-300">
                                            <input
                                                type="checkbox"
                                                checked={hiddenTracks.track4Hidden}
                                                onChange={(e) => setHiddenTracks({ ...hiddenTracks, track4Hidden: e.target.checked })}
                                                className="rounded"
                                            />
                                            Hidden track
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Reset Button */}
                        <button
                            onClick={handleReset}
                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors"
                        >
                            Reset All Settings
                        </button>
                    </div>

                    {/* Right Column - Fixed Songs */}
                    <div className="bg-gray-800 rounded-xl p-4 h-fit">
                        <h2 className="text-lg font-semibold text-white mb-3">Fixed Songs ({fixedSongs.length})</h2>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search songs..."
                            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-purple-500 mb-3"
                        />
                        <div className="max-h-[500px] overflow-y-auto space-y-1">
                            {filteredPool.slice(0, 100).map((song, index) => {
                                const isSelected = fixedSongs.some(s => s.id === song.id);
                                return (
                                    <div
                                        key={`${song.id}-${song.diff}-${index}`}
                                        className={`px-3 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-3 ${isSelected ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
                                        onClick={() => toggleSong(song)}
                                    >
                                        <img src={song.imgUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-white text-sm truncate block">{song.title}</span>
                                            <span className={`text-xs ${getDiffColor(song.diff)}`}>
                                                {song.diff} {song.lv}
                                            </span>
                                        </div>
                                        {isSelected && <span className="text-green-400 flex-shrink-0">✓</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Column 3 - Stream Text */}
                    <div className="bg-gray-800 rounded-xl p-3 h-fit">
                        <h2 className="text-sm font-semibold text-white mb-2">Stream Text</h2>

                        {/* JSON File Uploads */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Players JSON</label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handlePlayersFileUpload}
                                    className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                                />
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-gray-500">{playerJsonData.length} players</p>
                                    <button
                                        onClick={downloadPlayersTemplate}
                                        className="text-xs text-purple-400 hover:text-purple-300"
                                    >
                                        Template
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Rounds JSON</label>
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleRoundsFileUpload}
                                    className="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                                />
                                <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-gray-500">{roundJsonData.length} rounds</p>
                                    <button
                                        onClick={downloadRoundsTemplate}
                                        className="text-xs text-purple-400 hover:text-purple-300"
                                    >
                                        Template
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Round Name */}
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-gray-300 text-xs">Round</p>
                                <label className="flex items-center gap-1 text-xs text-gray-400">
                                    <input
                                        type="checkbox"
                                        checked={streamText.roundUseJson}
                                        onChange={(e) => setStreamText({ ...streamText, roundUseJson: e.target.checked })}
                                        className="rounded w-3 h-3"
                                    />
                                    JSON
                                </label>
                            </div>
                            {streamText.roundUseJson ? (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={streamText.roundName}
                                        placeholder="Select round..."
                                        className="w-full px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                                        onFocus={() => setShowRoundDropdown(true)}
                                        readOnly
                                    />
                                    {showRoundDropdown && roundJsonData.length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-xl max-h-32 overflow-y-auto">
                                            {roundJsonData.map((round, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`px-2 py-1 cursor-pointer hover:bg-purple-600 text-white text-xs ${streamText.roundName === round ? 'bg-purple-600' : ''}`}
                                                    onClick={() => {
                                                        setStreamText({ ...streamText, roundName: round });
                                                        setShowRoundDropdown(false);
                                                    }}
                                                >
                                                    {round}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={streamText.roundName}
                                    onChange={(e) => setStreamText({ ...streamText, roundName: e.target.value })}
                                    placeholder="Enter round..."
                                    className="w-full px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                                />
                            )}
                        </div>

                        {/* Player Inputs */}
                        {[1, 2, 3, 4].map((num) => {
                            const playerKey = `player${num}` as 'player1' | 'player2' | 'player3' | 'player4';
                            const tagKey = `player${num}Tag` as 'player1Tag' | 'player2Tag' | 'player3Tag' | 'player4Tag';
                            const jsonKey = `player${num}UseJson` as 'player1UseJson' | 'player2UseJson' | 'player3UseJson' | 'player4UseJson';

                            return (
                                <div key={num} className="mb-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-gray-300 text-xs">P{num}</p>
                                        <label className="flex items-center gap-1 text-xs text-gray-400">
                                            <input
                                                type="checkbox"
                                                checked={streamText[jsonKey]}
                                                onChange={(e) => setStreamText({ ...streamText, [jsonKey]: e.target.checked })}
                                                className="rounded w-3 h-3"
                                            />
                                            JSON
                                        </label>
                                    </div>
                                    {streamText[jsonKey] ? (
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={streamText[playerKey]}
                                                placeholder="Select..."
                                                className="w-full px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                                                onFocus={() => setShowPlayerDropdown(num)}
                                                readOnly
                                            />
                                            {showPlayerDropdown === num && playerJsonData.length > 0 && (
                                                <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-xl max-h-32 overflow-y-auto">
                                                    {playerJsonData.map((player, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`px-2 py-1 cursor-pointer hover:bg-purple-600 ${streamText[playerKey] === player.name ? 'bg-purple-600' : ''}`}
                                                            onClick={() => {
                                                                setStreamText({
                                                                    ...streamText,
                                                                    [playerKey]: player.name,
                                                                    [tagKey]: player.tag
                                                                });
                                                                setShowPlayerDropdown(null);
                                                            }}
                                                        >
                                                            <span className="text-white text-xs">{player.name}</span>
                                                            {player.tag && <span className="text-gray-400 text-xs ml-1">{player.tag}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                value={streamText[playerKey]}
                                                onChange={(e) => setStreamText({ ...streamText, [playerKey]: e.target.value })}
                                                placeholder="Name"
                                                className="flex-1 px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                                            />
                                            <input
                                                type="text"
                                                value={streamText[tagKey]}
                                                onChange={(e) => setStreamText({ ...streamText, [tagKey]: e.target.value })}
                                                placeholder="Tag"
                                                className="w-16 px-2 py-1 bg-gray-700 text-white rounded outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Push & Clear Buttons */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={pushStreamText}
                                className="flex-1 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-xs transition-colors"
                            >
                                Push to Stream
                            </button>
                            <button
                                onClick={() => setStreamText({
                                    player1: '', player1Tag: '', player1UseJson: false,
                                    player2: '', player2Tag: '', player2UseJson: false,
                                    player3: '', player3Tag: '', player3UseJson: false,
                                    player4: '', player4Tag: '', player4UseJson: false,
                                    roundName: '', roundUseJson: false
                                })}
                                className="py-1 px-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Column 4 - Ban/Pick Log */}
                <div className="bg-gray-800 rounded-xl p-3 h-fit">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-white">Ban/Pick Log</h2>
                        <button
                            onClick={() => {
                                localStorage.removeItem('banPickLog');
                                setBanPickLog([]);
                            }}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 text-xs"
                        >
                            Clear
                        </button>
                    </div>
                    {banPickLog.length === 0 ? (
                        <p className="text-gray-500 text-xs">No actions yet...</p>
                    ) : (
                        <div className="max-h-[600px] overflow-y-auto space-y-1">
                            {banPickLog.map((entry, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center gap-2 px-2 py-1 rounded ${entry.type === 'ban' ? 'bg-red-900/30' : 'bg-green-900/30'}`}
                                >
                                    <span className={`text-xs font-bold px-1 py-0.5 rounded ${entry.type === 'ban' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                                        {entry.type === 'ban' ? 'B' : 'P'}
                                    </span>
                                    <img src={entry.song.imgUrl} alt="" className="w-6 h-6 rounded object-cover" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-white text-xs truncate block">{entry.song.title}</span>
                                        <span className={`text-xs ${getDiffColor(entry.song.diff)}`}>{entry.song.diff} {entry.song.lv}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Info */}
            <div className="text-center text-gray-400 text-sm mt-6">
                <p>Made by PXT with luv &lt;3 (and chatgbt). Ofc Shard and Necros1s also</p>
            </div>
        </div>

    );
}
