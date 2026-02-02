import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudio } from "../../lib/stores/useAudio";
import { useProgress } from "../../lib/stores/useProgress";
import "../../styles/quest-page.css";

type QuestContent = {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  steps: string[];
  brandArt?: string;
  accent?: string; // hex for thematic accent
};

const QUESTS: Record<string, QuestContent> = {
  jupiter: {
    id: "jupiter",
    title: "Jupiter Liquidity Quest",
    description: "Master optimal routing and provide liquidity to deepen the orderbook of the Church's treasury pairs.",
    requirements: [
      "Wallet connected",
      "Min 0.1 SOL for gas",
      "Familiarity with DEX routing"
    ],
    steps: [
      "Open Jupiter and select treasury pair.",
      "Simulate best route and confirm slippage.",
      "Provide liquidity to target pool.",
      "Record transaction signature for submission."
    ],
    brandArt: "/brands/jupiter.jpg",
    accent: "#f1b400"
  },
  kamino: {
    id: "kamino",
    title: "Kamino Vault Steward",
    description: "Allocate capital across Kamino's strategies to maximize risk-adjusted yield while preserving principal.",
    requirements: ["Wallet connected", "Understanding of vault risk", "0.1 SOL gas buffer"],
    steps: [
      "Choose target Kamino vault.",
      "Deposit test amount and verify share receipt.",
      "Review APY and risk knobs.",
      "Save the transaction signature."
    ],
    brandArt: "/brands/kamino.png",
    accent: "#00f0ff"
  },
  pumpfun: {
    id: "pumpfun",
    title: "Pump.fun Evangelism",
    description: "Spread the gospel of memes by crafting an uplifting, wholesome meme and sharing it with the flock.",
    requirements: ["Creativity", "Respectful content", "Image editing tool"],
    steps: [
      "Create a wholesome meme.",
      "Post on your preferred platform.",
      "Capture the link or image.",
      "Submit for review."
    ],
    brandArt: "/brands/pumpfun.jpeg",
    accent: "#ff6b6b"
  },
  arcium: {
    id: "arcium",
    title: "Arcium Data Pilgrim",
    description: "Index an on-chain dataset and extract a meaningful insight to aid the Church treasury council.",
    requirements: ["Basic SQL or indexing skills", "Public RPC access", "0.1 SOL"],
    steps: [
      "Pick an on-chain dataset.",
      "Index and query for trends.",
      "Prepare a short 3-bullet insight.",
      "Attach supporting links or code."
    ],
    brandArt: "/brands/arcium.jpg",
    accent: "#9b6bff"
  },
};

const QuestPage: React.FC = () => {
  const { questId } = useParams<{ questId: string }>();
  const navigate = useNavigate();
  const { playHit, playSuccess } = useAudio();
  const { updateFaithProgress } = useProgress();
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [faithEarned, setFaithEarned] = useState<number>(0);

  const quest = useMemo(() => (questId ? QUESTS[questId] : undefined), [questId]);

  if (!quest) {
    return (
      <div className="quest-page-container">
        <div className="quest-not-found">
          <h1 className="quest-title">Quest Not Found</h1>
          <p>We couldn't find that quest. Please return to the Church realm.</p>
          <button className="back-button" onClick={() => { playHit(); navigate("/church"); }}>
            ← Back to Church
          </button>
        </div>
      </div>
    );
  }

  const handleSubmitProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrl.trim()) return;
    
    playSuccess();
    const reward = 5; // fixed FAITH reward per quest completion for now
    updateFaithProgress(reward);
    setFaithEarned(reward);
    setShowCompletionModal(true);
    setProofUrl("");
    setNotes("");
  };

  return (
    <>
    <div className="quest-page-container">
      {/* Church Background */}
      <div className="church-background">
        <img src="/scenes/church_scene.png" alt="Church Background" />
        <div className="church-overlay"></div>
      </div>

      {/* Back Button */}
      <button 
        className="back-button"
        onClick={() => { playHit(); navigate("/church"); }}
      >
        <span className="back-icon">←</span>
        <span className="back-text">BACK TO CHURCH</span>
      </button>

      {/* Hero Section - Project Image, Title, Description */}
      <div className="quest-hero-section">
        <div className="hero-content">
          <div className="hero-image">
            {quest.brandArt && <img src={quest.brandArt} alt={quest.title} />}
          </div>
          <div className="hero-text">
            <h1 className="hero-title">{quest.title}</h1>
            <p className="hero-description">{quest.description}</p>
          </div>
        </div>
      </div>

      {/* Main Content - Scroll and Proof */}
      <div className="quest-main-section">
        <div className="quest-flex-layout">
          {/* Left Side - Scroll (50%) */}
          <div className="scroll-section">
            <div className="quest-scroll">
              <div className="scroll-header">
                <h2 className="mission-title">Mission</h2>
              </div>
              
              <div className="scroll-content">
                <div className="requirements-section">
                  <h3 className="section-title">Requirements</h3>
                  <ul className="requirements-list">
                    {quest.requirements.map((req, i) => (
                      <li key={i} className="requirement-item">
                        <span className="requirement-marker">✠</span>
                        {req}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="steps-section">
                  <h3 className="section-title">Steps to Complete</h3>
                  <ol className="steps-list">
                    {quest.steps.map((step, i) => (
                      <li key={i} className="step-item">
                        <span className="step-number">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Proof Submission (50%) */}
          <div className="proof-section">
            <div className="proof-panel">
              <h2 className="proof-title">Submit Your Proof</h2>
              <p className="proof-subtitle">Provide evidence of your completed quest</p>
              
              <form className="proof-form" onSubmit={handleSubmitProof}>
                <div className="form-group">
                  <label className="form-label">Proof URL or Transaction ID</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Paste your transaction signature, URL, or proof ID"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Additional Notes (Optional)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="Add any context, reflections, or additional details..."
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <button type="submit" className="submit-button">
                  Submit Proof
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
    {showCompletionModal && (
      <div className="verification-modal-overlay" onClick={() => setShowCompletionModal(false)}>
        <div className="verification-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="success-icon">✅</div>
            <h2 className="modal-title">Quest Completed</h2>
          </div>
          <div className="modal-content">
            <p className="modal-message">Quest completed, {faithEarned} FAITH points earned.</p>
            <div className="reward-display">
              <div className="reward-item">
                <span className="reward-label">Tip:</span>
                <span className="reward-value">Accumulating FAITH boosts your odds at the casino.</span>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={() => setShowCompletionModal(false)}>
            Continue
          </button>
        </div>
      </div>
    )}
    </>
  );
};

export default QuestPage;


