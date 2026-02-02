import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import "../../styles/prophecy-quests.css";

interface Quest {
  id: string;
  title: string;
  description: string;
  brand: string;
  brandLogo: string;
  cost: number;
  faithReward: number;
  emoji: string;
  task: string;
  verificationHint: string;
}

const quests: Quest[] = [
  {
    id: "airbillspay-airtime",
    title: "Digital Airtime Purchase",
    description: "Buy airtime using stablecoins through Airbillspay",
    brand: "Airbillspay",
    brandLogo: "/brands/airbillspay.jpg",
    cost: 40,
    faithReward: 3.0,
    emoji: "📱",
    task: "Purchase airtime worth at least $5 using USDT or USDC",
    verificationHint: "Upload screenshot of successful airtime purchase"
  },
  {
    id: "airbillspay-utilities",
    title: "Utility Bill Payment",
    description: "Pay for electricity, water, or internet using crypto",
    brand: "Airbillspay",
    brandLogo: "/brands/airbillspay.jpg",
    cost: 60,
    faithReward: 4.5,
    emoji: "⚡",
    task: "Pay any utility bill using stablecoins on Airbillspay",
    verificationHint: "Upload screenshot of utility payment confirmation"
  },
  {
    id: "airbillspay-tickets",
    title: "Event Ticket Purchase",
    description: "Buy movie or event tickets with cryptocurrency",
    brand: "Airbillspay",
    brandLogo: "/brands/airbillspay.jpg",
    cost: 50,
    faithReward: 3.8,
    emoji: "🎫",
    task: "Purchase any event ticket using crypto on Airbillspay",
    verificationHint: "Upload screenshot of ticket purchase confirmation"
  },
  {
    id: "pajcash-offramp",
    title: "Crypto to Naira Off-Ramp",
    description: "Convert your crypto to Nigerian Naira instantly",
    brand: "PajCash",
    brandLogo: "/brands/pajcash.jpg",
    cost: 80,
    faithReward: 5.2,
    emoji: "💱",
    task: "Off-ramp at least $10 worth of crypto to Naira",
    verificationHint: "Upload screenshot of successful off-ramp transaction"
  },
  {
    id: "nectarfi-savings",
    title: "Stablecoin Savings",
    description: "Start saving and earning with stablecoins",
    brand: "Nectarfi",
    brandLogo: "/brands/nectarfi.jpg",
    cost: 70,
    faithReward: 4.8,
    emoji: "💰",
    task: "Deposit at least $20 in stablecoins to start earning",
    verificationHint: "Upload screenshot of savings account with deposit"
  },
  {
    id: "nectarfi-earnings",
    title: "Earn from Savings",
    description: "Earn interest on your stablecoin savings",
    brand: "Nectarfi",
    brandLogo: "/brands/nectarfi.jpg",
    cost: 90,
    faithReward: 6.0,
    emoji: "📈",
    task: "Earn at least $1 in interest from your savings",
    verificationHint: "Upload screenshot showing earned interest"
  },
  {
    id: "jupiter-wallet",
    title: "Jupiter Wallet Setup",
    description: "Create and configure your Jupiter wallet",
    brand: "Jupiter",
    brandLogo: "/brands/jupiter.jpg",
    cost: 30,
    faithReward: 2.5,
    emoji: "🔐",
    task: "Set up Jupiter wallet and add some tokens",
    verificationHint: "Upload screenshot of wallet with token balance"
  },
  {
    id: "jupiter-swap",
    title: "Jupiter Token Swap",
    description: "Perform a token swap using Jupiter aggregator",
    brand: "Jupiter",
    brandLogo: "/brands/jupiter.jpg",
    cost: 45,
    faithReward: 3.2,
    emoji: "🔄",
    task: "Swap tokens worth at least $5 using Jupiter",
    verificationHint: "Upload screenshot of successful swap transaction"
  }
];

