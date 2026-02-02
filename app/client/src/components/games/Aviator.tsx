import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import useAviator, { AviatorResult, AviatorTransactionResult } from "../../hooks/useAviator";
import ConfidentialRevealModal, { RevealPhase } from "./ConfidentialRevealModal";
import ClaimRewardsModal from "./ClaimRewardsModal";
import "../../styles/aviator.css";

type RoundPhase = "betting" | "countdown" | "takeoff" | "in-flight" | "crashed";

const COUNTDOWN_SECONDS = 3;
const HISTORY_LENGTH = 20;

interface CashoutMarker {
  multiplier: number;
  player: string;
  amount: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const Aviator: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { stopBackgroundMusic, playHit } = useAudio();
  const { updateLuckProgress } = useProgress();
  const { balance: solBalance } = useSolBalance();
  const { connection } = useConnection();
  const wallet = useWallet();

  // On-chain hooks - restructured for separate reveal
  const { submitAviator, revealCrashMultiplier, setResult, isSubmitting, error: aviatorError, lastResult } = useAviator();

  // Confidential reveal modal state
  const [pendingTransaction, setPendingTransaction] = useState<AviatorTransactionResult | null>(null);
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("reveal-result");
  
  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [revealedCrashMultiplier, setRevealedCrashMultiplier] = useState<number | null>(null);

