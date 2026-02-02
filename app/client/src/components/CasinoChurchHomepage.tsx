import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/use-is-mobile";
import { useAudio } from "../lib/stores/useAudio";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletConnectButton from "./WalletConnectButton";
import WalletModal from "./WalletModal";
import StoryModal from "./StoryModal";

const CasinoChurchHomepage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [hoveredSide, setHoveredSide] = useState<'casino' | 'church' | null>(null);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const { publicKey } = useWallet();
  const { 
    backgroundMusic, 
    hitSound, 
    successSound, 
    isMuted,
    isMusicPlaying,
    setBackgroundMusic, 
    setHitSound, 
    setSuccessSound,
    playHit,
    playSuccess,
    toggleMute,
    startBackgroundMusic
  } = useAudio();

  // Initialize audio on component mount
  useEffect(() => {
    if (!isAudioInitialized) {
      // Initialize background music
      const bgMusic = new Audio('/sounds/background.mp3');
      bgMusic.loop = true;
      bgMusic.volume = 0.4;
      bgMusic.preload = 'auto';
      setBackgroundMusic(bgMusic);

      // Initialize sound effects
      const hitAudio = new Audio('/sounds/hit.mp3');
      hitAudio.volume = 0.3;
      hitAudio.preload = 'auto';
      setHitSound(hitAudio);

      const successAudio = new Audio('/sounds/success.mp3');
      successAudio.volume = 0.4;
      successAudio.preload = 'auto';
      setSuccessSound(successAudio);

      setIsAudioInitialized(true);
    }
  }, [isAudioInitialized, setBackgroundMusic, setHitSound, setSuccessSound]);

  // Start background music immediately when audio is initialized
  useEffect(() => {
    if (isAudioInitialized && !isMuted) {
      // Try to start background music with autoplay handling
      const startMusic = async () => {
        try {
          await startBackgroundMusic();
        } catch (error) {
          console.log("Autoplay prevented, waiting for user interaction");
          // Set up a one-time click listener to start music
          const handleFirstClick = () => {
            startBackgroundMusic();
            document.removeEventListener('click', handleFirstClick);
            document.removeEventListener('touchstart', handleFirstClick);
          };
          document.addEventListener('click', handleFirstClick);
          document.addEventListener('touchstart', handleFirstClick);
        }
      };
      
      startMusic();
    }
  }, [isAudioInitialized, isMuted, startBackgroundMusic]);

  // Check if this is the first visit and show story modal
  useEffect(() => {
    const hasVisited = localStorage.getItem('casino-church-visited');
    if (!hasVisited) {
      setTimeout(() => {
        setShowStoryModal(true);
        localStorage.setItem('casino-church-visited', 'true');
      }, 3000);
    }
  }, []);

  const playHoverSound = () => {
    playHit();
  };

  // Handle first user interaction to start audio
  const handleFirstInteraction = () => {
    if (isAudioInitialized && !isMuted) {
      startBackgroundMusic();
    }
  };

  const handleEnterCasino = () => {
    if (!publicKey) {
      setShowWalletModal(true);
      return;
    }
    playSuccess();
    console.log("Entering Casino...");
    navigate('/casino');
  };

  const handleEnterChurch = () => {
    if (!publicKey) {
      setShowWalletModal(true);
      return;
    }
    playSuccess();
    console.log("Entering Church...");
    navigate('/church');
  };

  return (
    <div 
      className={`homepage-container ${isMobile ? 'mobile' : 'desktop'}`}
      onClick={handleFirstInteraction}
      onTouchStart={handleFirstInteraction}
    >
      {/* Background Image - Different for mobile */}
      <div className="background-image">
        <img 
          src={isMobile ? "/scenes/homepage-mobile.webp" : "/scenes/home_scene.png"} 
          alt="Casino & Church Scene" 
        />
      </div>

      {/* Game Title */}
      <div className="game-title">
        <h1 className="pixel-title">
          <span className="title-part">THE</span>
        </h1>
      </div>

      {/* Split Screen Layout */}
      <div className="split-container">
        {/* Casino Side */}
        <div 
          className={`side casino-side ${hoveredSide === 'casino' ? 'hovered' : ''}`}
          onMouseEnter={() => {
            setHoveredSide('casino');
            playHoverSound();
          }}
          onMouseLeave={() => setHoveredSide(null)}
        >
          {/* Casino Title */}
          <div className="side-title casino-title">
            <h2>CASINO</h2>
          </div>

          <div className="side-content">
            <div className="avatar-container">
              <div className="casino-avatar">
                <div className="avatar-body">
                  {/* <div className="avatar-outfit">
                    <div className="flashy-jacket"></div>
                    <div className="gold-chain"></div>
                  </div> */}
                  <div className="sol-tokens">
                    <span className="token">◎</span>
                    <span className="token">◎</span>
                    <span className="token">◎</span>
                    <span className="token">◎</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Casino Button - Positioned Lower */}
          <div className="button-container casino-button-container">
            <button 
              className="enter-button casino-button"
              onClick={handleEnterCasino}
              onMouseEnter={playHoverSound}
            >
              <span className="button-icon">🎰</span>
              <span className="button-text">ENTER CASINO</span>
            </button>

            <div className="tooltip casino-tooltip">
              "SPECULATE. WIN. REPEAT."
            </div>
          </div>
        </div>

        {/* Center Intersection */}
        <div className="center-intersection">
          <div className="intersection-symbol">&</div>
        </div>

        {/* Church Side */}
        <div 
          className={`side church-side ${hoveredSide === 'church' ? 'hovered' : ''}`}
          onMouseEnter={() => {
            setHoveredSide('church');
            playHoverSound();
          }}
          onMouseLeave={() => setHoveredSide(null)}
        >
          {/* Church Title */}
          <div className="side-title church-title">
            <h2>CHURCH</h2>
          </div>

          <div className="side-content">
            <div className="avatar-container">
              <div className="church-avatar">
                <div className="avatar-body">
                  <div className="avatar-robes">
                    {/* <div className="digital-robe"></div>
                    <div className="holy-hood"></div> */}
                  </div>
                  <div className="glowing-ledger">
                    <div className="ledger">📖</div>
                    <div className="ledger-glow"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Church Button - Positioned Lower */}
          <div className="button-container church-button-container">
            <button 
              className="enter-button church-button"
              onClick={handleEnterChurch}
              onMouseEnter={playHoverSound}
            >
              <span className="button-icon">⛪</span>
              <span className="button-text">ENTER CHURCH</span>
            </button>

            <div className="tooltip church-tooltip">
              "PREACH. BUILD. BELIEVE."
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Branding */}
      <div className="branding">
        <div className="solana-badge">
          <span className="badge-text">Built on</span>
          <span className="solana-logo">◎ Solana</span>
        </div>
        <button 
          className="story-button"
          onClick={() => setShowStoryModal(true)}
          title="Read the Game Story"
        >
          <span className="">BACKSTORY</span>
          <span className="">📖</span>
        </button>
      </div>

      {/* Audio Control */}
      <button 
        className="audio-control"
        onClick={toggleMute}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>


      {/* Wallet Connect Button */}
      <div className="wallet-control">
        <WalletConnectButton />
      </div>

      {/* Wallet Modal */}
      <WalletModal 
        isOpen={showWalletModal} 
        onClose={() => setShowWalletModal(false)} 
      />

      {/* Story Modal */}
      <StoryModal 
        isOpen={showStoryModal} 
        onClose={() => setShowStoryModal(false)} 
      />

      {/* Audio Ready Indicator */}
      {isAudioInitialized && !isMusicPlaying && !isMuted && (
        <div className="audio-ready-indicator">
          <span>Click anywhere to start music</span>
        </div>
      )}
    </div>
  );
};

export default CasinoChurchHomepage;
