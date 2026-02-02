import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useSlotMachine, REEL_SYMBOLS, SlotTransactionResult } from "../../hooks/useSlotMachine";
import ConfidentialRevealModal, { RevealPhase } from "./ConfidentialRevealModal";
import ClaimRewardsModal from "./ClaimRewardsModal";
import "../../styles/slot-machine.css";

// Symbol definitions
const SYMBOLS = {
  LOW: ["🍒", "🍋", "🍊", "🍇"], // Low value symbols
  MED: ["🔔", "⭐"], // Medium value symbols
  HIGH: ["💎"], // High value symbol
  WILD: "🌟", // Wild symbol (substitutes)
  SCATTER: "🎰", // Scatter symbol (triggers free spins)
  BONUS: "🎁", // Bonus symbol
};

const ALL_SYMBOLS = [
  ...SYMBOLS.LOW,
  ...SYMBOLS.MED,
  ...SYMBOLS.HIGH,
  SYMBOLS.WILD,
  SYMBOLS.SCATTER,
  SYMBOLS.BONUS,
];

// Paylines configuration (3 reels x 3 rows)
const PAYLINES = [
  [1, 1, 1], // Line 1: Middle row
  [0, 0, 0], // Line 2: Top row
  [2, 2, 2], // Line 3: Bottom row
  [0, 1, 2], // Line 4: Diagonal down
  [2, 1, 0], // Line 5: Diagonal up
];

// Payout table (3 matching symbols)
const PAYOUTS: Record<string, number> = {
  "💎": 50,   // Diamond - highest
  "🔔": 25,   // Bell
  "⭐": 20,   // Star
  "🍇": 15,   // Grapes
  "🍊": 12,   // Orange
  "🍋": 10,   // Lemon
  "🍒": 8,    // Cherry - lowest
  "🌟": 0,    // Wild - pays highest matching symbol
};

const REELS = 3;
const ROWS = 3;

type ReelState = {
  isSpinning: boolean;
  intervalId: number | null;
  symbols: string[];
  offset: number;
  speed: number;
  spinTicks: number;
  stopping: boolean;
  targetSymbols: string[];
  landingSet: boolean;
};

type WinLine = {
  lineIndex: number;
  positions: number[][];
  symbols: string[];
  payout: number;
};

