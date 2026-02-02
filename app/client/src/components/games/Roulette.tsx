import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useRoulette, RouletteTransactionResult } from "../../hooks/useRoulette";
import ConfidentialRevealModal, { RevealPhase } from "./ConfidentialRevealModal";
import ClaimRewardsModal from "./ClaimRewardsModal";
import "../../styles/roulette.css";

// European Roulette Numbers (0-36)
const ROULETTE_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

// Red numbers
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// Bet types and payouts (currently only straight bets supported on-chain)
const BET_PAYOUTS = {
  straight: 35,    // Single number
};

type Bet = {
  id: string;
  type: keyof typeof BET_PAYOUTS;
  numbers: number[];
  amount: number;
  position?: { x: number; y: number };
};

type RouletteProps = {};

const Roulette: React.FC<RouletteProps> = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { stopBackgroundMusic, playHit } = useAudio();
  const { updateLuckProgress } = useProgress();
  const { balance: solBalance } = useSolBalance();
  const { connection } = useConnection();
  const wallet = useWallet();

  // On-chain game hooks - restructured for separate reveal
  const { submitRoulette, revealSpinResult, setResult, isSubmitting, error: onChainError, lastResult } = useRoulette();

  // Confidential reveal modal state
  const [pendingTransaction, setPendingTransaction] = useState<RouletteTransactionResult | null>(null);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("reveal-result");
  
  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [revealedSpinResult, setRevealedSpinResult] = useState<number | null>(null);
  const [pendingChosenNumber, setPendingChosenNumber] = useState<number | null>(null);

  console.log(`is wallet connected ?: ${wallet.connected}\n address: ${wallet.publicKey?.toBase58()}`)


  // Audio
  const [spinAudio] = useState(() => new Audio('/sounds/roulette-wheel-sound.mp3'));
  const [winAudio] = useState(() => new Audio('/sounds/casino_win_sound.wav'));
  const [loseAudio] = useState(() => new Audio('/sounds/casino_lost_sound.wav'));
  const [chipAudio] = useState(() => new Audio('/sounds/hit.mp3'));

  useEffect(() => {
    spinAudio.loop = false;
    spinAudio.volume = 0.6;
    winAudio.volume = 0.7;
    loseAudio.volume = 0.8;
    chipAudio.volume = 0.5;
  }, [spinAudio, winAudio, loseAudio, chipAudio]);

  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      spinAudio.pause();
      spinAudio.currentTime = 0;
    };
  }, [stopBackgroundMusic, spinAudio]);

  // Game state
  const [betAmount, setBetAmount] = useState<number>(0.01);
  const [betInput, setBetInput] = useState<string>('0.01');
  const [bets, setBets] = useState<Bet[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [lastWin, setLastWin] = useState<number>(0);
  const [unclaimed, setUnclaimed] = useState<number>(0);
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLossAnimation, setShowLossAnimation] = useState(false);
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

  const wheelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate total bet
  const totalBet = bets.reduce((sum, bet) => sum + bet.amount, 0);

  // Require a connected wallet to play; effective balance is zero otherwise.
  const effectiveBalance = wallet.connected && wallet.publicKey ? (solBalance ?? 0) : 0;
  const currentBalance = solBalance ?? 0;
  const canSpin = !isSpinning && bets.length > 0 && totalBet <= effectiveBalance;

  // Redirect to homepage if wallet is not connected.
  // useEffect(() => {
  //   if (!wallet.connected || !wallet.publicKey) {
  //     navigate('/');
  //   }
  // }, [wallet.connected, wallet.publicKey, navigate]);

  // Place a bet
  const placeBet = useCallback((type: keyof typeof BET_PAYOUTS, numbers: number[], position?: { x: number; y: number }) => {
    if (isSpinning || betAmount <= 0) return;
    if (!wallet.connected || !wallet.publicKey) {
      navigate('/');
      return;
    }

    if (totalBet + betAmount > effectiveBalance) {
      return;
    }

    playHit();
    chipAudio.currentTime = 0;
    chipAudio.play().catch(() => { });

    const newBet: Bet = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      numbers,
      amount: betAmount,
      position,
    };

    setBets(prev => [...prev, newBet]);
  }, [betAmount, isSpinning, effectiveBalance, totalBet, playHit, chipAudio, wallet.connected, wallet.publicKey, navigate]);

  // Clear all bets
  const clearBets = useCallback(() => {
    if (isSpinning) return;
    playHit();
    setBets([]);
  }, [isSpinning, playHit]);

  // Remove a specific bet
  const removeBet = useCallback((betId: string) => {
    if (isSpinning) return;
    playHit();
    setBets(prev => prev.filter(bet => bet.id !== betId));
  }, [isSpinning, playHit]);

  // Adjust bet amount
  const adjustBet = (amount: number) => {
    const newBet = Math.max(0.01, Math.min(effectiveBalance, betAmount + amount));
    const rounded = Number(newBet.toFixed(4));
    setBetAmount(rounded);
    setBetInput(rounded.toFixed(4));
  };

  const setBetPercent = (percent: number) => {
    const newBet = (effectiveBalance * percent / 100);
    const rounded = Number(Math.max(0.01, newBet).toFixed(4));
    setBetAmount(rounded);
    setBetInput(rounded.toFixed(4));
  };

  const handleBetInputChange = (val: string) => {
    setBetInput(val);
    if (val === '') {
      setBetAmount(0);
      return;
    }
    const parsed = parseFloat(val);
    if (isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(effectiveBalance, parsed));
    setBetAmount(Number(clamped.toFixed(4)));
  };

  const handleBetInputBlur = () => {
    const minimum = 0.01;
    const normalized = Math.max(minimum, Math.min(effectiveBalance, betAmount));
    setBetAmount(normalized);
    setBetInput(normalized.toFixed(4));
  };

  // Handle reveal result (user clicks reveal in modal)
  const handleRevealResult = useCallback(async () => {
    if (!pendingTransaction) return;
    
    setRevealPhase("revealing-result");
    
    try {
      const spinResult = await revealSpinResult(pendingTransaction.spinHandle);
      setRevealedSpinResult(spinResult);
      
      // Set to decrypted - modal will auto-close and trigger animation
      setRevealPhase("decrypted");
    } catch (error) {
      console.error("Failed to reveal result:", error);
      setRevealPhase("reveal-result"); // Allow retry
    }
  }, [pendingTransaction, revealSpinResult]);

  // Animate wheel to specific result
  const animateWheelToResult = useCallback((winNum: number) => {
    // Play spin sound
    try {
      spinAudio.currentTime = 0;
      spinAudio.play();
    } catch { }

    // Calculate wheel rotation to align winning number with pointer
    const numberIndex = ROULETTE_NUMBERS.indexOf(winNum);
    const degreesPerNumber = 360 / 37;
    const numberCenterAngle = numberIndex * degreesPerNumber + (degreesPerNumber / 2);
    const targetOffset = (360 - numberCenterAngle) % 360;
    const baseRotation = wheelRotation % 360;
    const fullRotations = 5 + Math.random() * 3;
    const finalRotation = baseRotation + (fullRotations * 360) + targetOffset;

    // Animate wheel spin
    const startRotation = wheelRotation;
    const rotationDiff = finalRotation - startRotation;
    const duration = 4000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (rotationDiff * easeOut);
      setWheelRotation(currentRotation);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Wheel stopped
        setWheelRotation(finalRotation);
        setWinningNumber(winNum);
        spinAudio.pause();
        spinAudio.currentTime = 0;

        // Calculate wins
        let totalWin = 0;
        bets.forEach(bet => {
          const isWin = bet.numbers.includes(winNum);
          if (isWin) {
            const payout = BET_PAYOUTS[bet.type];
            totalWin += bet.amount * (payout + 1);
          }
        });

        setLastWin(totalWin);

        const isWin = totalWin > 0;
        const payoutLamports = Math.floor(totalWin * 1_000_000_000);
        
        if (isWin) {
          setUnclaimed(prev => prev + totalWin);
          setShowWinAnimation(true);
          setTimeout(() => setShowWinAnimation(false), 3000);
          try {
            winAudio.currentTime = 0;
            winAudio.play();
          } catch { }
          setGameStats(prev => ({
            ...prev,
            totalWins: prev.totalWins + 1,
            totalWon: prev.totalWon + totalWin,
            biggestWin: Math.max(prev.biggestWin, totalWin),
          }));
          updateLuckProgress(Math.min(2, totalWin / totalBet * 0.1));
        } else {
          setShowLossAnimation(true);
          setTimeout(() => setShowLossAnimation(false), 2000);
          try {
            loseAudio.currentTime = 0;
            loseAudio.play();
          } catch { }
          updateLuckProgress(-0.3);
        }

        // Set result for claim functionality (if we have pending transaction data)
        if (pendingTransaction) {
          setResult({
            isWin,
            spinResult: winNum,
            payout: payoutLamports,
            txSignature: pendingTransaction.txSignature,
            gamePda: pendingTransaction.gamePda,
            payoutHandle: pendingTransaction.payoutHandle,
          });
        }

        // Reset for next spin
        setTimeout(() => {
          setIsSpinning(false);
          setRevealedSpinResult(null);
          setPendingChosenNumber(null);
          setBets([]);
        }, 2000);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [wheelRotation, bets, totalBet, spinAudio, winAudio, loseAudio, updateLuckProgress, pendingTransaction, setResult]);

  // Handle modal close - trigger the wheel spin animation
  const handleRevealModalClose = useCallback(() => {
    // Scroll to top so user can see the animation
    const container = document.querySelector('.roulette-page');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close modal
    setShowRevealModal(false);
    
    if (revealedSpinResult !== null) {
      // Start wheel animation with revealed result
      animateWheelToResult(revealedSpinResult);
    }
    
    // Reset transaction data
    setPendingTransaction(null);
    setRevealPhase("reveal-result");
  }, [revealedSpinResult, animateWheelToResult]);

  // Spin the wheel - ON-CHAIN SUBMISSION
  const spinWheel = useCallback(async () => {
    if (isSpinning || bets.length === 0) return;
    if (!wallet.connected || !wallet.publicKey) {
      navigate('/');
      return;
    }

    if (totalBet > effectiveBalance) return;

    setIsSpinning(true);
    setWinningNumber(null);
    setLastWin(0);
    setShowWinAnimation(false);
    setShowLossAnimation(false);

    // Scroll to top to show the wheel
    document.querySelector('.roulette-page')?.scrollTo({ top: 0, behavior: 'smooth' });

    // Update stats
    setGameStats(prev => ({
      ...prev,
      totalSpins: prev.totalSpins + 1,
      totalWagered: prev.totalWagered + totalBet,
    }));

    playHit();

    // All bets are straight bets (single number)
    // Use the first bet's number for the on-chain call
    const chosenNumber = bets[0].numbers[0];
    setPendingChosenNumber(chosenNumber);
    
    try {
      // Submit on-chain transaction (no decryption yet)
      console.log("Submitting on-chain roulette with number:", chosenNumber);
      
      const txResult = await submitRoulette(chosenNumber, totalBet);
      console.log("Transaction submitted:", txResult.txSignature);
      
      // Show reveal modal
      setPendingTransaction(txResult);
      setShowRevealModal(true);
      setRevealPhase("reveal-result");
    } catch (error) {
      console.error("Roulette submission failed:", error);
      setIsSpinning(false);
      // Revert stats
      setGameStats(prev => ({
        ...prev,
        totalSpins: prev.totalSpins - 1,
        totalWagered: prev.totalWagered - totalBet,
      }));
      return;
    }
  }, [isSpinning, bets, totalBet, effectiveBalance, wallet, playHit, navigate, submitRoulette]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Get number color
  const getNumberColor = (num: number): 'green' | 'red' | 'black' => {
    if (num === 0) return 'green';
    return RED_NUMBERS.includes(num) ? 'red' : 'black';
  };

  // Calculate which number is currently under the pointer (at top, 0 degrees)
  // The pointer is fixed at the top, so we need to find which number segment is at 0 degrees
  const getNumberAtPointer = (rotation: number): number => {
    // Normalize rotation to 0-360
    const normalizedRotation = ((rotation % 360) + 360) % 360;

    // The wheel rotates clockwise
    // Each number occupies 360/37 degrees
    const degreesPerNumber = 360 / 37;

    // To find which number is at the top (0 degrees) after rotation:
    // We need to work backwards from the rotation
    // The wheel image likely has 0 at a specific position (let's assume it starts at top)
    // When the wheel rotates clockwise by R degrees, the number that was at angle A is now at angle (A - R)
    // So to find what's at 0 degrees: we need the number that was at angle R
    // But we need to account for the initial position of 0 in the image

    // Assuming the wheel image has 0 at the top initially (0 degrees)
    // After rotating by R degrees clockwise, the number at the top is:
    // Find which segment contains the angle (360 - normalizedRotation)
    const angleAtTop = (360 - normalizedRotation) % 360;
    const segmentIndex = Math.floor(angleAtTop / degreesPerNumber);
    const actualIndex = segmentIndex % 37;

    return ROULETTE_NUMBERS[actualIndex];
  };

  // Get current number at pointer (for display during spin)
  const currentNumberAtPointer = isSpinning ? getNumberAtPointer(wheelRotation) : (winningNumber ?? null);

  const hasStraightBet = (num: number) => bets.some(b => b.type === 'straight' && b.numbers.includes(num));

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
    <div className={`roulette-page ${isMobile ? 'mobile' : 'desktop'} ${showRevealModal ? 'modal-open' : ''}`}>
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
      <div className="roulette-bg">
        <img src="/scenes/casino_scene.png" alt="Casino" />
        <div className="roulette-overlay" />
      </div>

      {/* Header */}
      <div className="roulette-header">
        <button className="back-btn" onClick={() => navigate('/casino')}>
          ←
        </button>

        <div className="header-center">
          <span className="game-title">🎰 ROULETTE</span>
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
          {winningNumber !== null && (
            <div className="balance-display last-number">
              <span className="label">Last:</span>
              <span className={`value number-${getNumberColor(winningNumber)}`}>
                {winningNumber}
              </span>
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
            className={`icon-btn ${showRules ? 'active' : ''}`}
            onClick={() => setShowRules(!showRules)}
            title="Rules"
          >
            📜
          </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="roulette-game-area">
        {/* Roulette Wheel */}
        <div className="wheel-container">
          {/* Fixed Pointer - Always at the top */}
          <div className="wheel-pointer">
            <div className="pointer-arrow"></div>
            <div className="pointer-base"></div>
            {currentNumberAtPointer !== null && (
              <div className={`pointer-number number-${getNumberColor(currentNumberAtPointer)}`}>
                {currentNumberAtPointer}
              </div>
            )}
          </div>

          <div
            ref={wheelRef}
            className="roulette-wheel"
            style={{ transform: `rotate(${wheelRotation}deg)` }}
          >
            <img
              src="/assets/roulette-wheel-transparent.webp"
              alt="Roulette Wheel"
              className="wheel-image"
            />
          </div>
          {isSpinning && <div className="spinning-overlay">SPINNING...</div>}
        </div>

        {/* Betting Table */}
        <div className="betting-table-container">
          <div className="betting-table">
            {/* Number Grid - Roulette Table Layout */}
            <div className="number-grid">
              {/* Zero at top - horizontal */}
              <div
                className={`number-cell zero ${hasStraightBet(0) ? 'selected' : ''} ${winningNumber === 0 ? 'winning' : ''}`}
                onClick={() => placeBet('straight', [0])}
              >
                <span className="number-text">0</span>
                {bets.filter(b => b.type === 'straight' && b.numbers.includes(0)).length > 0 && (
                  <div className="bet-chip">
                    {bets
                      .filter(b => b.type === 'straight' && b.numbers.includes(0))
                      .reduce((sum, b) => sum + b.amount, 0)
                      .toFixed(2)}
                  </div>
                )}
              </div>

              {/* Numbers 1-36 arranged horizontally */}
              <div className="numbers-row">
                {Array.from({ length: 36 }, (_, i) => i + 1).map(num => {
                  const color = getNumberColor(num);
                  const isSelected = hasStraightBet(num);
                  return (
                    <div
                      key={num}
                      className={`number-cell ${color} ${isSelected ? 'selected' : ''} ${winningNumber === num ? 'winning' : ''}`}
                      onClick={() => placeBet('straight', [num])}
                    >
                      <span className="number-text">{num}</span>
                      {bets.filter(b => b.type === 'straight' && b.numbers.includes(num)).length > 0 && (
                        <div className="bet-chip">
                          {bets
                            .filter(b => b.type === 'straight' && b.numbers.includes(num))
                            .reduce((sum, b) => sum + b.amount, 0)
                            .toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Note: Only straight bets (single numbers) are currently supported */}
            <div className="betting-hint">
              <span>Click on any number to place a straight bet</span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          <div className="control-panel-header">
            <span className="panel-title">PLACE YOUR BET</span>
          </div>
          
          {/* Bet Amount Controls */}
          <div className="bet-controls">
            <div className="bet-row">
              <label>
                Bet Amount:
                <div className="bet-subtext">Min: 0.01 SOL</div>
              </label>
              <div className="bet-input-group">
                <button className="bet-btn-small" onClick={() => adjustBet(-0.01)} disabled={isSpinning}>
                  −
                </button>
                <input
                  type="number"
                  className="bet-input"
                  value={betInput}
                  onChange={(e) => handleBetInputChange(e.target.value)}
                  onBlur={handleBetInputBlur}
                  disabled={isSpinning}
                  step="0.01"
                  min="0.01"
                  max={effectiveBalance}
                  placeholder="0.01"
                />
                <button
                  className="bet-btn-small"
                  onClick={() => {
                    setBetAmount(0.01);
                    setBetInput('0.01');
                  }}
                  disabled={isSpinning}
                  title="Clear to minimum"
                >
                  C
                </button>
                <button className="bet-btn-small" onClick={() => adjustBet(0.01)} disabled={isSpinning}>
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

          {/* Quick Bet Buttons */}
          {/* <div className="quick-bet-buttons">
            <button className="quick-bet" onClick={() => setBetPercent(5)} disabled={isSpinning}>
              5%
            </button>
            <button className="quick-bet" onClick={() => setBetPercent(10)} disabled={isSpinning}>
              10%
            </button>
            <button className="quick-bet" onClick={() => setBetPercent(25)} disabled={isSpinning}>
              25%
            </button>
            <button className="quick-bet" onClick={() => setBetPercent(50)} disabled={isSpinning}>
              50%
            </button>
            <button className="quick-bet" onClick={() => setBetAmount(Math.min(currentBalance, 1))} disabled={isSpinning}>
              MAX
            </button>
          </div> */}

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              className={`spin-btn ${!canSpin ? 'disabled' : ''} ${isSpinning ? 'spinning' : ''}`}
              onClick={spinWheel}
              disabled={!canSpin}
            >
              {isSpinning ? 'SPINNING...' : 'SPIN'}
            </button>
            <button
              className="clear-btn"
              onClick={clearBets}
              disabled={isSpinning || bets.length === 0}
            >
              CLEAR BETS
            </button>
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
            {lastResult && lastResult.isWin && lastResult.payout > 0 && lastResult.payoutHandle && (
              <button
                className="claim-btn"
                onClick={handleOpenClaimModal}
                disabled={isSpinning}
                style={{
                  background: 'linear-gradient(135deg, #ffd700 0%, #cc9a00 100%)',
                  color: '#000',
                  fontWeight: 'bold',
                }}
              >
                CLAIM REWARD
              </button>
            )}
          </div>

          {/* Win Display */}
          {lastWin > 0 && (
            <div className="win-display">
              <div className="win-amount">WIN: {lastWin.toFixed(4)} SOL</div>
            </div>
          )}

          {/* Bet History */}
          {bets.length > 0 && (
            <div className="bet-history">
              <div className="bet-history-title">Active Bets ({bets.length})</div>
              <div className="bet-history-list">
                {bets.map(bet => (
                  <div key={bet.id} className="bet-history-item">
                    <span className="bet-info">
                      {bet.type.toUpperCase()}: {bet.numbers.join(', ')}
                    </span>
                    <span className="bet-amount">{bet.amount.toFixed(4)} SOL</span>
                    <button
                      className="remove-bet-btn"
                      onClick={() => removeBet(bet.id)}
                      disabled={isSpinning}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPaytable && (
        <div className="modal-overlay" onClick={() => setShowPaytable(false)}>
          <div className="modal-content paytable-modal" onClick={e => e.stopPropagation()}>
            <h2>📊 PAYTABLE</h2>
            <div className="paytable-content">
              <table className="paytable-table">
                <thead>
                  <tr>
                    <th>Bet Type</th>
                    <th>Payout</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Straight</td>
                    <td>35:1</td>
                    <td>Bet on a single number (0-36)</td>
                  </tr>
                </tbody>
              </table>
              <p className="paytable-note">More bet types coming soon!</p>
            </div>
            <button className="modal-close" onClick={() => setShowPaytable(false)}>CLOSE</button>
          </div>
        </div>
      )}

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

      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content rules-modal" onClick={e => e.stopPropagation()}>
            <h2>📜 GAME RULES</h2>
            <div className="rules-content">
              <ul>
                <li>Place bets by clicking on numbers or outside bet areas</li>
                <li>Set your bet amount using the controls</li>
                <li>Click on any number (0-36) to place a straight bet</li>
                <li>You can place multiple straight bets before spinning</li>
                <li>Click SPIN to spin the wheel and reveal your fate</li>
                <li>If the ball lands on your number, you win 35x your bet!</li>
                <li>Winnings go to Unclaimed - press CASHOUT to claim</li>
                <li>Use CLEAR BETS to remove all placed bets</li>
              </ul>
            </div>
            <button className="modal-close" onClick={() => setShowRules(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Win/Loss Animations */}
      {showWinAnimation && lastWin > 0 && (
        <div className="big-win-celebration">
          <div className="big-win-text">WINNER!</div>
          <div className="big-win-amount">{lastWin.toFixed(4)} SOL</div>
        </div>
      )}

      {showLossAnimation && (
        <div className="try-again-celebration">
          <div className="try-again-text">TRY AGAIN!</div>
          <div className="try-again-subtext">Better luck next spin!</div>
        </div>
      )}
    </div>
  );
};

export default Roulette;