const ProphecyQuests: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { playHit, playSuccess } = useAudio();
  const { casinoBalance, updateCasinoBalance, updateFaithProgress } = useProgress();
  const { balance: cncBalance } = useSolBalance();

  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [verificationProof, setVerificationProof] = useState("");
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean;
    message: string;
    faithGained: number;
    coinsSpent: number;
  } | null>(null);

  const handleQuestSelect = (quest: Quest) => {
    playHit();
    setSelectedQuest(quest);
    setVerificationProof("");
  };

  const handleBackToChurch = () => {
    playHit();
    navigate('/church');
  };

  const handleVerifyQuest = () => {
    if (!selectedQuest || !verificationProof.trim()) {
      alert("Please select a quest and provide verification proof.");
      return;
    }

    if ((cncBalance ?? casinoBalance) < selectedQuest.cost) {
      alert("You don't have enough coins to verify this quest. Visit the casino to earn more coins!");
      return;
    }

    // Process quest verification
    updateCasinoBalance(-selectedQuest.cost);
    updateFaithProgress(selectedQuest.faithReward);

    setVerificationResult({
      success: true,
      message: `Quest "${selectedQuest.title}" has been verified successfully!`,
      faithGained: selectedQuest.faithReward,
      coinsSpent: selectedQuest.cost
    });

    setShowVerificationModal(true);
    playSuccess();

    // Reset form
    setSelectedQuest(null);
    setVerificationProof("");
  };

  const closeVerificationModal = () => {
    setShowVerificationModal(false);
    setVerificationResult(null);
  };

  return (
    <div className={`prophecy-quests-container ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Background */}
      <div className="quests-background">
        <img src="/scenes/church_scene.png" alt="Church Background" />
      </div>

      {/* Header */}
      <div className="quests-header">
        <button className="back-button" onClick={handleBackToChurch}>
          <span className="back-icon">←</span>
          <span className="back-text">Back to Church</span>
        </button>
        <h1 className="page-title">🔮 Prophecy Quests</h1>
        <div className="balance-display">
          <span className="balance-label">Coins:</span>
          <span className="balance-value">🎰 {(cncBalance ?? casinoBalance).toFixed(2)}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="quests-content">
        {/* Quest Selection */}
        <div className="quests-section">
          <h2 className="section-title">Choose Your Quest</h2>
          <div className="quests-grid">
            {quests.map((quest) => (
              <button
                key={quest.id}
                className={`quest-card ${selectedQuest?.id === quest.id ? 'selected' : ''}`}
                onClick={() => handleQuestSelect(quest)}
              >
                <div className="quest-header">
                  <div className="quest-emoji">{quest.emoji}</div>
                  <div className="brand-logo">
                    <img src={quest.brandLogo} alt={quest.brand} />
                  </div>
                </div>
                <div className="quest-content">
                  <h3 className="quest-title">{quest.title}</h3>
                  <p className="quest-description">{quest.description}</p>
                  <div className="quest-brand">{quest.brand}</div>
                  <div className="quest-task">
                    <strong>Task:</strong> {quest.task}
                  </div>
                  <div className="quest-cost">
                    <span className="cost-amount">🎰 {quest.cost}</span>
                    <span className="faith-reward">+{quest.faithReward} FAITH</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quest Verification */}
        {selectedQuest && (
          <div className="verification-section">
            <h2 className="section-title">Verify Your Quest</h2>
            <div className="verification-card">
              <div className="selected-quest-info">
                <div className="quest-header">
                  <div className="quest-emoji">{selectedQuest.emoji}</div>
                  <div className="brand-logo">
                    <img src={selectedQuest.brandLogo} alt={selectedQuest.brand} />
                  </div>
                </div>
                <div className="quest-details">
                  <h3 className="quest-title">{selectedQuest.title}</h3>
                  <p className="quest-description">{selectedQuest.description}</p>
                  <div className="quest-brand">{selectedQuest.brand}</div>
                  <div className="quest-task">
                    <strong>Task:</strong> {selectedQuest.task}
                  </div>
                </div>
              </div>
              
              <div className="verification-form">
                <label className="form-label">Verification Proof:</label>
                <textarea
                  value={verificationProof}
                  onChange={(e) => setVerificationProof(e.target.value)}
                  placeholder="Describe how you completed the task or paste a link to proof..."
                  className="verification-input"
                  rows={4}
                />
                <div className="verification-hint">
                  <strong>Hint:</strong> {selectedQuest.verificationHint}
                </div>
                
                <div className="verification-summary">
                  <div className="summary-item">
                    <span className="summary-label">Cost:</span>
                    <span className="summary-value cost">🎰 {selectedQuest.cost}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Faith Gain:</span>
                    <span className="summary-value faith">+{selectedQuest.faithReward}</span>
                  </div>
                </div>
                
                <button
                  className="verify-button"
                  onClick={handleVerifyQuest}
                  disabled={!verificationProof.trim() || (cncBalance ?? casinoBalance) < selectedQuest.cost}
                >
                  Verify Quest
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Verification Result Modal */}
      {showVerificationModal && verificationResult && (
        <div className="verification-modal-overlay" onClick={closeVerificationModal}>
          <div className="verification-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="success-icon">✅</div>
              <h2 className="modal-title">Quest Verified!</h2>
            </div>
            <div className="modal-content">
              <p className="modal-message">{verificationResult.message}</p>
              <div className="reward-display">
                <div className="reward-item">
                  <span className="reward-label">Faith Gained:</span>
                  <span className="reward-value">+{verificationResult.faithGained}</span>
                </div>
                <div className="reward-item">
                  <span className="reward-label">Coins Spent:</span>
                  <span className="reward-value cost">-{verificationResult.coinsSpent}</span>
                </div>
              </div>
            </div>
            <button className="modal-close" onClick={closeVerificationModal}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProphecyQuests; 