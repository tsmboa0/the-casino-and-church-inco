import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { useCoinflip, CoinflipTransactionResult } from "../../hooks/useCoinflip";
import ConfidentialRevealModal, { RevealPhase } from "./ConfidentialRevealModal";
import ClaimRewardsModal from "./ClaimRewardsModal";
import "../../styles/coinflip.css";

type GamePhase = "betting" | "submitting" | "awaiting-reveal" | "flipping" | "landing" | "result";
type CoinSide = "heads" | "tails";

const PAYOUT_MULTIPLIER = 1.95;
const HISTORY_LENGTH = 20;

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  emoji: string;
  type: "celebration" | "spark" | "trail";
}

interface CoinTransform {
  translateY: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale: number;
}

const CoinFlip: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { stopBackgroundMusic, playHit } = useAudio();
  const { updateLuckProgress } = useProgress();
  const { balance: solBalance } = useSolBalance();
  const wallet = useAnchorWallet();

  // On-chain game hook - restructured for separate reveal
  const { 
    submitCoinflip, 
    revealFlipResult,
    setResult: setGameResult,
    isSubmitting, 
    error: onChainError,
    lastResult
  } = useCoinflip();

  // Transaction result storage (for reveal phase)
  const [pendingTransaction, setPendingTransaction] = useState<CoinflipTransactionResult | null>(null);
  
  // Reveal modal state
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("reveal-result");
  const [revealedFlipResult, setRevealedFlipResult] = useState<CoinSide | null>(null);
  const [isWinResult, setIsWinResult] = useState<boolean>(false);

  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);

  // Audio refs
  const [flipAudio] = useState(() => {
    const audio = new Audio("/sounds/hit.mp3");
    audio.volume = 0.5;
    return audio;
  });
  const [whooshAudio] = useState(() => {
    const audio = new Audio("/sounds/hit.mp3");
    audio.volume = 0.3;
    audio.playbackRate = 1.5;
    return audio;
  });
  const [landAudio] = useState(() => {
    const audio = new Audio("/sounds/hit.mp3");
    audio.volume = 0.7;
    return audio;
  });
  const [winAudio] = useState(() => {
    const audio = new Audio("/sounds/casino_win_sound.wav");
    audio.volume = 0.8;
    return audio;
  });
  const [loseAudio] = useState(() => {
    const audio = new Audio("/sounds/casino_lost_sound.wav");
    audio.volume = 0.6;
    return audio;
  });

  useEffect(() => {
    stopBackgroundMusic();
  }, [stopBackgroundMusic]);

  // Game state
  const [phase, setPhase] = useState<GamePhase>("betting");
  const [selectedSide, setSelectedSide] = useState<CoinSide | null>(null);
  const [betInput, setBetInput] = useState("0.01");
  const [result, setResult] = useState<CoinSide | null>(null);
  const [history, setHistory] = useState<CoinSide[]>([]);
  const [unclaimed, setUnclaimed] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showLosePopup, setShowLosePopup] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [showFlash, setShowFlash] = useState<"win" | "lose" | null>(null);
  const [screenShake, setScreenShake] = useState(false);

  // 3D coin transform state
  const [coinTransform, setCoinTransform] = useState<CoinTransform>({
    translateY: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scale: 1,
  });

  const [stats, setStats] = useState({
    totalFlips: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalWagered: 0,
    totalWon: 0,
  });
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const animationRef = useRef<number | null>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const particleIdRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const effectiveBalance = wallet?.publicKey ? (solBalance ?? 0) : 0;

  // Update particles
  useEffect(() => {
    if (particles.length === 0) return;

    const interval = setInterval(() => {
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.type === "trail" ? p.vy : p.vy + 0.5,
            life: p.life - (p.type === "trail" ? 0.08 : 0.02),
            size: p.type === "trail" ? p.size * 0.95 : p.size,
          }))
          .filter((p) => p.life > 0)
      );
    }, 16);

    return () => clearInterval(interval);
  }, [particles.length]);

  // Spawn celebration particles
  const spawnCelebrationParticles = () => {
    const colors = ["#ffd700", "#ff2fb4", "#00f0ff", "#fff", "#22c55e"];
    const emojis = ["🪙", "✨", "💰", "⭐", "🎉", "💎", "👑"];
    const newParticles: Particle[] = [];

    for (let i = 0; i < 50; i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 25,
        vy: -Math.random() * 18 - 8,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 24 + Math.random() * 24,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        type: "celebration",
      });
    }
    setParticles((prev) => [...prev, ...newParticles]);
  };

  // Spawn spark particles during flip
  const spawnSparkParticles = (x: number, y: number) => {
    const colors = ["#ffd700", "#fff", "#ffec80"];
    const newParticles: Particle[] = [];

    for (let i = 0; i < 3; i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 8 + Math.random() * 8,
        emoji: "✦",
        type: "spark",
      });
    }
    setParticles((prev) => [...prev, ...newParticles]);
  };

  // Add to history
  const addToHistory = (side: CoinSide) => {
    setHistory((prev) => {
      const next = [side, ...prev];
      if (next.length > HISTORY_LENGTH) next.pop();
      return next;
    });
  };

  // Physics-based coin flip animation
  const animateCoinFlip = (flipResult: CoinSide, isWin: boolean, betSize: number) => {
    const startTime = performance.now();

    // Animation phases timing (in ms)
    const anticipationDuration = 300;
    const launchDuration = 350;
    const flightDuration = 1600;
    const landingDuration = 350;
    const totalDuration = anticipationDuration + launchDuration + flightDuration + landingDuration;

    // Physics parameters - keep coin within frame
    const maxHeight = -120; // Reduced height to stay in frame
    const totalFlips = 6 + Math.floor(Math.random() * 4); // 6-9 full rotations on X axis
    const finalRotateX = totalFlips * 360 + (flipResult === "heads" ? 0 : 180);
    const wobbleAmount = 15 + Math.random() * 10;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const totalProgress = Math.min(elapsed / totalDuration, 1);

      let translateY = 0;
      let rotateX = 0;
      let rotateY = 0;
      let rotateZ = 0;
      let scale = 1;

      if (elapsed < anticipationDuration) {
        // Phase 1: Anticipation - coin presses down
        const p = elapsed / anticipationDuration;
        const anticipationEase = Math.sin(p * Math.PI * 0.5);
        translateY = anticipationEase * 20; // Press down
        scale = 1 - anticipationEase * 0.1; // Slight squish
        rotateX = -anticipationEase * 10; // Tilt back

      } else if (elapsed < anticipationDuration + launchDuration) {
        // Phase 2: Launch - fast upward movement
        const p = (elapsed - anticipationDuration) / launchDuration;
        const launchEase = 1 - Math.pow(1 - p, 2); // Ease out quad
        translateY = 20 + (maxHeight - 20) * launchEase;
        rotateX = -10 + (finalRotateX * 0.3) * launchEase;
        rotateZ = wobbleAmount * Math.sin(p * Math.PI * 2) * (1 - p);
        scale = 1 - 0.1 + 0.1 * launchEase;

        // Spawn sparks during launch
        if (Math.random() < 0.3 && stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          spawnSparkParticles(
            rect.left + rect.width / 2 + (Math.random() - 0.5) * 60,
            rect.top + rect.height / 2 + translateY
          );
        }

      } else if (elapsed < anticipationDuration + launchDuration + flightDuration) {
        // Phase 3: Flight - parabolic arc with spinning
        const p = (elapsed - anticipationDuration - launchDuration) / flightDuration;

        // Parabolic trajectory
        const parabola = -4 * p * p + 4 * p; // 0 to 1 to 0
        translateY = maxHeight * (1 - p) + 0 * p + (parabola * -50); // Arc motion

        // Actually, let's do proper parabola
        // At p=0: at max height (maxHeight)
        // At p=1: back at 0
        translateY = maxHeight * (1 - Math.pow(p * 2 - 1, 2));

        // Rotation - fast then slowing
        const spinEase = p < 0.7 ? p / 0.7 : 1;
        rotateX = (finalRotateX * 0.3) + (finalRotateX * 0.7) * spinEase;

        // Wobble decreases as coin falls
        rotateZ = wobbleAmount * Math.sin(p * Math.PI * 6) * (1 - p);
        rotateY = 10 * Math.sin(p * Math.PI * 3) * (1 - p);

        // Scale slightly during spin
        scale = 1 + 0.05 * Math.sin(p * Math.PI * 4);

        // Sparks during flight
        if (Math.random() < 0.15 && stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          spawnSparkParticles(
            rect.left + rect.width / 2 + (Math.random() - 0.5) * 80,
            rect.top + rect.height / 2 + translateY
          );
        }

      } else {
        // Phase 4: Landing - bounce and settle
        const p = (elapsed - anticipationDuration - launchDuration - flightDuration) / landingDuration;
        const bounceEase = 1 - Math.abs(Math.sin(p * Math.PI * 2)) * Math.pow(1 - p, 2);

        translateY = (1 - bounceEase) * 15; // Small bounces
        rotateX = finalRotateX;
        rotateZ = wobbleAmount * Math.sin(p * Math.PI * 4) * Math.pow(1 - p, 3);
        scale = 1 + 0.05 * (1 - bounceEase);

        // Screen shake on first impact
        if (p < 0.1 && !screenShake) {
          setScreenShake(true);
          landAudio.currentTime = 0;
          landAudio.play().catch(() => { });
          setTimeout(() => setScreenShake(false), 200);
        }
      }

      setCoinTransform({ translateY, rotateX, rotateY, rotateZ, scale });

      if (totalProgress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation complete
        setCoinTransform({
          translateY: 0,
          rotateX: finalRotateX,
          rotateY: 0,
          rotateZ: 0,
          scale: 1,
        });

        setResult(flipResult);
        addToHistory(flipResult);
        setPhase("result");

        if (isWin) {
          const winnings = betSize * PAYOUT_MULTIPLIER;
          setWinAmount(winnings);
          setUnclaimed((prev) => prev + winnings);
          setShowWinPopup(true);
          setShowFlash("win");
          spawnCelebrationParticles();

          winAudio.currentTime = 0;
          winAudio.play().catch(() => { });

          setStats((prev) => ({
            ...prev,
            wins: prev.wins + 1,
            totalWon: prev.totalWon + winnings,
            currentStreak: prev.currentStreak + 1,
            bestStreak: Math.max(prev.bestStreak, prev.currentStreak + 1),
          }));

          updateLuckProgress(0.5);

          setTimeout(() => {
            setShowWinPopup(false);
            setShowFlash(null);
          }, 3000);
        } else {
          setShowLosePopup(true);
          setShowFlash("lose");

          loseAudio.currentTime = 0;
          loseAudio.play().catch(() => { });

          setStats((prev) => ({
            ...prev,
            losses: prev.losses + 1,
            currentStreak: 0,
          }));

          updateLuckProgress(-0.3);

          setTimeout(() => {
            setShowLosePopup(false);
            setShowFlash(null);
          }, 2000);
        }

        // Set game result for claim functionality
        if (pendingTransaction) {
          const payoutLamports = isWin ? Math.floor(betSize * PAYOUT_MULTIPLIER * 1_000_000_000) : 0;
          setGameResult({
            isWin,
            flipResult,
            payout: payoutLamports,
            txSignature: pendingTransaction.txSignature,
            gamePda: pendingTransaction.gamePda,
            payoutHandle: pendingTransaction.payoutHandle,
          });
        }

        // Reset for next flip
        setTimeout(() => {
          setPhase("betting");
          setResult(null);
          setRevealedFlipResult(null);
          setIsWinResult(false);
          setPendingTransaction(null);
          setCoinTransform({
            translateY: 0,
            rotateX: 0,
            rotateY: 0,
            rotateZ: 0,
            scale: 1,
          });
        }, 3000);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Handle reveal result (user clicks reveal in modal)
  const handleRevealResult = useCallback(async () => {
    if (!pendingTransaction) return;
    
    setRevealPhase("revealing-result");
    
    try {
      const flipResult = await revealFlipResult(pendingTransaction.flipHandle);
      setRevealedFlipResult(flipResult);
      
      // Check if win by comparing with selected side
      const isWin = flipResult === selectedSide;
      setIsWinResult(isWin);
      
      // Set to decrypted - modal will auto-close and trigger animation
      setRevealPhase("decrypted");
      
    } catch (error) {
      console.error("Failed to reveal result:", error);
      setRevealPhase("reveal-result"); // Allow retry
    }
  }, [pendingTransaction, revealFlipResult, selectedSide]);

  // Handle modal close - trigger the coin flip animation
  const handleRevealModalClose = useCallback(() => {
    const betSize = parseFloat(betInput || "0");
    
    // Scroll to top so user can see the animation
    const container = document.querySelector('.coinflip-page');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close modal
    setShowRevealModal(false);
    
    if (revealedFlipResult) {
      // Play sounds
      flipAudio.currentTime = 0;
      flipAudio.play().catch(() => { });
      whooshAudio.currentTime = 0;
      whooshAudio.play().catch(() => { });
      playHit();
      
      // Start the coin animation with the revealed result
      setPhase("flipping");
      animateCoinFlip(revealedFlipResult, isWinResult, betSize);
    }
    
    // Reset transaction data (but keep result for animation)
    setPendingTransaction(null);
    setRevealPhase("reveal-result");
  }, [revealedFlipResult, isWinResult, betInput, flipAudio, whooshAudio, playHit]);

  // Flip the coin - ON-CHAIN EXECUTION (Phase 1: Submit only)
  const flipCoin = useCallback(async () => {
    if (phase !== "betting" || !selectedSide) return;
    if (!wallet || !wallet.publicKey) {
      navigate("/");
      return;
    }

    const betSize = parseFloat(betInput || "0");
    if (betSize <= 0 || betSize > effectiveBalance) return;

    setPhase("submitting");
    playHit();

    // Update stats
    setStats((prev) => ({
      ...prev,
      totalFlips: prev.totalFlips + 1,
      totalWagered: prev.totalWagered + betSize,
    }));

    try {
      // Submit on-chain transaction (no decryption yet)
      console.log("Submitting coinflip transaction...");
      const txResult = await submitCoinflip(selectedSide, betSize);
      
      console.log("Transaction submitted:", txResult.txSignature);
      console.log("Flip handle:", txResult.flipHandle);
      console.log("Payout handle:", txResult.payoutHandle);
      
      // Store transaction result and show reveal modal
      setPendingTransaction(txResult);
      setPhase("awaiting-reveal");
      setShowRevealModal(true);
      setRevealPhase("reveal-result");
      
    } catch (error) {
      console.error("Coinflip submission failed:", error);
      setPhase("betting");
      // Revert stats on failure
      setStats((prev) => ({
        ...prev,
        totalFlips: prev.totalFlips - 1,
        totalWagered: prev.totalWagered - betSize,
      }));
    }
  }, [
    phase,
    selectedSide,
    betInput,
    effectiveBalance,
    wallet,
    playHit,
    navigate,
    submitCoinflip,
  ]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const canFlip =
    phase === "betting" &&
    selectedSide !== null &&
    parseFloat(betInput || "0") > 0 &&
    parseFloat(betInput || "0") <= effectiveBalance &&
    !isSubmitting;

  const claimUnclaimed = () => {
    if (unclaimed <= 0 || phase === "flipping") return;
    setUnclaimed(0);
    playHit();
  };

  // Open claim modal
  const handleOpenClaimModal = useCallback(() => {
    if (lastResult && lastResult.payoutHandle && lastResult.isWin && lastResult.payout > 0) {
      setShowClaimModal(true);
    }
  }, [lastResult]);

  // Handle successful claim
  const handleClaimSuccess = useCallback(() => {
    setGameResult(null);
    setShowClaimModal(false);
    
    // Also clear local unclaimed state
    if (unclaimed > 0) {
      setUnclaimed(0);
    }
    playHit();
  }, [setGameResult, unclaimed, playHit]);

  // Generate coin transform style
  const getCoinStyle = (): React.CSSProperties => {
    return {
      transform: `
        translateY(${coinTransform.translateY}px)
        rotateX(${coinTransform.rotateX}deg)
        rotateY(${coinTransform.rotateY}deg)
        rotateZ(${coinTransform.rotateZ}deg)
        scale(${coinTransform.scale})
      `,
    };
  };

  return (
    <div className={`coinflip-page ${isMobile ? "mobile" : "desktop"} ${screenShake ? "shake" : ""} ${showRevealModal ? "modal-open" : ""}`}>
      {/* Confidential Reveal Modal */}
      <ConfidentialRevealModal
        isOpen={showRevealModal}
        phase={revealPhase}
        onRevealResult={handleRevealResult}
        onClose={handleRevealModalClose}
      />

      {/* Claim Rewards Modal */}
      {lastResult && lastResult.payoutHandle && (
        <ClaimRewardsModal
          isOpen={showClaimModal}
          gamePda={lastResult.gamePda}
          payoutHandle={lastResult.payoutHandle}
          onClose={() => setShowClaimModal(false)}
          onSuccess={handleClaimSuccess}
        />
      )}

      {/* Background */}
      <div className="coinflip-bg">
        <div className="bg-gradient" />
        <div className="bg-grid" />
        <div className="bg-glow bg-glow-1" />
        <div className="bg-glow bg-glow-2" />
        <div className="bg-glow bg-glow-3" />
      </div>

      {/* Flash Effects */}
      {showFlash === "win" && <div className="screen-flash win-flash" />}
      {showFlash === "lose" && <div className="screen-flash lose-flash" />}

      {/* Particles */}
      <div className="particles-container">
        {particles.map((p) => (
          <div
            key={p.id}
            className={`particle particle-${p.type}`}
            style={{
              left: p.x,
              top: p.y,
              fontSize: p.size,
              opacity: p.life,
              color: p.color,
              transform: `rotate(${p.life * 360}deg) scale(${p.life})`,
              textShadow: p.type === "spark" ? `0 0 10px ${p.color}` : undefined,
            }}
          >
            {p.emoji}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="coinflip-header">
        <button className="back-btn" onClick={() => navigate("/casino")}>
          ←
        </button>

        <div className="header-center">
          <span className="game-title">🪙 COIN FLIP</span>
        </div>

        <div className="header-right">
          <div className="balance-chip">
            <span className="balance-label">Balance</span>
            <span className="balance-value">{(solBalance ?? 0).toFixed(4)} SOL</span>
          </div>
          {lastResult && lastResult.isWin && lastResult.payout > 0 && lastResult.payoutHandle && (
            <button
              className="claim-btn-small"
              onClick={handleOpenClaimModal}
              title="Claim Winnings"
              style={{
                background: 'var(--cf-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '10px',
                fontFamily: "'Press Start 2P', cursive",
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(255, 47, 180, 0.5)',
              }}
            >
              CLAIM
            </button>
          )}
          <button
            className={`icon-btn ${showStats ? "active" : ""}`}
            onClick={() => setShowStats(!showStats)}
          >
            📊
          </button>
          <button
            className={`icon-btn ${showRules ? "active" : ""}`}
            onClick={() => setShowRules(!showRules)}
          >
            ❓
          </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="coinflip-game">
        {/* Coin Container */}
        <div className="coin-section">
          <div className="coin-stage" ref={stageRef}>
            {/* Coin */}
            <div
              ref={coinRef}
              className={`coin-3d ${phase}`}
              style={getCoinStyle()}
            >
              {/* Front face - Heads */}
              <div className="coin-face coin-front">
                <div className="coin-inner">
                  <span className="coin-symbol">👑</span>
                  <span className="coin-text">HEADS</span>
                </div>
                <div className="coin-shine" />
                <div className="coin-ring" />
              </div>

              {/* Back face - Tails */}
              <div className="coin-face coin-back">
                <div className="coin-inner">
                  <span className="coin-symbol">🌙</span>
                  <span className="coin-text">TAILS</span>
                </div>
                <div className="coin-shine" />
                <div className="coin-ring" />
              </div>

              {/* Edge */}
              <div className="coin-edge-wrap">
                <div className="coin-edge" />
              </div>
            </div>

            {/* Landing Platform */}
            <div className="landing-platform">
              <div className="platform-surface" />
              <div className="platform-glow" />
            </div>

            {/* Coin Shadow */}
            <div
              className={`coin-shadow ${phase}`}
              style={{
                transform: `scale(${1 - Math.abs(coinTransform.translateY) / 400}) translateX(-50%)`,
                opacity: Math.max(0.2, 1 - Math.abs(coinTransform.translateY) / 300),
              }}
            />
          </div>

          {/* Result Display */}
          {phase === "result" && result && (
            <div className={`result-display ${result === selectedSide ? "win" : "lose"}`}>
              <span className="result-text">
                {result === selectedSide ? "🎉 YOU WIN! 🎉" : "YOU LOSE"}
              </span>
              <span className="result-side">{result.toUpperCase()}</span>
            </div>
          )}

          {/* Phase Status */}
          {phase === "betting" && !result && (
            <div className="phase-status">
              <span>Choose your side and place your bet</span>
            </div>
          )}
          {phase === "submitting" && (
            <div className="phase-status submitting">
              <div className="flip-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
              <span className="status-text">Submitting to blockchain...</span>
            </div>
          )}
          {phase === "awaiting-reveal" && (
            <div className="phase-status awaiting">
              <span className="status-text">Transaction confirmed. Reveal your fate!</span>
            </div>
          )}
          {(phase === "flipping" || phase === "landing") && (
            <div className="phase-status flipping">
              <div className="flip-dots">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}
        </div>

        {/* Side Selection */}
        <div className="side-selection">
          <div className="selection-header">
            <span className="selection-title">CHOOSE YOUR SIDE</span>
          </div>
          <div className="selection-buttons">
            <button
              className={`side-btn heads ${selectedSide === "heads" ? "selected" : ""}`}
              onClick={() => phase === "betting" && setSelectedSide("heads")}
              disabled={phase !== "betting"}
            >
              <div className="side-btn-bg" />
              <span className="side-icon">👑</span>
              <span className="side-label">HEADS</span>
              <span className="side-odds">2x Payout</span>
              {selectedSide === "heads" && <div className="selected-indicator" />}
            </button>

            <div className="vs-divider">
              <div className="vs-glow" />
              <span>VS</span>
            </div>

            <button
              className={`side-btn tails ${selectedSide === "tails" ? "selected" : ""}`}
              onClick={() => phase === "betting" && setSelectedSide("tails")}
              disabled={phase !== "betting"}
            >
              <div className="side-btn-bg" />
              <span className="side-icon">🌙</span>
              <span className="side-label">TAILS</span>
              <span className="side-odds">2x Payout</span>
              {selectedSide === "tails" && <div className="selected-indicator" />}
            </button>
          </div>
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          <div className="control-panel-header">
            <span className="panel-title">PLACE YOUR BET</span>
          </div>
          <div className="bet-section">
            <div className="bet-group">
              <label>Bet Amount (SOL)</label>
              <div className="input-row">
                <button
                  className="adjust-btn"
                  onClick={() =>
                    setBetInput((prev) => Math.max(0.01, parseFloat(prev) - 0.01).toFixed(4))
                  }
                  disabled={phase !== "betting"}
                >
                  −
                </button>
                <input
                  type="number"
                  className="bet-input"
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  disabled={phase !== "betting"}
                  step="0.01"
                  min="0.01"
                />
                <button
                  className="adjust-btn"
                  onClick={() =>
                    setBetInput((prev) =>
                      Math.min(effectiveBalance, parseFloat(prev) + 0.01).toFixed(4)
                    )
                  }
                  disabled={phase !== "betting"}
                >
                  +
                </button>
              </div>
              <div className="quick-bets">
                {[0.01, 0.05, 0.1, 0.5].map((amt) => (
                  <button
                    key={amt}
                    className="quick-btn"
                    onClick={() => setBetInput(Math.min(effectiveBalance, amt).toFixed(4))}
                    disabled={phase !== "betting"}
                  >
                    {amt}
                  </button>
                ))}
                <button
                  className="quick-btn max"
                  onClick={() => setBetInput(effectiveBalance.toFixed(4))}
                  disabled={phase !== "betting"}
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="payout-info">
              <span className="payout-label">Win Multiplier</span>
              <span className="payout-value">{PAYOUT_MULTIPLIER}x</span>
              <span className="potential-win">
                Potential Win:{" "}
                {(parseFloat(betInput || "0") * PAYOUT_MULTIPLIER).toFixed(4)} SOL
              </span>
            </div>
          </div>

          <div className="action-section">
            <button
              className={`flip-btn ${phase !== "betting" ? "flipping" : ""} ${canFlip ? "ready" : ""}`}
              onClick={flipCoin}
              disabled={!canFlip}
            >
              <div className="flip-btn-shine" />
              <span className="btn-icon">🪙</span>
              <span className="btn-text">
                {phase === "submitting" ? "SUBMITTING..." : 
                 phase === "awaiting-reveal" ? "AWAITING REVEAL..." :
                 phase === "flipping" ? "FLIPPING..." : "FLIP COIN"}
              </span>
            </button>

            {unclaimed > 0 && (
              <button
                className="claim-btn"
                onClick={claimUnclaimed}
                disabled={phase !== "betting"}
              >
                <span className="claim-icon">💰</span>
                CLAIM {unclaimed.toFixed(4)} SOL
              </button>
            )}
          </div>
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          {/* History */}
          <div className="history-section">
            <div className="section-header">
              <span>📜 Flip History</span>
            </div>
            <div className="history-chips">
              {history.length === 0 ? (
                <span className="empty">No flips yet</span>
              ) : (
                history.map((h, i) => (
                  <span key={i} className={`history-chip ${h}`} style={{ animationDelay: `${i * 0.05}s` }}>
                    {h === "heads" ? "👑" : "🌙"}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="stats-section">
            <div className="section-header">
              <span>📈 Statistics</span>
            </div>
            <div className="stat-row">
              <span>Total Flips</span>
              <span className="stat-value">{stats.totalFlips}</span>
            </div>
            <div className="stat-row">
              <span>Wins / Losses</span>
              <span className="stat-value">
                <span className="win-text">{stats.wins}</span> /{" "}
                <span className="lose-text">{stats.losses}</span>
              </span>
            </div>
            <div className="stat-row">
              <span>Win Rate</span>
              <span className="stat-value gold">
                {stats.totalFlips > 0
                  ? ((stats.wins / stats.totalFlips) * 100).toFixed(1)
                  : 0}
                %
              </span>
            </div>
            <div className="stat-row">
              <span>Current Streak</span>
              <span className="stat-value streak">{stats.currentStreak} 🔥</span>
            </div>
            <div className="stat-row">
              <span>Best Streak</span>
              <span className="stat-value best-streak">{stats.bestStreak} ⭐</span>
            </div>
            <div className="stat-row">
              <span>Wagered</span>
              <span className="stat-value">{stats.totalWagered.toFixed(4)} SOL</span>
            </div>
            <div className="stat-row">
              <span>Won</span>
              <span className="stat-value gold">{stats.totalWon.toFixed(4)} SOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Win Celebration - Full Screen Overlay */}
      {showWinPopup && (
        <div className="big-win-celebration">
          <div className="big-win-text">WINNER!</div>
          <div className="big-win-amount">+{winAmount.toFixed(4)} SOL</div>
          <div className="big-win-mult">@ {PAYOUT_MULTIPLIER}x</div>
        </div>
      )}

      {/* Lose Celebration - Full Screen Overlay */}
      {showLosePopup && (
        <div className="try-again-celebration">
          <div className="try-again-text">TRY AGAIN!</div>
          <div className="try-again-subtext">Better luck next flip!</div>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>📊 Full Statistics</h2>
            <div className="modal-stats">
              <div className="modal-stat">
                <span>Total Flips</span>
                <span>{stats.totalFlips}</span>
              </div>
              <div className="modal-stat">
                <span>Wins</span>
                <span className="win-text">{stats.wins}</span>
              </div>
              <div className="modal-stat">
                <span>Losses</span>
                <span className="lose-text">{stats.losses}</span>
              </div>
              <div className="modal-stat">
                <span>Win Rate</span>
                <span className="gold">
                  {stats.totalFlips > 0
                    ? ((stats.wins / stats.totalFlips) * 100).toFixed(1)
                    : 0}
                  %
                </span>
              </div>
              <div className="modal-stat">
                <span>Current Streak</span>
                <span className="streak">{stats.currentStreak} 🔥</span>
              </div>
              <div className="modal-stat">
                <span>Best Streak</span>
                <span className="best-streak">{stats.bestStreak} ⭐</span>
              </div>
              <div className="modal-stat">
                <span>Total Wagered</span>
                <span>{stats.totalWagered.toFixed(4)} SOL</span>
              </div>
              <div className="modal-stat">
                <span>Total Won</span>
                <span className="gold">{stats.totalWon.toFixed(4)} SOL</span>
              </div>
              <div className="modal-stat">
                <span>Net Profit</span>
                <span
                  className={
                    stats.totalWon - stats.totalWagered >= 0 ? "gold" : "lose-text"
                  }
                >
                  {(stats.totalWon - stats.totalWagered).toFixed(4)} SOL
                </span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowStats(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>❓ How to Play</h2>
            <ul className="rules-list">
              <li>Choose HEADS (👑) or TAILS (🌙)</li>
              <li>Set your bet amount in SOL</li>
              <li>Click FLIP COIN to flip</li>
              <li>If you guess correctly, you win {PAYOUT_MULTIPLIER}x your bet!</li>
              <li>Your winnings go to Unclaimed - click CLAIM to collect</li>
              <li>Build your streak for bragging rights! 🔥</li>
            </ul>
            <div className="rules-odds">
              <span className="odds-label">Odds:</span>
              <span className="odds-value">50/50</span>
              <span className="odds-label">Payout:</span>
              <span className="odds-value">{PAYOUT_MULTIPLIER}x</span>
            </div>
            <button className="modal-close" onClick={() => setShowRules(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinFlip;
