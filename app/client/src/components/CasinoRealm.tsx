import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/use-is-mobile";
import { useAudio } from "../lib/stores/useAudio";
import { useProgress } from "../lib/stores/useProgress";
import { useCasinoProgress } from "../lib/stores/useCasinoProgress";
import "../styles/casino-realm.css";
import { useConnection } from "@solana/wallet-adapter-react";
import { useSolBalance } from "../hooks/useSolBalance";
import GamblerGuide from "./casino/GamblerGuide";

const CasinoRealm: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [casinoMusic, setCasinoMusic] = useState<HTMLAudioElement | null>(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isShuffling, setIsShuffling] = useState(false);
  const [deckHovered, setDeckHovered] = useState(false);
  
  // Progress system integration
  const {
    luckProgress,
    setLastCasinoTime,
    applyCrossRealmDecay
  } = useProgress();

  // Casino progress tracking (for guided tour)
  const { recordVisit } = useCasinoProgress();

  // Wallet + CNC balance
  const { connection } = useConnection();
  const { balance: solBalance } = useSolBalance();
  
  const {
    backgroundMusic,
    hitSound,
    successSound,
    isMuted,
    stopBackgroundMusic,
    playHit,
    playSuccess
  } = useAudio();

  // Live activity ticker data (mock)
  const liveActivities = useMemo(() => [
    { icon: "🎰", text: "Anonymous won 2.5 SOL on 777 Slots!" },
    { icon: "🔥", text: "Jackpot pool: 142.8 SOL" },
    { icon: "💎", text: "DegenerateApe hit 10x on Roulette!" },
    { icon: "🚀", text: "Memecoin Simulator trending now" },
    { icon: "⚡", text: "Lucky streak: 5 wins in a row!" },
    { icon: "🎲", text: "New player joined the tables" },
  ], []);

  // Initialize casino music and handle transition
  useEffect(() => {
    if (backgroundMusic) {
      stopBackgroundMusic();
    }

    const casinoAudio = new Audio('/sounds/casino-funk-background-335164.mp3');
    casinoAudio.loop = true;
    casinoAudio.volume = 0.5;
    casinoAudio.preload = 'auto';
    setCasinoMusic(casinoAudio);

    // Record visit for tour system
    recordVisit();

    const transitionTimer = setTimeout(() => {
      setIsTransitioning(false);
      if (!isMuted && casinoAudio) {
        casinoAudio.play().catch(error => {
          console.log("Casino music autoplay prevented:", error);
        });
      }
    }, 2000);

    return () => {
      clearTimeout(transitionTimer);
      if (casinoAudio) {
        casinoAudio.pause();
        casinoAudio.currentTime = 0;
      }
    };
  }, [backgroundMusic, stopBackgroundMusic, isMuted, recordVisit]);

  // Apply cross-realm decay and track casino time
  useEffect(() => {
    applyCrossRealmDecay();
    setLastCasinoTime();
    
    const decayInterval = setInterval(() => {
      applyCrossRealmDecay();
    }, 30000);

    return () => {
      clearInterval(decayInterval);
    };
  }, [applyCrossRealmDecay, setLastCasinoTime]);

  const playHoverSound = () => {
    playHit();
  };

  const handleGameSelect = async (game: string) => {
    playHit();
    if (game === 'slot-machine') {
      navigate('/casino/slots');
      return;
    }
    if (game === 'memecoin-simulator') {
      navigate('/casino/memecoin');
      return;
    }
    if (game === 'rug-pull-roulette' || game === 'roulette') {
      navigate('/casino/roulette');
      return;
    }
    if (game === 'aviator') {
      navigate('/casino/aviator');
      return;
    }
    if (game === 'coin-flip') {
      navigate('/casino/coinflip');
      return;
    }
    const picked = featuredGames.find(g => g.id === game);
    setSelectedTitle((picked?.name || game).toUpperCase());
    setShowComingSoon(true);
  };

  const handleBackToHome = () => {
    playHit();
    if (casinoMusic) {
      casinoMusic.pause();
      casinoMusic.currentTime = 0;
    }
    setIsGoingBack(true);
    setTimeout(() => {
      navigate('/');
    }, 1500);
  };

  // Featured games for the deck
  const featuredGames = useMemo(() => ([
    { id: 'rug-pull-roulette', name: 'Rug Pull Roulette', image: '/assets/casino_games/b78db705fcf8ac48_376f4127-82a8-4fe5-aee0-9faea7017bbf.png', category: 'roulette', tagline: 'Spin with degen edge.', hot: true },
    { id: 'coin-flip', name: 'Coin Flip', image: '/assets/casino_games/5d0888d10b189f5e2_9078f79a-1c2e-48b3-8833-07f50c9279ca.png', category: 'table', tagline: '50/50 thrills, instant results.', new: true },
    { id: 'slot-machine', name: '777 Slot Machine', image: '/assets/casino_games/slot-image.jpg', category: 'slots', tagline: 'Classic reels, neon payouts.', hot: true },
    { id: 'aviator', name: 'Aviator', image: '/assets/casino_games/memecoin-simulator.webp', category: 'trending', tagline: 'Ride the meme waves.', hot: true },
    // { id: 'barbarossa', name: 'Barbarossa', image: '/assets/casino_games/104bf8ff8e8cae125_b0f8ac20-2f18-41e4-a507-7c9ac9f1d17a.jpeg', category: 'adventure', tagline: 'Treasure hunts & high stakes.', new: true },
    // { id: 'raging-lion', name: 'Raging Lion', image: '/assets/casino_games/432f10db51a752e51_f72c6605-3e1f-4ac0-9ef4-26c295758d36.jpeg', category: 'slots', tagline: 'Volatility meets roar.' }
  ]), []);

  const [deckIndex, setDeckIndex] = useState(0);

  // Touch swipe state
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const minSwipeDistance = 50; // Minimum swipe distance in pixels

  const handleTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      // Swipe left = show next card
      shuffleDeck('left');
    } else if (isRightSwipe) {
      // Swipe right = show previous card
      shuffleDeck('right');
    }
    
    // Reset values
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const categories = useMemo(() => ([
    { id: 'all', label: 'All Games', icon: '🎮' },
    { id: 'slots', label: 'Slots', icon: '🎰' },
    { id: 'roulette', label: 'Roulette', icon: '🎡' },
    { id: 'table', label: 'Table', icon: '🃏' },
    { id: 'trending', label: 'Trending', icon: '🔥' },
    { id: 'adventure', label: 'Adventure', icon: '⚔️' },
    { id: 'coin-flip', label: 'Coin Flip', icon: '🪙' }
  ]), []);

  const filteredGames = useMemo(() => {
    if (selectedCategory === 'all') return featuredGames;
    return featuredGames.filter((g) => g.category === selectedCategory);
  }, [featuredGames, selectedCategory]);

  // Get visible deck cards (show up to 5 stacked)
  const deckCards = useMemo(() => {
    const cards = [];
    const total = featuredGames.length;
    for (let i = 0; i < Math.min(5, total); i++) {
      cards.push(featuredGames[(deckIndex + i) % total]);
    }
    return cards;
  }, [featuredGames, deckIndex]);

  useEffect(() => {
    setDeckIndex(0);
  }, [selectedCategory]);

  const shuffleDeck = (direction: 'left' | 'right') => {
    if (isShuffling) return;
    playHit();
    setIsShuffling(true);
    
    setTimeout(() => {
      if (direction === 'left') {
        setDeckIndex((prev) => (prev + 1) % featuredGames.length);
      } else {
        setDeckIndex((prev) => (prev - 1 + featuredGames.length) % featuredGames.length);
      }
      setIsShuffling(false);
    }, 300);
  };

  if (isTransitioning) {
    return (
      <div className="casino-transition-screen">
        <div className="transition-content">
          <div className="casino-chips-animation">
            <span className="chip chip-1">🎰</span>
            <span className="chip chip-2">💎</span>
            <span className="chip chip-3">🃏</span>
            <span className="chip chip-4">🎲</span>
          </div>
          <div className="casino-transition-text">Entering the casino realm...</div>
          <div className="loading-bar">
            <div className="loading-fill"></div>
          </div>
        </div>
      </div>
    );
  }

  if (isGoingBack) {
    return (
      <div className="casino-transition-screen going-back">
        <div className="transition-content">
          <div className="casino-transition-text">Going back to realms...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`casino-realm-container ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Animated Background */}
      <div className="casino-background">
        <img src="/scenes/casino_scene.png" alt="Casino Realm" />
        <div className="casino-overlay" />
        <div className="ambient-glow glow-1" />
        <div className="ambient-glow glow-2" />
        <div className="ambient-glow glow-3" />
      </div>

      {/* Floating Particles */}
      <div className="particles-container">
        {[...Array(20)].map((_, i) => (
          <div key={i} className={`particle particle-${i % 5}`} style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${8 + Math.random() * 4}s`
          }} />
        ))}
      </div>

      {/* Live Activity Ticker */}
      <div className="live-ticker">
        <div className="ticker-track">
          {[...liveActivities, ...liveActivities].map((activity, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-icon">{activity.icon}</span>
              <span className="ticker-text">{activity.text}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="casino-shell">
        {/* Compact Top Bar */}
        <header className="casino-topbar">
          <button
            id="casino-exit-button"
            className="back-button"
            onClick={handleBackToHome}
            onMouseEnter={playHoverSound}
          >
            <span className="back-icon">←</span>
            <span className="back-text">Exit</span>
          </button>

          <div className="topbar-center">
            <div className="casino-logo">
              <span className="logo-icon">🎰</span>
              <span className="logo-text">CASINO REALM</span>
            </div>
          </div>

          <div className="top-actions">
            <div className="luck-chip" title="Luck Meter">
              <span className="luck-emoji">🍀</span>
              <span className="luck-value">{luckProgress.toFixed(0)}%</span>
            </div>
            <div id="casino-wallet-display" className="wallet-chip" title="Wallet balance">
              <span className="chip-icon">◈</span>
              <span className="chip-value">{(solBalance ?? 0).toFixed(4)}</span>
              <span className="chip-currency">SOL</span>
            </div>
            <button
              className="audio-toggle"
              onClick={() => {
                if (!casinoMusic) return;
                if (casinoMusic.paused) {
                  casinoMusic.play();
                } else {
                  casinoMusic.pause();
                }
              }}
              title="Toggle Music"
            >
              {casinoMusic && !casinoMusic.paused ? "🔊" : "🔇"}
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              <span className="title-line">Pick Your</span>
              <span className="title-highlight">Luck Tonight</span>
            </h1>
            <p className="hero-subtitle">Swipe through the deck, spin the reels, chase the jackpot.</p>
          </div>
        </section>

        {/* Featured Deck Section */}
        <section id="casino-featured-deck" className="featured-section">
          <div className="section-header">
            <div className="section-title">
              <span className="title-icon">🃏</span>
              <span className="title-text">Featured Games</span>
              <span className="title-badge">HOT</span>
            </div>
            <div className="deck-controls">
              <button 
                className="deck-btn prev" 
                onClick={() => shuffleDeck('right')}
                onMouseEnter={playHoverSound}
                disabled={isShuffling}
              >
                ‹
              </button>
              <span className="deck-counter">{deckIndex + 1} / {featuredGames.length}</span>
              <button 
                className="deck-btn next" 
                onClick={() => shuffleDeck('left')}
                onMouseEnter={playHoverSound}
                disabled={isShuffling}
              >
                ›
              </button>
            </div>
          </div>

          <div 
            className={`card-deck ${isShuffling ? 'shuffling' : ''} ${deckHovered ? 'hovered' : ''}`}
            onMouseEnter={() => setDeckHovered(true)}
            onMouseLeave={() => setDeckHovered(false)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {deckCards.map((game, index) => (
              <div
                key={`${game.id}-${index}`}
                className={`deck-card card-${index}`}
                style={{
                  zIndex: 10 - index,
                  transform: `
                    translateX(${index * (isMobile ? 8 : 15)}px) 
                    translateY(${index * (isMobile ? 4 : 8)}px) 
                    rotate(${(index - 2) * (deckHovered ? 4 : 2)}deg)
                    scale(${1 - index * 0.04})
                  `,
                  opacity: index === 0 ? 1 : 1 - index * 0.15
                }}
                onClick={() => index === 0 && handleGameSelect(game.id)}
              >
                <div className="card-inner">
                  <div className="card-image" style={{ backgroundImage: `url(${game.image})` }}>
                    <div className="card-shine" />
                  </div>
                  {index === 0 && (
                    <div className="card-content">
                      <div className="card-badges">
                        <span className="badge category">{game.category}</span>
                        {game.hot && <span className="badge hot">🔥 HOT</span>}
                        {game.new && <span className="badge new">✨ NEW</span>}
                      </div>
                      <div className="card-info">
                        <h3 className="card-name">{game.name}</h3>
                        <p className="card-tagline">{game.tagline}</p>
                      </div>
                      <button
                        className="play-btn"
                        onClick={(e) => { e.stopPropagation(); handleGameSelect(game.id); }}
                        onMouseEnter={playHoverSound}
                      >
                        <span className="btn-text">Play Now</span>
                        <span className="btn-icon">→</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Games Grid Section */}
        <section className="games-section">
          <div className="section-header">
            <div className="section-title">
              <span className="title-icon">🎮</span>
              <span className="title-text">All Games</span>
            </div>
            <div id="casino-filters" className="filter-chips">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`filter-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => { playHit(); setSelectedCategory(cat.id); }}
                  onMouseEnter={playHoverSound}
                >
                  <span className="filter-icon">{cat.icon}</span>
                  <span className="filter-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div id="casino-games-grid" className="games-grid">
            {filteredGames.map((game, index) => (
              <div 
                key={game.id} 
                className="game-card"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="card-glow" />
                <div className="game-image" style={{ backgroundImage: `url(${game.image})` }}>
                  <div className="image-overlay" />
                  <div className="game-badges">
                    <span className="badge">{game.category}</span>
                    {game.hot && <span className="badge hot">🔥</span>}
                    {game.new && <span className="badge new">✨</span>}
                  </div>
                </div>
                <div className="game-info">
                  <h4 className="game-name">{game.name}</h4>
                  <p className="game-tagline">{game.tagline}</p>
                  <div className="game-actions">
                    <button
                      className="action-btn primary"
                      onClick={() => handleGameSelect(game.id)}
                      onMouseEnter={playHoverSound}
                    >
                      Play
                    </button>
                    <button
                      className="action-btn secondary"
                      onClick={() => { setSelectedTitle(game.name.toUpperCase()); setShowComingSoon(true); playHit(); }}
                      onMouseEnter={playHoverSound}
                    >
                      Info
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="section-footer">
            <div className="stats-row">
              <div className="stat">
                <span className="stat-icon">🏆</span>
                <span className="stat-text">Jackpot Growing</span>
              </div>
              <div className="stat">
                <span className="stat-icon">👥</span>
                <span className="stat-text">24 Players Online</span>
              </div>
              <div className="stat">
                <span className="stat-icon">⚡</span>
                <span className="stat-text">New Games Weekly</span>
              </div>
            </div>
            <button
              className="load-more-btn"
              // onClick={() => navigate('/casino/games')}
              onMouseEnter={playHoverSound}
            >
              <span>Explore All Games</span>
              <span className="arrow">→</span>
            </button>
          </div>
        </section>
      </div>

      {/* Coming Soon Modal */}
      {showComingSoon && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowComingSoon(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-glow" />
            <div className="modal-header">
              <span className="modal-icon">🚧</span>
              <h2 className="modal-title">COMING SOON</h2>
            </div>
            <div className="modal-body">
              <p className="modal-game-name">{selectedTitle || 'NEW GAME'}</p>
              <p className="modal-description">This table is being prepared. Check back shortly!</p>
            </div>
            <button className="modal-close-btn" onClick={() => { playHit(); setShowComingSoon(false); }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Gambler Guide (Tour System) */}
      <GamblerGuide 
        onTourComplete={() => console.log('Casino tour completed!')}
      />
    </div>
  );
};

export default CasinoRealm;
