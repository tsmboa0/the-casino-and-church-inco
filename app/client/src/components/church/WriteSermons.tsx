import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/use-is-mobile";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import { useSolBalance } from "../../hooks/useSolBalance";
import "../../styles/write-sermons.css";

interface SermonTopic {
  id: string;
  title: string;
  description: string;
  cost: number;
  faithReward: number;
  emoji: string;
}

const sermonTopics: SermonTopic[] = [
  {
    id: "defi-fundamentals",
    title: "DeFi Fundamentals",
    description: "Write about decentralized finance basics, protocols, and yield farming",
    cost: 50,
    faithReward: 3.5,
    emoji: "🏦"
  },
  {
    id: "nft-ecosystem",
    title: "NFT Ecosystem",
    description: "Explore the world of non-fungible tokens and digital ownership",
    cost: 75,
    faithReward: 4.2,
    emoji: "🖼️"
  },
  {
    id: "blockchain-governance",
    title: "Blockchain Governance",
    description: "Discuss DAOs, voting mechanisms, and decentralized decision-making",
    cost: 100,
    faithReward: 5.0,
    emoji: "🗳️"
  },
  {
    id: "crypto-security",
    title: "Crypto Security",
    description: "Write about wallet security, smart contract audits, and best practices",
    cost: 60,
    faithReward: 3.8,
    emoji: "🔒"
  },
  {
    id: "web3-future",
    title: "Web3 Future",
    description: "Explore the future of the internet and decentralized applications",
    cost: 80,
    faithReward: 4.5,
    emoji: "🌐"
  },
  {
    id: "tokenomics",
    title: "Tokenomics",
    description: "Analyze token economics, supply mechanics, and value accrual",
    cost: 90,
    faithReward: 4.8,
    emoji: "📊"
  },
  {
    id: "layer2-solutions",
    title: "Layer 2 Solutions",
    description: "Discuss scaling solutions, rollups, and blockchain performance",
    cost: 70,
    faithReward: 4.0,
    emoji: "⚡"
  },
  {
    id: "crypto-regulation",
    title: "Crypto Regulation",
    description: "Explore regulatory frameworks and compliance in the crypto space",
    cost: 85,
    faithReward: 4.3,
    emoji: "⚖️"
  }
];

const WriteSermons: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { playHit, playSuccess } = useAudio();
  const { casinoBalance, updateCasinoBalance, updateFaithProgress } = useProgress();
  const { balance: cncBalance } = useSolBalance();

  const [selectedTopic, setSelectedTopic] = useState<SermonTopic | null>(null);
  const [articleLink, setArticleLink] = useState("");
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    message: string;
    faithGained: number;
    coinsSpent: number;
  } | null>(null);

  const handleTopicSelect = (topic: SermonTopic) => {
    playHit();
    setSelectedTopic(topic);
    setArticleLink("");
  };

  const handleBackToChurch = () => {
    playHit();
    navigate('/church');
  };

  const handleSubmitSermon = () => {
    if (!selectedTopic || !articleLink.trim()) {
      alert("Please select a topic and provide an article link.");
      return;
    }

    if ((cncBalance ?? casinoBalance) < selectedTopic.cost) {
      alert("You don't have enough coins to submit this sermon. Visit the casino to earn more coins!");
      return;
    }

    // Validate URL format
    try {
      new URL(articleLink);
    } catch {
      alert("Please enter a valid URL for your article.");
      return;
    }

    // Process submission
    updateCasinoBalance(-selectedTopic.cost);
    updateFaithProgress(selectedTopic.faithReward);

    setSubmissionResult({
      success: true,
      message: `Your sermon on "${selectedTopic.title}" has been submitted successfully!`,
      faithGained: selectedTopic.faithReward,
      coinsSpent: selectedTopic.cost
    });

    setShowSubmissionModal(true);
    playSuccess();

    // Reset form
    setSelectedTopic(null);
    setArticleLink("");
  };

  const closeSubmissionModal = () => {
    setShowSubmissionModal(false);
    setSubmissionResult(null);
  };

  return (
    <div className={`write-sermons-container ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Background */}
      <div className="sermons-background">
        <img src="/scenes/church_scene.png" alt="Church Background" />
      </div>

      {/* Header */}
      <div className="sermons-header">
        <button className="back-button" onClick={handleBackToChurch}>
          <span className="back-icon">←</span>
          <span className="back-text">Back to Church</span>
        </button>
        <h1 className="page-title">📖 Write Sermons</h1>
        <div className="balance-display">
          <span className="balance-label">Coins:</span>
          <span className="balance-value">🎰 {(cncBalance ?? casinoBalance).toFixed(2)}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="sermons-content">
        {/* Topic Selection */}
        <div className="topics-section">
          <h2 className="section-title">Choose Your Topic</h2>
          <div className="topics-grid">
            {sermonTopics.map((topic) => (
              <button
                key={topic.id}
                className={`topic-card ${selectedTopic?.id === topic.id ? 'selected' : ''}`}
                onClick={() => handleTopicSelect(topic)}
              >
                <div className="topic-emoji">{topic.emoji}</div>
                <div className="topic-content">
                  <h3 className="topic-title">{topic.title}</h3>
                  <p className="topic-description">{topic.description}</p>
                  <div className="topic-cost">
                    <span className="cost-amount">🎰 {topic.cost}</span>
                    <span className="faith-reward">+{topic.faithReward} FAITH</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Article Submission */}
        {selectedTopic && (
          <div className="submission-section">
            <h2 className="section-title">Submit Your Article</h2>
            <div className="submission-card">
              <div className="selected-topic-info">
                <span className="topic-emoji">{selectedTopic.emoji}</span>
                <div className="topic-details">
                  <h3 className="topic-title">{selectedTopic.title}</h3>
                  <p className="topic-description">{selectedTopic.description}</p>
                </div>
              </div>
              
              <div className="submission-form">
                <label className="form-label">Article Link:</label>
                <input
                  type="url"
                  value={articleLink}
                  onChange={(e) => setArticleLink(e.target.value)}
                  placeholder="https://your-article-url.com"
                  className="article-input"
                />
                
                <div className="submission-summary">
                  <div className="summary-item">
                    <span className="summary-label">Cost:</span>
                    <span className="summary-value cost">🎰 {selectedTopic.cost}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Faith Gain:</span>
                    <span className="summary-value faith">+{selectedTopic.faithReward}</span>
                  </div>
                </div>
                
                <button
                  className="submit-button"
                  onClick={handleSubmitSermon}
                  disabled={!articleLink.trim() || (cncBalance ?? casinoBalance) < selectedTopic.cost}
                >
                  Submit Sermon
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission Result Modal */}
      {showSubmissionModal && submissionResult && (
        <div className="submission-modal-overlay" onClick={closeSubmissionModal}>
          <div className="submission-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="success-icon">✅</div>
              <h2 className="modal-title">Sermon Submitted!</h2>
            </div>
            <div className="modal-content">
              <p className="modal-message">{submissionResult.message}</p>
              <div className="reward-display">
                <div className="reward-item">
                  <span className="reward-label">Faith Gained:</span>
                  <span className="reward-value">+{submissionResult.faithGained}</span>
                </div>
                <div className="reward-item">
                  <span className="reward-label">Coins Spent:</span>
                  <span className="reward-value cost">-{submissionResult.coinsSpent}</span>
                </div>
              </div>
            </div>
            <button className="modal-close" onClick={closeSubmissionModal}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WriteSermons; 