  // Canvas & Element refs
  const curveCanvasRef = useRef<HTMLCanvasElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);

  // Audio
  const [engineAudio] = useState(() => {
    const audio = new Audio("/sounds/prop-plane-14513.mp3");
    audio.loop = true;
    audio.volume = 0.3;
    return audio;
  });
  const [crashAudio] = useState(() => {
    const audio = new Audio("/sounds/casino_lost_sound.wav");
    audio.volume = 0.8;
    return audio;
  });
  const [cashoutAudio] = useState(() => {
    const audio = new Audio("/sounds/casino_win_sound.wav");
    audio.volume = 0.8;
    return audio;
  });
  const [tickAudio] = useState(() => {
    const audio = new Audio("/sounds/hit.mp3");
    audio.volume = 0.5;
    return audio;
  });

  useEffect(() => {
    stopBackgroundMusic();
    return () => {
      engineAudio.pause();
      engineAudio.currentTime = 0;
    };
  }, [stopBackgroundMusic, engineAudio]);

  // Game state
  const [phase, setPhase] = useState<RoundPhase>("betting");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashMultiplier, setCrashMultiplier] = useState<number | null>(null);
  const [activeBet, setActiveBet] = useState(0);
  const [betInput, setBetInput] = useState("0.01");
  const [autoCashout, setAutoCashout] = useState("2.00");
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [unclaimed, setUnclaimed] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [cashoutMarkers, setCashoutMarkers] = useState<CashoutMarker[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [takeoffProgress, setTakeoffProgress] = useState(0);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [showCrashFlash, setShowCrashFlash] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [winMultiplier, setWinMultiplier] = useState(0);

  const [stats, setStats] = useState({
    rounds: 0,
    totalWagered: 0,
    totalWon: 0,
    bestMultiplier: 0,
    biggestWin: 0,
  });
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const animationRef = useRef<number | null>(null);
  const roundTimerRef = useRef<NodeJS.Timeout | null>(null);
  const curvePointsRef = useRef<{ x: number; y: number }[]>([]);
  const flightStartTimeRef = useRef<number>(0);

  // Store the on-chain result to control the animation
  const onChainResultRef = useRef<AviatorResult | null>(null);

  const effectiveBalance = wallet.connected && wallet.publicKey ? (solBalance ?? 0) : 0;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (roundTimerRef.current) clearTimeout(roundTimerRef.current);
    };
  }, []);

  // Get multiplier color - casino neon theme
  const getMultiplierColor = (mult: number) => {
    if (mult < 1.5) return "#00f0ff"; // cyan
    if (mult < 2) return "#00d4ff"; // light cyan
    if (mult < 3) return "#ff6fd4"; // light pink
    if (mult < 5) return "#ff2fb4"; // neon pink
    if (mult < 10) return "#ffd700"; // gold
    return "#ff1493"; // deep pink
  };

  // Draw flight curve on canvas
  const drawCurve = useCallback(() => {
    const canvas = curveCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let y = height; y > 0; y -= 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw runway
    if (phase === "betting" || phase === "countdown") {
      const runwayY = height - 30;
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, runwayY, width, 30);

      // Runway lines
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 15]);
      ctx.beginPath();
      ctx.moveTo(0, runwayY + 15);
      ctx.lineTo(width * 0.4, runwayY + 15);
      ctx.stroke();
      ctx.setLineDash([]);

      // Runway lights
      for (let x = 20; x < width * 0.4; x += 40) {
        ctx.fillStyle = phase === "countdown" ? "#ffd700" : "rgba(255, 215, 0, 0.5)";
        ctx.beginPath();
        ctx.arc(x, runwayY + 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw takeoff path during takeoff
    if (phase === "takeoff") {
      const startX = 40;
      const startY = height - 45;
      const endX = 80 + takeoffProgress * 60;
      const endY = height - 45 - takeoffProgress * 80;

      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Glow effect
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Move plane ref
      if (planeRef.current) {
        planeRef.current.style.left = `${endX}px`;
        planeRef.current.style.top = `${endY}px`;
        const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
        planeRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      }
    }

    // Draw flight curve during flight
    if ((phase === "in-flight" || phase === "crashed") && curvePointsRef.current.length > 1) {
      const points = curvePointsRef.current;

      // Create gradient along curve - neon casino theme
      const gradient = ctx.createLinearGradient(
        points[0].x,
        points[0].y,
        points[points.length - 1].x,
        points[points.length - 1].y
      );
      gradient.addColorStop(0, "#00f0ff");
      gradient.addColorStop(0.3, "#00d4ff");
      gradient.addColorStop(0.5, "#ff6fd4");
      gradient.addColorStop(0.7, "#ff2fb4");
      gradient.addColorStop(1, phase === "crashed" ? "#ef4444" : getMultiplierColor(multiplier));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Glow effect
      ctx.shadowColor = getMultiplierColor(multiplier);
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Update plane pos
      if (planeRef.current) {
        const lastP = points[points.length - 1];
        const prevP = points[Math.max(0, points.length - 2)];
        planeRef.current.style.left = `${lastP.x}px`;
        planeRef.current.style.top = `${lastP.y}px`;
        const angle = Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x) * (180 / Math.PI);
        planeRef.current.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
      }

      // Draw cashout markers
      cashoutMarkers.forEach((marker) => {
        const progress = Math.log(marker.multiplier) / Math.log(100);
        const idx = Math.floor(progress * (points.length - 1));
        if (idx >= 0 && idx < points.length) {
          const point = points[idx];

          ctx.fillStyle = "#00f0ff";
          ctx.shadowColor = "#00f0ff";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.fillStyle = "#fff";
          ctx.font = "10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(`${marker.multiplier.toFixed(2)}x`, point.x, point.y - 12);
        }
      });
    }
  }, [phase, multiplier, takeoffProgress, cashoutMarkers]);

  // Draw particles
  const drawParticles = useCallback(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);

    particles.forEach((p) => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }, [particles]);

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
            vy: p.vy + 0.2, // gravity
            life: p.life - 0.02,
          }))
          .filter((p) => p.life > 0)
      );
    }, 16);

    return () => clearInterval(interval);
  }, [particles.length]);

  // Redraw canvases
  useEffect(() => {
    drawCurve();
    drawParticles();
  }, [drawCurve, drawParticles, phase, multiplier, takeoffProgress]);

  // Spawn explosion particles - neon casino colors
  const spawnExplosion = (x: number, y: number) => {
    const colors = ["#ff2fb4", "#ff6fd4", "#ffd700", "#ef4444", "#fff"];
    const newParticles: Particle[] = [];

    for (let i = 0; i < 40; i++) {
      const angle = (Math.PI * 2 * i) / 40;
      const speed = 3 + Math.random() * 5;
      newParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
      });
    }
    setParticles(newParticles);
  };

  // Spawn win particles - neon casino colors
  const spawnWinParticles = (x: number, y: number) => {
    const colors = ["#00f0ff", "#ff2fb4", "#ffd700", "#fff", "#ff6fd4"];
    const newParticles: Particle[] = [];

    for (let i = 0; i < 30; i++) {
      newParticles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 8 - 2,
        life: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3,
      });
    }
    setParticles((prev) => [...prev, ...newParticles]);
  };

  const enqueueHistory = (val: number) => {
    setHistory((prev) => {
      const next = [val, ...prev];
      if (next.length > HISTORY_LENGTH) next.pop();
      return next;
    });
  };

  // Generate fake cashout markers for social feel
  const generateFakeCashouts = (crashAt: number) => {
    const markers: CashoutMarker[] = [];
    const names = ["Alpha", "Degen", "Lucky", "Whale", "Ape", "Moon", "Diamond", "Paper"];
    const count = 3 + Math.floor(Math.random() * 4);

    for (let i = 0; i < count; i++) {
      const mult = 1.1 + Math.random() * (crashAt - 1.2);
      if (mult < crashAt && mult > 1) {
        markers.push({
          multiplier: Number(mult.toFixed(2)),
          player: names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 99),
          amount: Number((0.05 + Math.random() * 0.5).toFixed(2)),
        });
      }
    }
    return markers.sort((a, b) => a.multiplier - b.multiplier);
  };

  const startCountdown = useCallback(() => {
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
    setCashoutMarkers([]);
    curvePointsRef.current = [];

    let remaining = COUNTDOWN_SECONDS;
    const tick = () => {
      remaining -= 1;
      setCountdown(remaining);
      tickAudio.currentTime = 0;
      tickAudio.play().catch(() => { });

      if (remaining <= 0) {
        startTakeoff();
      } else {
        roundTimerRef.current = setTimeout(tick, 1000);
      }
    };
    roundTimerRef.current = setTimeout(tick, 1000);
  }, [tickAudio]);

  const startTakeoff = useCallback(() => {
    setPhase("takeoff");
    setTakeoffProgress(0);

    engineAudio.currentTime = 0;
    engineAudio.volume = 0.2;
    engineAudio.play().catch(() => { });

    let progress = 0;
    const animate = () => {
      progress += 0.05;
      setTakeoffProgress(progress);
      engineAudio.volume = Math.min(0.5, 0.2 + progress * 0.3);

      if (progress >= 1) {
        // startFlight is called from update loop or here
        // We will call startFlightAnimation instead
        startFlightAnimation();
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    animationRef.current = requestAnimationFrame(animate);
  }, [engineAudio]);

  const startFlightAnimation = useCallback(() => {
    // Scroll to top
    const container = document.querySelector('.aviator-page');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setPhase("in-flight");
    setMultiplier(1.0);
    setHasCashedOut(false);

    // Use the result from on-chain logic
    const crash = onChainResultRef.current?.crashMultiplier || 1.0;
    setCrashMultiplier(crash);

    // Generate fake cashouts
    const fakeMarkers = generateFakeCashouts(crash);

    flightStartTimeRef.current = performance.now();
    const canvas = curveCanvasRef.current;
    const startX = 80;
    const startY = canvas ? canvas.getBoundingClientRect().height - 80 : 300;

    const step = (now: number) => {
      const elapsed = (now - flightStartTimeRef.current) / 1000;
      const climb = elapsed * 0.4 + Math.pow(elapsed, 1.3) * 0.06;
      const nextMult = Number((1 + climb).toFixed(2));

      setMultiplier((prev) => Math.max(prev, nextMult));

      // Calculate curve position
      const progress = Math.min(0.95, Math.log(nextMult) / Math.log(100));
      const canvasWidth = canvas?.getBoundingClientRect().width || 600;
      const canvasHeight = canvas?.getBoundingClientRect().height || 400;

      const x = startX + progress * (canvasWidth - 150);
      const y = startY - progress * (canvasHeight - 120);

      curvePointsRef.current.push({ x, y });
      if (curvePointsRef.current.length > 500) {
        curvePointsRef.current = curvePointsRef.current.slice(-500);
      }

      // Add cashout markers
      fakeMarkers.forEach((marker) => {
        if (nextMult >= marker.multiplier && !cashoutMarkers.find(m => m.player === marker.player)) {
          setCashoutMarkers((prev) => [...prev, marker]);
        }
      });

      // Check crash - use on-chain crash point
      if (nextMult >= crash) {
        handleCrash(crash);
        return;
      }

      // Check auto cashout (from on-chain commitment)
      const target = onChainResultRef.current?.targetMultiplier || parseFloat(autoCashout);
      if (nextMult >= target && !hasCashedOut && activeBet > 0) {
        // Visualize win
        handleCashout(target, true);
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);
  }, [autoCashout, hasCashedOut, activeBet]);

  // Handle reveal result (user clicks reveal in modal)
  const handleRevealResult = useCallback(async () => {
    if (!pendingTransaction) return;
    
    setRevealPhase("revealing-result");
    
    try {
      const crashMult = await revealCrashMultiplier(pendingTransaction.crashHandle);
      setRevealedCrashMultiplier(crashMult);
      
      // Set to decrypted - modal will auto-close and trigger animation
      setRevealPhase("decrypted");
    } catch (error) {
      console.error("Failed to reveal result:", error);
      setRevealPhase("reveal-result"); // Allow retry
    }
  }, [pendingTransaction, revealCrashMultiplier]);

  // Handle modal close - trigger the flight animation
  const handleRevealModalClose = useCallback(() => {
    // Scroll to top so user can see the animation
    const container = document.querySelector('.aviator-page');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Close modal
    setShowRevealModal(false);
    
    if (revealedCrashMultiplier !== null && pendingTransaction) {
      // Create result object for animation
      const result: AviatorResult = {
        isWin: revealedCrashMultiplier >= pendingTransaction.targetMultiplier,
        crashMultiplier: revealedCrashMultiplier,
        targetMultiplier: pendingTransaction.targetMultiplier,
        payout: 0, // Will be determined by animation
        txSignature: pendingTransaction.txSignature,
        gamePda: pendingTransaction.gamePda,
        payoutHandle: pendingTransaction.payoutHandle,
      };
      
      // Store result for animation
      onChainResultRef.current = result;
      
      // Start Visual Sequence
      playHit();
      startCountdown();
    }
    
    // Reset transaction data
    setPendingTransaction(null);
    setRevealPhase("reveal-result");
    setRevealedCrashMultiplier(null);
  }, [revealedCrashMultiplier, pendingTransaction, playHit, startCountdown]);

  const placeBet = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      navigate("/");
      return;
    }

    const betSize = parseFloat(betInput || "0");
    const target = parseFloat(autoCashout || "2.00");

    if (betSize <= 0 || betSize > effectiveBalance || phase !== "betting") return;
    if (target <= 1.0) {
      alert("Target multiplier must be greater than 1.0");
      return;
    }

    try {
      setActiveBet(betSize);

      // Submit On-Chain transaction (no decryption yet)
      console.log("Submitting aviator transaction...");
      const txResult = await submitAviator(target, betSize);
      console.log("Transaction submitted:", txResult.txSignature);

      setStats((prev) => ({
        ...prev,
        rounds: prev.rounds + 1,
        totalWagered: prev.totalWagered + betSize,
      }));

      // Show reveal modal
      setPendingTransaction(txResult);
      setShowRevealModal(true);
      setRevealPhase("reveal-result");

    } catch (e) {
      console.error("Aviator submission failed", e);
      setActiveBet(0);
      // Revert stats
      setStats((prev) => ({
        ...prev,
        rounds: prev.rounds - 1,
        totalWagered: prev.totalWagered - betSize,
      }));
    }
  };

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

  const handleCrash = (crashMult: number) => {
    setPhase("crashed");
    crashAudio.currentTime = 0;
    crashAudio.play().catch(() => { });

    // Explosion at plane position
    if (planeRef.current) {
      const rect = planeRef.current.getBoundingClientRect();
      const containerRect = curveCanvasRef.current?.getBoundingClientRect();
      if (rect && containerRect) {
        spawnExplosion(rect.left - containerRect.left + 20, rect.top - containerRect.top + 20);
      }
    }

    setStats(prev => ({ ...prev, rounds: prev.rounds + 1 }));
    
    // Check if we didn't cash out -> loss
    if (!hasCashedOut && activeBet > 0) {
      updateLuckProgress(-0.5);
      
      // Set result for claim functionality (loss case - payout is 0)
      if (onChainResultRef.current) {
        setResult({
          ...onChainResultRef.current,
          isWin: false,
          payout: 0,
        });
      }
    }
    
    setActiveBet(0);
  };

  const handleCashout = (mult: number, auto: boolean) => {
    if (hasCashedOut || activeBet === 0) return;

    setHasCashedOut(true);
    const win = activeBet * mult;
    setWinAmount(win);
    setWinMultiplier(mult);
    setUnclaimed(prev => prev + win);

    setShowWinPopup(true);
    setTimeout(() => setShowWinPopup(false), 3000);

    cashoutAudio.currentTime = 0;
    cashoutAudio.play().catch(() => { });

    // Win particles at plane
    if (planeRef.current) {
      const rect = planeRef.current.getBoundingClientRect();
      const containerRect = curveCanvasRef.current?.getBoundingClientRect();
      if (rect && containerRect) {
        spawnWinParticles(rect.left - containerRect.left + 20, rect.top - containerRect.top + 20);
      }
    }

    setStats(prev => ({
      ...prev,
      totalWon: prev.totalWon + win,
      biggestWin: Math.max(prev.biggestWin, win),
      bestMultiplier: Math.max(prev.bestMultiplier, mult),
    }));

    updateLuckProgress(Math.min(2, mult * 0.1));
    
    // Set result for claim functionality
    if (onChainResultRef.current) {
      const payoutLamports = Math.floor(win * 1_000_000_000);
      setResult({
        ...onChainResultRef.current,
        isWin: true,
        payout: payoutLamports,
      });
    }
    
    setActiveBet(0);
  };

  const cashoutNow = () => handleCashout(multiplier, false);

  const claimUnclaimed = () => {
    if (unclaimed <= 0) return;
    setUnclaimed(0);
    playHit();
  };

  const getPlanePosition = () => {
    const canvas = curveCanvasRef.current;
    if (!canvas) return { x: 50, y: 300, angle: -15 };

    const rect = canvas.getBoundingClientRect();
    const height = rect.height;
    const width = rect.width;

    if (phase === "betting" || phase === "countdown") {
      return { x: 40, y: height - 50, angle: 0 };
    }

    if (phase === "takeoff") {
      const x = 40 + takeoffProgress * 80;
      const y = height - 50 - takeoffProgress * 100;
      const angle = -takeoffProgress * 25;
      return { x, y, angle };
    }

    if ((phase === "in-flight" || phase === "crashed") && curvePointsRef.current.length > 0) {
      const lastPoint = curvePointsRef.current[curvePointsRef.current.length - 1];
      let angle = -15;

      if (curvePointsRef.current.length > 5) {
        const prev = curvePointsRef.current[curvePointsRef.current.length - 6];
        angle = Math.atan2(lastPoint.y - prev.y, lastPoint.x - prev.x) * (180 / Math.PI);
      }

      if (phase === "crashed" && !hasCashedOut) {
        angle = 45; // nose dive
      }

      return { x: lastPoint.x, y: lastPoint.y, angle };
    }

    return { x: 80, y: height - 80, angle: -15 };
  };

  const planePos = getPlanePosition();
  const canPlaceBet = phase === "betting" && parseFloat(betInput || "0") > 0 && parseFloat(betInput || "0") <= effectiveBalance;
  const canCashOut = phase === "in-flight" && activeBet > 0 && !hasCashedOut;

  return (
    <div className={`aviator-page ${isMobile ? "mobile" : "desktop"} ${showRevealModal ? 'modal-open' : ''}`}>
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

      {/* Sky Background */}
      <div className="aviator-sky">
        <div className="sky-gradient" />
        <div className="stars-container">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                animationDelay: `${Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
        <div className="city-silhouette" />
      </div>

      {/* Crash Flash */}
      {showCrashFlash && <div className="crash-flash" />}

      {/* Header */}
      <div className="aviator-header">
        <button className="back-btn" onClick={() => navigate("/casino")}>
          ←
        </button>

        <div className="header-center">
          <span className="game-title">✈️ AVIATOR</span>
        </div>

        <div className="header-right">
          <div className="balance-chip">
            <span className="balance-label">Balance</span>
            <span className="balance-value">{(solBalance ?? 0).toFixed(4)} SOL</span>
          </div>
          {/* Claim Button */}
          {lastResult && lastResult.isWin && lastResult.payout > 0 && lastResult.payoutHandle && (
            <button
              className="icon-btn claim-icon-btn"
              onClick={handleOpenClaimModal}
              title="Claim Winnings"
              style={{ background: '#ffd700', color: '#000', width: 'auto', padding: '0 10px', fontSize: '12px' }}
            >
              CLAIM
            </button>
          )}
          <button className={`icon-btn ${showStats ? "active" : ""}`} onClick={() => setShowStats(!showStats)}>📊</button>
          <button className={`icon-btn ${showRules ? "active" : ""}`} onClick={() => setShowRules(!showRules)}>❓</button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="aviator-game">
        {/* Flight Canvas */}
        <div className="flight-container">
          <canvas ref={curveCanvasRef} className="curve-canvas" />
          <canvas ref={particleCanvasRef} className="particle-canvas" />

          {/* Plane */}
          <div
            ref={planeRef}
            className={`plane-element ${phase} ${phase === "crashed" && !hasCashedOut ? "crashing" : ""}`}
            style={{
              left: `${planePos.x}px`,
              top: `${planePos.y}px`,
              transform: `translate(-50%, -50%) rotate(${planePos.angle}deg) scale(${phase === "countdown" ? 1.1 : 1})`,
            }}
          >
            <div className="plane-trail" style={{ opacity: phase === "in-flight" ? 1 : 0 }} />
            <img src="/aviator-aircraft.webp" alt="Plane" className="plane-img" />
            <div className={`engine-glow ${phase === "in-flight" || phase === "takeoff" ? "active" : ""}`} />
          </div>

          {/* Giant Multiplier Display */}
          <div className={`multiplier-container ${phase}`}>
            <div
              className={`multiplier-value ${phase === "crashed" && !hasCashedOut ? "crashed" : ""}`}
              style={{ color: getMultiplierColor(multiplier) }}
            >
              {multiplier.toFixed(2)}x
            </div>

            {phase === "betting" && (
              <div className="multiplier-status">
                <span className="status-text">PLACE YOUR BET</span>
                <span className="status-hint">Waiting for takeoff...</span>
              </div>
            )}

            {phase === "countdown" && (
              <div className="multiplier-status countdown">
                <span className="countdown-number">{countdown}</span>
                <span className="status-text">TAKING OFF</span>
              </div>
            )}

            {phase === "takeoff" && (
              <div className="multiplier-status">
                <span className="status-text">LIFTING OFF...</span>
              </div>
            )}

            {phase === "in-flight" && (
              <div className="multiplier-status flying">
                <span className="status-text">CASH OUT NOW!</span>
              </div>
            )}

            {phase === "crashed" && (
              <div className="multiplier-status crashed">
                <span className="status-text">CRASHED!</span>
                <span className="crash-at">@ {crashMultiplier?.toFixed(2)}x</span>
              </div>
            )}
          </div>

          {/* Win Popup */}
          {showWinPopup && (
            <div className="win-popup">
              <div className="win-text">CASHED OUT!</div>
              <div className="win-amount">+{winAmount.toFixed(4)} SOL</div>
              <div className="win-mult">@ {winMultiplier.toFixed(2)}x</div>
            </div>
          )}
        </div>

        {/* Control Panel */}
        <div className="control-panel">
          <div className="bet-section">
            <div className="bet-group">
              <label>Bet Amount</label>
              <div className="input-row">
                <button
                  className="adjust-btn"
                  onClick={() => setBetInput((prev) => Math.max(0.01, parseFloat(prev) - 0.01).toFixed(4))}
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
                  onClick={() => setBetInput((prev) => Math.min(effectiveBalance, parseFloat(prev) + 0.01).toFixed(4))}
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

            <div className="bet-group">
              <label>Auto Cashout</label>
              <div className="input-row">
                <input
                  type="number"
                  className="bet-input"
                  value={autoCashout}
                  onChange={(e) => setAutoCashout(e.target.value)}
                  step="0.1"
                  min="1.1"
                />
                <span className="input-suffix">x</span>
              </div>
              <div className="quick-bets">
                {[1.5, 2, 3, 5, 10].map((mult) => (
                  <button key={mult} className="quick-btn" onClick={() => setAutoCashout(mult.toFixed(2))}>
                    {mult}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="action-section">
            {phase === "betting" ? (
              <button className="action-btn bet" onClick={placeBet} disabled={!canPlaceBet}>
                <span className="btn-icon">✈️</span>
                <span className="btn-text">PLACE BET</span>
              </button>
            ) : phase === "in-flight" && canCashOut ? (
              <button className="action-btn cashout" onClick={cashoutNow}>
                <span className="btn-icon">💰</span>
                <span className="btn-text">CASH OUT {multiplier.toFixed(2)}x</span>
              </button>
            ) : (
              <button className="action-btn waiting" disabled>
                <span className="btn-text">
                  {phase === "countdown" ? `TAKING OFF IN ${countdown}...` :
                    phase === "takeoff" ? "LIFTING OFF..." :
                      phase === "crashed" ? "NEXT ROUND SOON..." :
                        "WAITING..."}
                </span>
              </button>
            )}

            {unclaimed > 0 && (
              <button className="claim-btn" onClick={claimUnclaimed} disabled={phase === "in-flight"}>
                CLAIM {unclaimed.toFixed(4)} SOL
              </button>
            )}
          </div>
        </div>

        {/* Side Panel */}
        <div className="side-panel">
          <div className="history-section">
            <div className="section-header">
              <span>📜 Crash History</span>
            </div>
            <div className="history-chips">
              {history.length === 0 ? (
                <span className="empty">No rounds yet</span>
              ) : (
                history.map((h, i) => (
                  <span
                    key={i}
                    className={`history-chip ${h < 2 ? "low" : h < 5 ? "medium" : h < 10 ? "high" : "extreme"}`}
                  >
                    {h.toFixed(2)}x
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="stats-section">
            <div className="section-header">
              <span>📈 Your Stats</span>
            </div>
            <div className="stat-row">
              <span>Rounds</span>
              <span>{stats.rounds}</span>
            </div>
            <div className="stat-row">
              <span>Wagered</span>
              <span>{stats.totalWagered.toFixed(4)} SOL</span>
            </div>
            <div className="stat-row">
              <span>Won</span>
              <span className="gold">{stats.totalWon.toFixed(4)} SOL</span>
            </div>
            <div className="stat-row">
              <span>Best</span>
              <span className="green">{stats.bestMultiplier.toFixed(2)}x</span>
            </div>
          </div>

          {cashoutMarkers.length > 0 && (
            <div className="cashouts-section">
              <div className="section-header">
                <span>💸 Live Cashouts</span>
              </div>
              {cashoutMarkers.slice(-5).map((m, i) => (
                <div key={i} className="cashout-row">
                  <span className="player">{m.player}</span>
                  <span className="mult">{m.multiplier.toFixed(2)}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>📊 Statistics</h2>
            <div className="modal-stats">
              <div className="modal-stat">
                <span>Total Rounds</span>
                <span>{stats.rounds}</span>
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
                <span>Best Multiplier</span>
                <span className="green">{stats.bestMultiplier.toFixed(2)}x</span>
              </div>
              <div className="modal-stat">
                <span>Biggest Win</span>
                <span className="gold">{stats.biggestWin.toFixed(4)} SOL</span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowStats(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>❓ How to Play</h2>
            <ul className="rules-list">
              <li>Place your bet before the plane takes off</li>
              <li>Watch the multiplier increase as the plane climbs</li>
              <li>Cash out anytime to win: Bet × Multiplier</li>
              <li>If the plane crashes before you cash out, you lose</li>
              <li>Set Auto Cashout to automatically secure profits</li>
              <li>Higher risk = Higher reward!</li>
            </ul>
            <button className="modal-close" onClick={() => setShowRules(false)}>Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Aviator;
