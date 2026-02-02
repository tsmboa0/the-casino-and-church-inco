import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { requestSolTransferSignature } from "../../lib/wallet/sol";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import "../../styles/memecoin-simulator.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Type definitions
interface Order {
  id: number;
  timestamp: string;
  type: 'BUY' | 'SELL';
  amount: number;
  price: number;
  total: number;
}

interface ResultData {
  reason: 'crash' | 'sold' | 'liquidation';
  finalPercent: number;
  totalValue: number;
  profitLoss: number;
}

// Line chart uses a simple numeric price series

const MemecoinSimulator: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { stopBackgroundMusic, playHit, playSuccess } = useAudio();
  
  // Progress system integration
  const { 
    updateLuckProgress 
  } = useProgress();
  const { balance: solBalance } = useSolBalance();
  const [cashSim, setCashSim] = useState<number>(0);
  const { connection } = useConnection();
  const wallet = useWallet();

  // Game state
  const [holdings, setHoldings] = useState<number>(0); // Start with 0 holdings
  const [currentPrice, setCurrentPrice] = useState<number>(1.00);
  const [previousPrice, setPreviousPrice] = useState<number>(1.00);
  const [tradeAmount, setTradeAmount] = useState<string>("");
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [gameEnded, setGameEnded] = useState<boolean>(false);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [showClaimModal, setShowClaimModal] = useState<boolean>(false);
  const [resultData, setResultData] = useState<ResultData>({
    reason: 'crash',
    finalPercent: 0,
    totalValue: 0,
    profitLoss: 0,
  });
  const [isTransitioning, setIsTransitioning] = useState<boolean>(true);
  const [simulationStarted, setSimulationStarted] = useState<boolean>(false);
  const [initialSolSnapshot, setInitialSolSnapshot] = useState<number | null>(null);

  // Line chart prices buffer and smooth target
  const [prices, setPrices] = useState<number[]>([]);
  const [targetPrice, setTargetPrice] = useState<number>(1.0);

  // Audio refs
  const [crashAudio] = useState<HTMLAudioElement>(() => new Audio('/sounds/casino_lost_sound.wav'));
  const [pumpAudio] = useState<HTMLAudioElement>(() => new Audio('/sounds/casino_win_sound.wav'));
  const [tradeAudio] = useState<HTMLAudioElement>(() => new Audio('/sounds/hit.mp3'));

  useEffect(() => {
    crashAudio.volume = 0.8;
    pumpAudio.volume = 0.8;
    tradeAudio.volume = 0.6;
    stopBackgroundMusic();
    
    // Start transition
    setTimeout(() => setIsTransitioning(false), 1000);

    return () => {
      crashAudio.pause();
      crashAudio.currentTime = 0;
      pumpAudio.pause();
      pumpAudio.currentTime = 0;
      tradeAudio.pause();
      tradeAudio.currentTime = 0;
    };
  }, [crashAudio, pumpAudio, tradeAudio, stopBackgroundMusic]);

  // Initialize or resync simulated cash from SOL balance before simulation starts
  useEffect(() => {
    if (!simulationStarted) {
      setCashSim(solBalance ?? 0);
    }
  }, [solBalance, simulationStarted]);

  // Calculate P/L
  const totalValue = cashSim + (holdings * currentPrice);
  const initialValue = 1000; // $1000 starting balance
  const profitLoss = totalValue - initialValue;
  const profitLossPercent = ((profitLoss / initialValue) * 100);

  // baseline 1.0 and price generator retained

  // Generate new price with volatility - More dramatic for fast-paced trading
  const generateNewPrice = (currentPrice: number): number => {
    const random = Math.random();
    
    // 15% chance for pump (50% to 300% increase) - More dramatic pumps
    if (random < 0.15) {
      const pumpPercent = 50 + Math.random() * 250; // 50% to 300%
      return currentPrice * (1 + pumpPercent / 100);
    }
    
    // 15% chance for dump (50% to 100% decrease) - More dramatic dumps
    if (random < 0.30) {
      const dumpPercent = 50 + Math.random() * 50; // 50% to 100%
      const newPrice = currentPrice * (1 - dumpPercent / 100);
      return Math.max(newPrice, 0.01); // Don't go below $0.01
    }
    
    // 70% chance for normal movement (-20% to +20%) - More volatile normal movement
    const normalChange = (Math.random() - 0.5) * 0.4; // -20% to +20%
    const newPrice = currentPrice * (1 + normalChange);
    return Math.max(newPrice, 0.01);
  };

  // Update line chart prices buffer
  const pushPrice = (p: number) => {
    setPrices(prev => {
      const next = [...prev, p];
      const MAX = 200;
      if (next.length > MAX) next.shift();
      return next;
    });
  };

  // Smooth price target picker (every ~2.4s pick a new target)
  useEffect(() => {
    if (!simulationStarted || gameEnded || isTransitioning) return;
    const picker = setInterval(() => {
      const base = prices.length > 0 ? prices[prices.length - 1] : currentPrice;
      setTargetPrice(generateNewPrice(base));
    }, 2400);
    return () => clearInterval(picker);
  }, [simulationStarted, gameEnded, isTransitioning, prices.length, currentPrice]);

  // Smooth movement toward target (300ms)
  useEffect(() => {
    if (!simulationStarted || gameEnded || isTransitioning) return;
    const stepper = setInterval(() => {
      const last = prices.length > 0 ? prices[prices.length - 1] : currentPrice;
      // Move 10% toward target with smaller noise for smoother motion
      const drift = (targetPrice - last) * 0.10;
      const noise = (Math.random() - 0.5) * 0.002; // ±0.2%
      let next = Math.max(0.01, last + drift + noise);
      setPreviousPrice(last);
      setCurrentPrice(next);
      pushPrice(next);

      // Ending conditions
      if (next <= 0.01) {
        endGame('crash', -100);
      } else if (cashSim <= 0 && holdings <= 0) {
        endGame('liquidation', profitLossPercent);
      }
    }, 300);
    return () => clearInterval(stepper);
  }, [simulationStarted, gameEnded, isTransitioning, targetPrice, prices.length, currentPrice, cashSim, holdings, profitLossPercent]);

  // End game function
  const endGame = (reason: 'crash' | 'sold' | 'liquidation', finalPercent: number): void => {
    setGameEnded(true);
    
    if (reason === 'crash') {
      crashAudio.play().catch(console.log);
      // Decrease luck when crashing
      updateLuckProgress(-3.5);
    } else if (finalPercent > 0) {
      pumpAudio.play().catch(console.log);
      // Increase luck when profiting
      updateLuckProgress(4.2);
    } else {
      // Small luck decrease for breaking even or small loss
      updateLuckProgress(-0.5);
    }

    setResultData({
      reason,
      finalPercent: Math.round(finalPercent * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      profitLoss: Math.round(profitLoss * 100) / 100,
    });
    
    setTimeout(() => setShowResultModal(true), 1000);
  };

  // Trading functions
  const handleBuy = async (): Promise<void> => {
    if (gameEnded) return;
    
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) return;
    
    const cost = amount * currentPrice;
    if (cost > cashSim) return;

    // Require signature approval before starting or executing the buy
    try {
      if (wallet.publicKey && wallet.signTransaction) {
        await requestSolTransferSignature({ connection, wallet: wallet as any, actuallySend: false });
      }
    } catch {
      return; // user rejected; do not start
    }

    setCashSim(prev => Math.max(0, prev - cost));
    setHoldings(prev => prev + amount);
    setTradeAmount("");
    
    // Start simulation on first buy
    if (!simulationStarted) {
      setSimulationStarted(true);
      setInitialSolSnapshot(cashSim - cost);
      // seed line with current price
      setPrices([currentPrice]);
    }
    
    // Add to order history
    const order: Order = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'BUY',
      amount: amount,
      price: currentPrice,
      total: cost,
    };
    setOrderHistory(prev => [order, ...prev.slice(0, 9)]); // Keep last 10 orders
    
    tradeAudio.play().catch(console.log);
    playHit();
  };

  const handleSell = (): void => {
    if (gameEnded) return;
    
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) return;
    
    if (amount > holdings) return;

    const revenue = amount * currentPrice;
    setCashSim(prev => prev + revenue);
    setHoldings(prev => prev - amount);
    setTradeAmount("");
    
    // Add to order history
    const order: Order = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type: 'SELL',
      amount: amount,
      price: currentPrice,
      total: revenue,
    };
    setOrderHistory(prev => [order, ...prev.slice(0, 9)]); // Keep last 10 orders
    
    tradeAudio.play().catch(console.log);
    playHit();
    
    // End game on sell
    endGame('sold', profitLossPercent);
  };

  // Derived claimable rewards in SOL after game ended (demo-only)
  const claimableRewards = (() => {
    if (!gameEnded || initialSolSnapshot === null) return 0;
    const delta = cashSim - initialSolSnapshot;
    return delta > 0 ? delta : 0;
  })();

  const handleBackToCasino = (): void => {
    playHit();
    navigate('/casino');
  };

  // Custom candlestick chart component
  const LineChart: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the end when new candles are added
    useEffect(() => {
      if (containerRef.current && simulationStarted) {
        containerRef.current.scrollLeft = containerRef.current.scrollWidth;
      }
    }, [prices.length, simulationStarted]);

    if (!simulationStarted) {
      return (
        <div className="chart-placeholder">
                  <div className="start-trading-text">
          <div className="trading-prompt">🚀</div>
          <div className="trading-prompt">Click BUY to Start Trading!</div>
          <div className="trading-subtitle">Enter an amount and click BUY to begin the memecoin simulation</div>
          <div className="trading-warning">⚠️ Fast-paced trading - Act quickly to lock profits!</div>
        </div>
        </div>
      );
    }
    // Prepare Line chart data
    const labels = prices.map((_, i) => i.toString());
    const minVal = Math.min(1, ...prices);
    const maxVal = Math.max(1, ...prices);
    const pad = (maxVal - minVal) * 0.1 || 0.05;
    const data = {
      labels,
      datasets: [
        {
          label: 'Price',
          data: prices,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.25,
          segment: {
            borderColor: (ctx: any) => (ctx.p1?.parsed?.y ?? 1) >= 1 ? '#00ff66' : '#ff4d4d',
          },
        },
        {
          label: 'Baseline',
          data: prices.map(() => 1),
          borderColor: '#666',
          borderWidth: 1,
          pointRadius: 0,
        },
      ],
    };
    const options: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: false } },
      animation: { duration: 300, easing: 'linear' },
      elements: { line: { tension: 0.4 } },
      interaction: { intersect: false, mode: 'nearest' },
      scales: {
        x: { display: false, grid: { display: false } },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          min: minVal - pad,
          max: maxVal + pad,
        },
      },
    };

    return (
      <div className="candlestick-chart">
        <div className="chart-header">
          <div className="volume-display">
            <span className="volume-label">Baseline</span>
            <span className="volume-value">$1.00</span>
          </div>
          <button className="volume-button">^</button>
        </div>
        <div className="candlesticks-container" ref={containerRef}>
          <div style={{ height: 300 }}>
            <Line data={data} options={options} />
          </div>
        </div>
        <div className="chart-grid">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid-line" style={{ bottom: `${i * 20}%` }} />
          ))}
        </div>
      </div>
    );
  };

  if (isTransitioning) {
    return (
      <div className="memecoin-transition-screen">
        <div className="memecoin-transition-text">Loading Memecoin Simulator...</div>
      </div>
    );
  }

  return (
    <div className="memecoin-simulator-container">
      {/* Background */}
      <div className="memecoin-background">
        <img src="/scenes/casino_scene.png" alt="Casino Background" />
      </div>

      {/* Header */}
      <div className="memecoin-header">
        <button className="back-btn" onClick={handleBackToCasino}>
          ←
        </button>
        <h1 className="game-title">🚀 Memecoin Simulator</h1>
      </div>

      {/* Main Content */}
      <div className="memecoin-content">
        {/* Left Panel - Chart */}
        <div className="chart-panel">
          <LineChart />
        </div>

        {/* Right Panel - Trading Interface */}
        <div className="trading-panel">
          {/* Price Display */}
          <div className="price-display">
            <div className="current-price">
              <span className="price-label">Current Price:</span>
              <span className={`price-value ${currentPrice >= previousPrice ? 'positive' : 'negative'}`}>
                ${currentPrice.toFixed(4)}
              </span>
            </div>
            <div className="price-change">
              <span className={`change-value ${currentPrice >= previousPrice ? 'positive' : 'negative'}`}>
                {currentPrice >= previousPrice ? '+' : ''}{((currentPrice - previousPrice) / previousPrice * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Account Info */}
          <div className="account-info">
            <div className="info-row">
              <span className="info-label">Balance:</span>
              <span className="info-value">{cashSim.toFixed(4)} SOL</span>
            </div>
            <div className="info-row">
              <span className="info-label">Holdings:</span>
              <span className="info-value">{holdings.toFixed(2)} coins</span>
            </div>
            <div className="info-row">
              <span className="info-label">Total Value:</span>
              <span className="info-value">${totalValue.toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className={`info-label ${profitLoss >= 0 ? 'positive' : 'negative'}`}>P/L:</span>
              <span className={`info-value ${profitLoss >= 0 ? 'positive' : 'negative'}`}>
                {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)} ({profitLossPercent >= 0 ? '+' : ''}{profitLossPercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Trading Controls */}
          <div className="trading-controls">
            <div className="trade-input-group">
              <input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder="Amount"
                className="trade-input"
                disabled={gameEnded}
              />
              {(() => {
                const amt = parseFloat(tradeAmount || '0');
                const cost = amt * currentPrice;
                const zeroBal = cashSim <= 0;
                const tooMuch = amt > 0 && cost > cashSim;
                const show = zeroBal || tooMuch;
                const msg = zeroBal
                  ? 'Insufficient SOL. Deposit SOL to trade.'
                  : tooMuch
                    ? 'Amount exceeds your SOL balance.'
                    : '';
                return show ? (
                  <div className="validation-hint" aria-live="polite" style={{ marginTop: 6, color: '#ff7b7b', fontSize: '12px' }}>
                    {msg}
                  </div>
                ) : null;
              })()}
            </div>
            <div className="trade-buttons">
              <button
                className="buy-button"
                onClick={handleBuy}
                disabled={(() => {
                  const amt = parseFloat(tradeAmount || '0');
                  const cost = amt * currentPrice;
                  return (
                    gameEnded ||
                    !tradeAmount ||
                    amt <= 0 ||
                    cashSim <= 0 ||
                    cost > cashSim
                  );
                })()}
                title={(() => {
                  const amt = parseFloat(tradeAmount || '0');
                  const cost = amt * currentPrice;
                  if (cashSim <= 0) return 'Insufficient SOL. Deposit SOL to trade.';
                  if (!tradeAmount || amt <= 0) return 'Enter a valid amount to buy.';
                  if (cost > cashSim) return 'Amount exceeds your SOL balance.';
                  return 'Execute buy order';
                })()}
              >
                BUY
              </button>
              <button
                className="sell-button"
                onClick={handleSell}
                disabled={gameEnded || !tradeAmount || parseFloat(tradeAmount) <= 0 || !simulationStarted}
              >
                SELL
              </button>
              <button
                className="sell-button"
                onClick={() => setShowClaimModal(true)}
                disabled={!gameEnded || claimableRewards <= 0}
              >
                CLAIM REWARDS
              </button>
            </div>
          </div>

          {/* Order History */}
          <div className="order-history">
            <h3 className="history-title">Order History</h3>
            <div className="history-table">
              <div className="history-header">
                <span>Time</span>
                <span>Type</span>
                <span>Amount</span>
                <span>Price</span>
              </div>
              {orderHistory.map((order) => (
                <div key={order.id} className={`history-row ${order.type.toLowerCase()}`}>
                  <span>{order.timestamp}</span>
                  <span className={order.type.toLowerCase()}>{order.type}</span>
                  <span>{order.amount.toFixed(2)}</span>
                  <span>${order.price.toFixed(4)}</span>
                </div>
              ))}
              {orderHistory.length === 0 && (
                <div className="no-orders">No orders yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Result Modal */}
      {showResultModal && (
        <div className="result-modal-overlay">
          <div className="result-modal">
            <h2 className="result-title">
              {resultData.reason === 'crash' ? '💥 CRASH!' : 
               resultData.reason === 'sold' ? '💰 SOLD!' : '💸 LIQUIDATED!'}
            </h2>
            <div className="result-content">
              <p className="result-message">
                {resultData.reason === 'crash' ? 'The memecoin crashed 100%!' :
                 resultData.reason === 'sold' ? 'You sold your position!' :
                 'You were liquidated!'}
              </p>
              <div className="result-stats">
                <div className="stat-row">
                  <span>Final P/L:</span>
                  <span className={resultData.finalPercent >= 0 ? 'positive' : 'negative'}>
                    {resultData.finalPercent >= 0 ? '+' : ''}{resultData.finalPercent}%
                  </span>
                </div>
                <div className="stat-row">
                  <span>Total Value:</span>
                  <span>${resultData.totalValue}</span>
                </div>
                <div className="stat-row">
                  <span>Profit/Loss:</span>
                  <span className={resultData.profitLoss >= 0 ? 'positive' : 'negative'}>
                    {resultData.profitLoss >= 0 ? '+' : ''}${resultData.profitLoss}
                  </span>
                </div>
              </div>
            </div>
            <div className="result-actions">
              <button className="play-again-button" onClick={() => window.location.reload()}>
                Play Again
              </button>
              <button className="back-to-casino-button" onClick={handleBackToCasino}>
                Back to Casino
              </button>
            </div>
          </div>
        </div>
      )}
      {showClaimModal && (
        <div className="result-modal-overlay" onClick={() => setShowClaimModal(false)}>
          <div className="result-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="result-title">Claimable Rewards</h2>
            <div className="result-content">
              <p className="result-message">
                {claimableRewards > 0 ? `${claimableRewards.toFixed(4)} SOL available to claim (demo).` : 'No rewards available.'}
              </p>
            </div>
            <div className="result-actions">
              <button className="back-to-casino-button" onClick={() => setShowClaimModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemecoinSimulator; 