const SlotMachine: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { stopBackgroundMusic, playHit } = useAudio();
  const { updateLuckProgress } = useProgress();
  const { balance: solBalance } = useSolBalance();
  const { connection } = useConnection();
  const wallet = useWallet();

  // On-chain game hooks - restructured for separate reveal
  const { submitSlots, revealReels, setResult, isSubmitting, error: onChainError, lastResult } = useSlotMachine();

  // Confidential reveal modal state
  const [pendingTransaction, setPendingTransaction] = useState<SlotTransactionResult | null>(null);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("reveal-result");
  
  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [revealedReels, setRevealedReels] = useState<[number, number, number] | null>(null);

  console.log(`is wallet connected ?: ${wallet.connected}\n address: ${wallet.publicKey?.toBase58()}`)

  // Audio
  const [spinAudio] = useState(() => new Audio('/sounds/spinning_slot_machine.wav'));
  const [winAudio] = useState(() => new Audio('/sounds/casino_win_sound.wav'));
  const [bigWinAudio] = useState(() => new Audio('/sounds/casino_win_sound.wav'));
  const [loseAudio] = useState(() => new Audio('/sounds/casino_lost_sound.wav'));
  const [scatterAudio] = useState(() => new Audio('/sounds/success.mp3'));

  useEffect(() => {
    spinAudio.loop = true;
    spinAudio.volume = 0.4;
    winAudio.volume = 0.7;
    bigWinAudio.volume = 1.0;
    loseAudio.volume = 0.8;
    scatterAudio.volume = 0.8;
  }, [spinAudio, winAudio, bigWinAudio, loseAudio, scatterAudio]);

  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      spinAudio.pause();
      spinAudio.currentTime = 0;
    };
  }, [stopBackgroundMusic, spinAudio]);

  // Game state
  const [bet, setBet] = useState<number>(0.01);
  const [betLevel, setBetLevel] = useState<number>(1);
  const [coinValue, setCoinValue] = useState<number>(0.01);
  const [activePaylines, setActivePaylines] = useState<number>(5);
  const [unclaimed, setUnclaimed] = useState<number>(0);
  const [totalBet, setTotalBet] = useState<number>(0.01);
  const [reels, setReels] = useState<ReelState[]>(() =>
    Array.from({ length: REELS }, () => ({
      isSpinning: false,
      intervalId: null,
      symbols: Array.from({ length: ROWS }, () => ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]),
      offset: 0,
      speed: 15,
      spinTicks: 0,
      stopping: false,
      targetSymbols: [],
      landingSet: false,
    }))
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [autoSpinCount, setAutoSpinCount] = useState(10);
  const [autoSpinRemaining, setAutoSpinRemaining] = useState(0);
  const [quickSpin, setQuickSpin] = useState(false);
  const [winLines, setWinLines] = useState<WinLine[]>([]);
  const [lastWin, setLastWin] = useState<number>(0);
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLossAnimation, setShowLossAnimation] = useState(false);
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [showPaytable, setShowPaytable] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [gameStats, setGameStats] = useState({
    totalSpins: 0,
    totalWins: 0,
    totalWagered: 0,
    totalWon: 0,
    biggestWin: 0,
  });

  const reelRefs = useRef<(HTMLDivElement | null)[]>(Array(REELS).fill(null));
  const itemHeights = useRef<number[]>(Array(REELS).fill(0));

  // Calculate total bet
  useEffect(() => {
    setTotalBet(bet * betLevel * activePaylines);
  }, [bet, betLevel, activePaylines]);

  // Measure reel heights
  const measureHeights = useCallback(() => {
    reelRefs.current.forEach((ref, index) => {
      if (ref) {
        const symbolEl = ref.querySelector('.slot-symbol');
        if (symbolEl) {
          itemHeights.current[index] = symbolEl.getBoundingClientRect().height;
        }
      }
    });
  }, []);

  useEffect(() => {
    measureHeights();
    const timeout = setTimeout(measureHeights, 500);
    window.addEventListener("resize", measureHeights);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", measureHeights);
    };
  }, [measureHeights]);

  // Generate random symbol
  const randomSymbol = (): string => {
    const rand = Math.random();
    if (rand < 0.02) return SYMBOLS.BONUS; // 2% bonus
    if (rand < 0.05) return SYMBOLS.SCATTER; // 3% scatter
    if (rand < 0.08) return SYMBOLS.WILD; // 3% wild
    if (rand < 0.20) return SYMBOLS.HIGH[0]; // 12% high
    if (rand < 0.40) return SYMBOLS.MED[Math.floor(Math.random() * SYMBOLS.MED.length)]; // 20% medium
    return SYMBOLS.LOW[Math.floor(Math.random() * SYMBOLS.LOW.length)]; // 60% low
  };

  // Start spinning a reel
  const startReelSpin = (reelIndex: number) => {
    setReels(prev => {
      const updated = [...prev];
      const reel = { ...updated[reelIndex] };

      if (reel.intervalId) {
        clearInterval(reel.intervalId);
      }

      reel.isSpinning = true;
      reel.stopping = false;
      reel.landingSet = false;
      reel.offset = 0;
      reel.speed = quickSpin ? 25 : 15;
      reel.spinTicks = 0;

      const intervalId = window.setInterval(() => {
        setReels(current => {
          const currentReel = { ...current[reelIndex] };
          const itemH = itemHeights.current[reelIndex] || 100;

          if (!currentReel.stopping && currentReel.spinTicks < 40) {
            currentReel.speed = Math.min(quickSpin ? 30 : 20, currentReel.speed * 1.05);
            currentReel.spinTicks += 1;
          }

          currentReel.offset += currentReel.speed;

          if (currentReel.stopping && currentReel.speed > 2) {
            currentReel.speed *= 0.95;
          }

          if (currentReel.offset >= itemH) {
            currentReel.offset -= itemH;

            if (currentReel.stopping && !currentReel.landingSet) {
              currentReel.symbols = [...currentReel.targetSymbols];
              currentReel.landingSet = true;
            } else {
              // Add random symbol during spin
              const newSymbol = randomSymbol();
              currentReel.symbols = [newSymbol, ...currentReel.symbols.slice(0, ROWS - 1)];
            }

            if (currentReel.stopping && currentReel.speed <= 2 && currentReel.landingSet) {
              currentReel.isSpinning = false;
              currentReel.stopping = false;
              currentReel.speed = 15;
              currentReel.spinTicks = 0;
              currentReel.offset = 0;
              if (currentReel.intervalId) {
                clearInterval(currentReel.intervalId);
              }
              currentReel.intervalId = null;
            }
          }

          const updated = [...current];
          updated[reelIndex] = currentReel;
          return updated;
        });
      }, 16);

      reel.intervalId = intervalId;
      updated[reelIndex] = reel;
      return updated;
    });
  };

  // Stop a reel
  const stopReel = (reelIndex: number, targetSymbols: string[]) => {
    setReels(prev => {
      const updated = [...prev];
      updated[reelIndex] = {
        ...updated[reelIndex],
        stopping: true,
        targetSymbols,
      };
      return updated;
    });
  };

  // Check for wins (3-reel slot - all 3 must match)
  const checkWins = useCallback((reelSymbols: string[][]): WinLine[] => {
    const wins: WinLine[] = [];
    const grid = reelSymbols;

    // Check each payline
    PAYLINES.slice(0, activePaylines).forEach((payline, lineIndex) => {
      const lineSymbols = payline.map((row, reel) => grid[reel][row]);
      const positions = payline.map((row, reel) => [reel, row]);

      // Check for wild substitutions
      let checkedSymbols = [...lineSymbols];
      let baseSymbol: string | null = null;

      // Find first non-wild symbol
      for (const sym of checkedSymbols) {
        if (sym !== SYMBOLS.WILD && sym !== SYMBOLS.SCATTER && sym !== SYMBOLS.BONUS) {
          baseSymbol = sym;
          break;
        }
      }

      // Replace wilds with base symbol
      if (baseSymbol) {
        checkedSymbols = checkedSymbols.map(sym =>
          sym === SYMBOLS.WILD ? baseSymbol! : sym
        );
      }

      // For 3-reel slots: all 3 must match
      if (baseSymbol) {
        const allMatch = checkedSymbols.every(s => s === baseSymbol || s === SYMBOLS.WILD);

        if (allMatch) {
          const payout = PAYOUTS[baseSymbol] || PAYOUTS["🍒"];

          if (payout > 0) {
            wins.push({
              lineIndex,
              positions,
              symbols: lineSymbols,
              payout: payout * betLevel * multiplier,
            });
          }
        }
      }
    });

    // Check for scatter wins (anywhere on screen - need all 3 for 3-reel)
    const scatterCount = grid.flat().filter(s => s === SYMBOLS.SCATTER).length;
    if (scatterCount >= 3) {
      wins.push({
        lineIndex: -1,
        positions: [],
        symbols: [],
        payout: 10 * betLevel * multiplier,
      });

      // Trigger free spins
      setFreeSpinsRemaining(prev => prev + 5);
    }

    return wins;
  }, [activePaylines, betLevel, multiplier]);

  // Handle reveal result (user clicks reveal in modal)
  const handleRevealResult = useCallback(async () => {
    if (!pendingTransaction) return;
    
    setRevealPhase("revealing-result");
    
    try {
      const reelsResult = await revealReels(pendingTransaction.reelHandles);
      setRevealedReels(reelsResult);
      
      // Set to decrypted - modal will auto-close and trigger animation
      setRevealPhase("decrypted");
    } catch (error) {
      console.error("Failed to reveal result:", error);
      setRevealPhase("reveal-result"); // Allow retry
    }
  }, [pendingTransaction, revealReels]);

  // Animate reels with revealed values
  const animateReelsWithResult = useCallback((reelValues: [number, number, number]) => {
    // Play spin sound
    try {
      spinAudio.currentTime = 0;
      spinAudio.play();
    } catch { }

    // Generate final symbols from revealed result (3 reels)
    const finalSymbols: string[][] = [];
    for (let reel = 0; reel < REELS; reel++) {
      const reelSymbols: string[] = [];
      for (let row = 0; row < ROWS; row++) {
        // Use revealed reel value for middle row (row 1), random for top/bottom
        if (row === 1) {
          reelSymbols.push(REEL_SYMBOLS[reelValues[reel]] || randomSymbol());
        } else {
          reelSymbols.push(randomSymbol());
        }
      }
      finalSymbols.push(reelSymbols);
    }

    // Start spinning all 3 reels
    for (let i = 0; i < REELS; i++) {
      setTimeout(() => startReelSpin(i), i * 150);
    }

    // Stop reels sequentially (3 reels)
    const stopDelays = quickSpin ? [800, 1000, 1200] : [1500, 1900, 2300];
    stopDelays.forEach((delay, i) => {
      setTimeout(() => stopReel(i, finalSymbols[i]), delay);
    });

    // Check for wins after all reels stop
    setTimeout(() => {
      const checkInterval = setInterval(() => {
        setReels(current => {
          const allStopped = current.every(r => !r.isSpinning);
          if (allStopped) {
            clearInterval(checkInterval);
            spinAudio.pause();
            spinAudio.currentTime = 0;

            // Check wins
            const currentGrid = current.map(r => r.symbols);
            const wins = checkWins(currentGrid);

            if (wins.length > 0) {
              const totalWinVal = wins.reduce((sum, w) => sum + w.payout, 0);
              setWinLines(wins);
              setLastWin(totalWinVal);
              setUnclaimed(prev => prev + totalWinVal);

              setGameStats(prev => ({
                ...prev,
                totalWins: prev.totalWins + 1,
                totalWon: prev.totalWon + totalWinVal,
                biggestWin: Math.max(prev.biggestWin, totalWinVal),
              }));

              // Play win sound
              try {
                if (totalWinVal >= totalBet * 50) {
                  bigWinAudio.currentTime = 0;
                  bigWinAudio.play();
                } else {
                  winAudio.currentTime = 0;
                  winAudio.play();
                }
              } catch { }

              // Show win animation
              setShowWinAnimation(true);
              setTimeout(() => setShowWinAnimation(false), 3000);

              // Update luck
              updateLuckProgress(Math.min(2, totalWinVal / totalBet * 0.1));
            } else {
              // No win - show loss animation
              setLastWin(0);
              setShowLossAnimation(true);
              setTimeout(() => setShowLossAnimation(false), 3000);

              // Play lose sound
              try {
                loseAudio.currentTime = 0;
                loseAudio.play();
              } catch { }

              updateLuckProgress(-0.5);
            }

            // Set result for claim functionality
            const isWin = wins.length > 0;
            const totalWinVal = wins.reduce((sum, w) => sum + w.payout, 0);
            const payoutLamports = Math.floor(totalWinVal * 1_000_000_000);
            
            if (pendingTransaction) {
              setResult({
                isWin,
                reels: reelValues as [number, number, number],
                reelSymbols: [
                  REEL_SYMBOLS[reelValues[0]] || '?',
                  REEL_SYMBOLS[reelValues[1]] || '?',
                  REEL_SYMBOLS[reelValues[2]] || '?',
                ] as [string, string, string],
                payout: payoutLamports,
                txSignature: pendingTransaction.txSignature,
                gamePda: pendingTransaction.gamePda,
                payoutHandle: pendingTransaction.payoutHandle,
              });
              setPendingTransaction(null);
            }

            setIsSpinning(false);
            setRevealedReels(null);
            
            // Note: Auto-spin disabled for confidential flow (requires user reveal each time)
          }
          return current;
        });
      }, 50);
    }, Math.max(...stopDelays) + 500);
  }, [quickSpin, spinAudio, checkWins, totalBet, winAudio, bigWinAudio, loseAudio, updateLuckProgress, pendingTransaction, setResult, setPendingTransaction]);

  // Handle modal close - trigger the reel animation
  const handleRevealModalClose = useCallback(() => {
    // Scroll to top so user can see the animation
    const container = document.querySelector('.modern-slot-machine');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close modal
    setShowRevealModal(false);
    
    if (revealedReels) {
      // Start reel animation with revealed result
      animateReelsWithResult(revealedReels);
    }
    
    // Note: pendingTransaction is cleared inside animateReelsWithResult after setResult
    setRevealPhase("reveal-result");
  }, [revealedReels, animateReelsWithResult]);

  // Main spin function - ON-CHAIN SUBMISSION
  const handleSpin = useCallback(async () => {
    console.log("inside handle spin");
    if (isSpinning) return;

    const currentBalance = solBalance ?? 0;
    const isFreeSpin = freeSpinsRemaining > 0;

    console.log(`is free spin ?: ${isFreeSpin}`)

    if (!isFreeSpin && (totalBet <= 0 || totalBet > currentBalance)) {
      return;
    }

    setIsSpinning(true);
    setWinLines([]);
    setLastWin(0);
    setShowWinAnimation(false);
    setShowLossAnimation(false);

    // Scroll to top to show the slot animation
    document.querySelector('.modern-slot-machine')?.scrollTo({ top: 0, behavior: 'smooth' });

    // Update stats
    if (!isFreeSpin) {
      setGameStats(prev => ({
        ...prev,
        totalSpins: prev.totalSpins + 1,
        totalWagered: prev.totalWagered + totalBet,
      }));
    } else {
      setGameStats(prev => ({
        ...prev,
        totalSpins: prev.totalSpins + 1,
      }));
    }

    playHit();

    // Submit ON-CHAIN slot transaction (no decryption yet)
    try {
      console.log("Submitting on-chain slot spin...");
      const txResult = await submitSlots(totalBet);
      console.log("Transaction submitted:", txResult.txSignature);
      
      // Show reveal modal
      setPendingTransaction(txResult);
      setShowRevealModal(true);
      setRevealPhase("reveal-result");
    } catch (error) {
      console.error("Slot submission failed:", error);
      setIsSpinning(false);
      // Revert stats
      if (!isFreeSpin) {
        setGameStats(prev => ({
          ...prev,
          totalSpins: prev.totalSpins - 1,
          totalWagered: prev.totalWagered - totalBet,
        }));
      }
      return;
    }
  }, [isSpinning, totalBet, solBalance, playHit, freeSpinsRemaining, submitSlots]);

  // Auto-spin handler
  const handleAutoSpin = () => {
    if (autoSpin) {
      setAutoSpin(false);
      setAutoSpinRemaining(0);
    } else if (autoSpinCount > 0) {
      setAutoSpin(true);
      setAutoSpinRemaining(autoSpinCount);
      handleSpin();
    }
  };

  // Bet management
  const adjustBet = (amount: number) => {
    const newBet = Math.max(0.01, Math.min((solBalance ?? 0), bet + amount));
    setBet(Number(newBet.toFixed(4)));
  };

  const setBetPercent = (percent: number) => {
    const newBet = ((solBalance ?? 0) * percent / 100);
    setBet(Number(Math.max(0.01, newBet).toFixed(4)));
  };

  const maxBet = () => {
    setBet(Number(Math.max(0.01, (solBalance ?? 0) * 0.1).toFixed(4)));
    setBetLevel(10);
    setActivePaylines(5);
  };

  const currentBalance = solBalance ?? 0;
  const canSpin = !isSpinning && (
    freeSpinsRemaining > 0 ||
    (totalBet > 0 && totalBet <= currentBalance)
  );

  // Open claim modal
  const handleOpenClaimModal = useCallback(() => {
    if (lastResult && lastResult.payoutHandle && lastResult.isWin && lastResult.payout > 0) {
      setShowClaimModal(true);
    }
  }, [lastResult]);

  // Handle successful claim
  const handleClaimSuccess = useCallback(() => {
    setResult(null);
    setShowClaimModal(false);
    
    // Also clear local unclaimed state
    if (unclaimed > 0) {
      setUnclaimed(0);
    }
    playHit();
  }, [setResult, unclaimed, playHit]);

  return (
    <div className={`modern-slot-machine ${isMobile ? 'mobile' : 'desktop'} ${showRevealModal ? 'modal-open' : ''}`}>
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
      <div className="slot-bg">
        <img src="/scenes/casino_scene.png" alt="Casino" />
        <div className="slot-overlay" />
      </div>

      {/* Header */}
      <div className="slot-header">
        <button className="back-btn" onClick={() => navigate('/casino')}>
          ←
        </button>

        <div className="header-center">
          <span className="game-title">🎰 SLOTS</span>
        </div>

        <div className="header-info">
          <div className="balance-display">
            <span className="label">Balance:</span>
            <span className="value">{currentBalance.toFixed(4)} SOL</span>
          </div>
          <div className="balance-display">
            <span className="label">Unclaimed:</span>
            <span className="value gold">{unclaimed.toFixed(4)} SOL</span>
          </div>
          {lastResult && lastResult.isWin && lastResult.payout > 0 && lastResult.payoutHandle && (
            <button
              className="claim-btn-small"
              onClick={handleOpenClaimModal}
              title="Claim Winnings"
              style={{
                background: '#ffd700',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '0.8rem',
                marginLeft: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              CLAIM
            </button>
          )}
          {freeSpinsRemaining > 0 && (
            <div className="balance-display free-spins">
              <span className="label">Free Spins:</span>
              <span className="value">{freeSpinsRemaining}</span>
            </div>
          )}
        </div>
        <div className="header-controls">
          <button
            className={`icon-btn ${showPaytable ? 'active' : ''}`}
            onClick={() => setShowPaytable(!showPaytable)}
            title="Paytable"
          >
            📊
          </button>
          <button
            className={`icon-btn ${showStats ? 'active' : ''}`}
            onClick={() => setShowStats(!showStats)}
            title="Statistics"
          >
            📈
          </button>
          <button
            className={`icon-btn ${quickSpin ? 'active' : ''}`}
            onClick={() => setQuickSpin(!quickSpin)}
            title="Quick Spin"
          >
            ⚡
          </button>
          <button
            className={`icon-btn ${showRules ? 'active' : ''}`}
            onClick={() => setShowRules(!showRules)}
            title="Rules"
          >
            📜
          </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="slot-game-area">
        {/* Slot Machine */}
        <div className="slot-machine-container">
          <div className="slot-machine-frame">
            {/* Reels */}
            <div className="reels-container">
              {reels.map((reel, reelIndex) => (
                <div
                  key={reelIndex}
                  className="reel-column"
                  ref={el => reelRefs.current[reelIndex] = el}
                >
                  <div className="reel-mask">
                    {reel.isSpinning ? (
                      <div
                        className="reel-scroll"
                        style={{
                          transform: `translateY(${reel.offset}px)`,
                          transition: reel.stopping ? 'none' : 'transform 0.1s linear'
                        }}
                      >
                        {[...Array(20)].map((_, i) => (
                          <div key={i} className="slot-symbol">
                            {i < ROWS ? reel.symbols[i] : randomSymbol()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      reel.symbols.map((symbol, rowIndex) => (
                        <div
                          key={rowIndex}
                          className={`slot-symbol ${winLines.some(w =>
                            w.positions.some(([r, c]) => r === reelIndex && c === rowIndex)
                          ) ? 'winning' : ''}`}
                        >
                          {symbol}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Win Lines Overlay */}
            {winLines.length > 0 && winLines.map((win, i) => (
              <svg key={i} className="win-line" viewBox="0 0 300 300">
                <path
                  d={`M ${(win.positions[0][0] + 0.5) * 100} ${(win.positions[0][1] + 0.5) * 100} ${win.positions.slice(1).map(([r, c]) => `L ${(r + 0.5) * 100} ${(c + 0.5) * 100}`).join(' ')}`}
                  stroke="#ffd166"
                  strokeWidth="4"
                  fill="none"
                  className="win-line-path"
                />
              </svg>
            ))}

            {/* Particle Effects */}
            {showWinAnimation && (
              <div className="particles">
                {[...Array(50)].map((_, i) => (
                  <div key={i} className="particle" style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 0.5}s`,
                    animationDuration: `${1 + Math.random()}s`
                  }}>🎉</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          {/* Bet Controls */}
          <div className="bet-controls">
            <div className="bet-row">
              <label>Bet Amount:</label>
              <div className="bet-input-group">
                <button className="bet-btn-small" onClick={() => adjustBet(-0.01)} disabled={isSpinning}>-</button>
                <input
                  type="number"
                  className="bet-input"
                  value={bet}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0.01;
                    setBet(Math.max(0.01, Math.min(currentBalance, val)));
                  }}
                  disabled={isSpinning}
                  step="0.01"
                  min="0.01"
                  max={currentBalance}
                />
                <button className="bet-btn-small" onClick={() => adjustBet(0.01)} disabled={isSpinning}>+</button>
              </div>
            </div>

            <div className="bet-row">
              <label>Bet Level:</label>
              <div className="bet-level-controls">
                {[1, 2, 5, 10].map(level => (
                  <button
                    key={level}
                    className={`bet-level-btn ${betLevel === level ? 'active' : ''}`}
                    onClick={() => setBetLevel(level)}
                    disabled={isSpinning}
                  >
                    {level}x
                  </button>
                ))}
              </div>
            </div>

            <div className="bet-row">
              <label>Paylines:</label>
              <div className="paylines-control">
                <button
                  className="payline-btn"
                  onClick={() => setActivePaylines(p => Math.max(1, p - 1))}
                  disabled={isSpinning}
                >
                  −
                </button>
                <span className="payline-count">{activePaylines}</span>
                <button
                  className="payline-btn"
                  onClick={() => setActivePaylines(p => Math.min(5, p + 1))}
                  disabled={isSpinning}
                >
                  +
                </button>
              </div>
            </div>

            <div className="bet-row">
              <label>Total Bet:</label>
              <div className="total-bet-display">
                {totalBet.toFixed(4)} SOL
              </div>
            </div>
          </div>

          {/* Quick Bet Buttons
          <div className="quick-bet-buttons">
            <button className="quick-bet" onClick={() => setBetPercent(5)} disabled={isSpinning}>5%</button>
            <button className="quick-bet" onClick={() => setBetPercent(10)} disabled={isSpinning}>10%</button>
            <button className="quick-bet" onClick={() => setBetPercent(25)} disabled={isSpinning}>25%</button>
            <button className="quick-bet" onClick={() => setBetPercent(50)} disabled={isSpinning}>50%</button>
            <button className="quick-bet" onClick={() => maxBet()} disabled={isSpinning}>MAX</button>
          </div> */}

          {/* Main Action Buttons */}
          <div className="action-buttons">
            <button
              className={`spin-btn ${!canSpin ? 'disabled' : ''} ${isSpinning ? 'spinning' : ''}`}
              onClick={handleSpin}
              disabled={!canSpin}
            >
              {isSpinning ? 'SPINNING...' : freeSpinsRemaining > 0 ? `FREE SPIN (${freeSpinsRemaining})` : 'SPIN'}
            </button>

            <div className="secondary-actions">
              <div className="auto-spin-group">
                <button
                  className={`auto-spin-btn ${autoSpin ? 'active' : ''}`}
                  onClick={handleAutoSpin}
                  disabled={(isSpinning && !autoSpin) || autoSpinCount <= 0}
                >
                  AUTO
                </button>
                <input
                  type="number"
                  className="auto-spin-input"
                  value={autoSpinCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setAutoSpinCount(Math.max(0, Math.min(100, val)));
                  }}
                  disabled={isSpinning}
                  min="1"
                  max="100"
                />
              </div>
              <button
                className="cashout-btn"
                onClick={() => {
                  if (unclaimed > 0) {
                    setUnclaimed(0);
                    playHit();
                  }
                }}
                disabled={unclaimed === 0 || isSpinning}
              >
                CASHOUT
              </button>
            </div>

            {(autoSpin || freeSpinsRemaining > 0) && (
              <div className="auto-spin-info">
                {autoSpin && `Auto: ${autoSpinRemaining} spins left`}
                {freeSpinsRemaining > 0 && `Free Spins: ${freeSpinsRemaining}`}
              </div>
            )}
          </div>

          {/* Win Display */}
          {lastWin > 0 && (
            <div className="win-display">
              <div className="win-amount">WIN: {lastWin.toFixed(4)} SOL</div>
              {winLines.length > 0 && (
                <div className="win-details">
                  {winLines.map((w, i) => (
                    <div key={i} className="win-line-info">
                      Line {w.lineIndex + 1}: {w.payout.toFixed(4)} SOL
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="modal-overlay" onClick={() => setShowPaytable(false)}>
          <div className="modal-content paytable-modal" onClick={e => e.stopPropagation()}>
            <h2>📊 PAYTABLE</h2>
            <div className="paytable-content">
              <div className="paytable-section">
                <h3>Symbol Payouts (Match 3)</h3>
                <table className="paytable-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(PAYOUTS).filter(([s]) => s !== "🌟").map(([symbol, payout]) => (
                      <tr key={symbol}>
                        <td className="symbol-cell">{symbol}</td>
                        <td>{payout}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="paytable-section">
                <h3>Special Symbols</h3>
                <div className="special-symbols">
                  <div><span className="symbol-cell">{SYMBOLS.WILD}</span> - Wild (substitutes any symbol)</div>
                  <div><span className="symbol-cell">{SYMBOLS.SCATTER}</span> - 3 Scatters = 10x + 5 Free Spins</div>
                </div>
              </div>
              <div className="paytable-section">
                <h3>Paylines (5 Lines)</h3>
                <div className="paylines-info">
                  <div>Line 1: ─ ─ ─ (Middle)</div>
                  <div>Line 2: ─ ─ ─ (Top)</div>
                  <div>Line 3: ─ ─ ─ (Bottom)</div>
                  <div>Line 4: ╲ (Diagonal Down)</div>
                  <div>Line 5: ╱ (Diagonal Up)</div>
                </div>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowPaytable(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Statistics Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content stats-modal" onClick={e => e.stopPropagation()}>
            <h2>📈 STATISTICS</h2>
            <div className="stats-content">
              <div className="stat-item">
                <span className="stat-label">Total Spins:</span>
                <span className="stat-value">{gameStats.totalSpins}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Wagered:</span>
                <span className="stat-value">{gameStats.totalWagered.toFixed(4)} SOL</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Won:</span>
                <span className="stat-value">{gameStats.totalWon.toFixed(4)} SOL</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Wins:</span>
                <span className="stat-value">{gameStats.totalWins}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Win Rate:</span>
                <span className="stat-value">
                  {gameStats.totalSpins > 0
                    ? ((gameStats.totalWins / gameStats.totalSpins) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Biggest Win:</span>
                <span className="stat-value gold">{gameStats.biggestWin.toFixed(4)} SOL</span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowStats(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content rules-modal" onClick={e => e.stopPropagation()}>
            <h2>📜 GAME RULES</h2>
            <div className="rules-content">
              <ul>
                <li>This is a classic 3-reel slot machine</li>
                <li>Set your bet amount and bet level using the controls</li>
                <li>Choose the number of active paylines (1-5)</li>
                <li>Press SPIN to start the reels</li>
                <li>Win by matching all 3 symbols on a payline</li>
                <li>Wild symbols (🌟) substitute for any symbol</li>
                <li>3 Scatter symbols (🎰) trigger 5 free spins</li>
                <li>Enable QUICK SPIN (⚡) for faster animations</li>
                <li>Winnings accumulate in Unclaimed - press CASHOUT to claim</li>
              </ul>
            </div>
            <button className="modal-close" onClick={() => setShowRules(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Big Win Celebration */}
      {showWinAnimation && lastWin >= totalBet * 50 && (
        <div className="big-win-celebration">
          <div className="big-win-text">BIG WIN!</div>
          <div className="big-win-amount">{lastWin.toFixed(4)} SOL</div>
        </div>
      )}

      {/* Try Again Loss Animation */}
      {showLossAnimation && (
        <div className="try-again-celebration">
          <div className="try-again-text">TRY AGAIN!</div>
          <div className="try-again-subtext">Better luck next spin!</div>
        </div>
      )}
    </div>
  );
};

export default SlotMachine;
