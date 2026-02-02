import React, { useState, useEffect, useCallback } from "react";
import { useAnchorWallet, useWallet, useConnection } from "@solana/wallet-adapter-react";
import { decryptHandle } from "../../lib/program/inco";
import { useClaimRewards } from "../../hooks/useClaimRewards";
import "../../styles/claim-rewards-modal.css";

export type ClaimPhase = 
  | "initial" 
  | "decrypting" 
  | "revealed" 
  | "claiming" 
  | "success" 
  | "error";

interface ClaimRewardsModalProps {
  isOpen: boolean;
  gamePda: string;
  payoutHandle: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ClaimRewardsModal: React.FC<ClaimRewardsModalProps> = ({
  isOpen,
  gamePda,
  payoutHandle,
  onClose,
  onSuccess,
}) => {
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();
  const { submitClaim, isClaiming } = useClaimRewards();
  
  const [phase, setPhase] = useState<ClaimPhase>("initial");
  const [revealedAmount, setRevealedAmount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");
  const [decryptResult, setDecryptResult] = useState<{
    plaintext: string;
    ed25519Instructions: any[];
  } | null>(null);

  const storyText = "Your winnings are encrypted on-chain. Sign to reveal your prize, then claim it to your wallet...";

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase("initial");
      setRevealedAmount(0);
      setError(null);
      setDecryptResult(null);
      setTypedText("");
    }
  }, [isOpen]);

  // Typing effect for story text
  useEffect(() => {
    if (!isOpen || phase !== "initial") {
      return;
    }

    let index = 0;
    const timer = setInterval(() => {
      if (index < storyText.length) {
        setTypedText(storyText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, 25);

    return () => clearInterval(timer);
  }, [isOpen, phase]);

  // Step 1: Decrypt payout handle
  const handleRevealAmount = useCallback(async () => {
    if (!wallet || !signMessage) {
      setError("Wallet not connected");
      return;
    }

    setPhase("decrypting");
    setError(null);

    try {
      console.log("Decrypting payout handle for claim...");
      const result = await decryptHandle(payoutHandle, wallet, signMessage);
      
      if (!result) {
        throw new Error("Failed to decrypt payout");
      }

      const amount = parseInt(result.plaintext, 10);
      console.log("Revealed amount:", amount, "lamports");

      setRevealedAmount(amount);
      setDecryptResult(result);
      setPhase("revealed");
    } catch (err: any) {
      console.error("Decrypt error:", err);
      setError(err.message || "Failed to reveal amount");
      setPhase("error");
    }
  }, [wallet, signMessage, payoutHandle]);

  // Step 2: Claim rewards
  const handleClaimRewards = useCallback(async () => {
    if (!decryptResult) {
      setError("No decryption result");
      return;
    }

    setPhase("claiming");
    setError(null);

    try {
      await submitClaim(
        gamePda,
        payoutHandle,
        decryptResult.plaintext,
        decryptResult.ed25519Instructions
      );
      setPhase("success");
      
      // Auto-close after success
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2500);
    } catch (err: any) {
      console.error("Claim error:", err);
      setError(err.message || "Failed to claim rewards");
      setPhase("error");
    }
  }, [decryptResult, gamePda, payoutHandle, submitClaim, onClose, onSuccess]);

  if (!isOpen) return null;

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(4);

  const renderContent = () => {
    switch (phase) {
      case "initial":
        return (
          <div className="claim-content initial-phase">
            <div className="claim-icon-container">
              <div className="treasure-icon">
                <span className="treasure-emoji">💰</span>
              </div>
              <div className="treasure-glow" />
            </div>

            <h2 className="claim-title">CLAIM YOUR WINNINGS</h2>

            <div className="claim-story">
              <p className="story-text">{typedText}<span className="cursor">|</span></p>
            </div>

            <div className="claim-steps">
              <div className="step-item active">
                <div className="step-number">1</div>
                <div className="step-content">
                  <span className="step-title">Reveal Amount</span>
                  <span className="step-desc">Sign to decrypt your winnings</span>
                </div>
              </div>
              <div className="step-connector" />
              <div className="step-item locked">
                <div className="step-number">2</div>
                <div className="step-content">
                  <span className="step-title">Claim SOL</span>
                  <span className="step-desc">Transfer to your wallet</span>
                </div>
              </div>
            </div>

            <button className="claim-button primary" onClick={handleRevealAmount}>
              <span className="button-icon">🔓</span>
              <span className="button-text">REVEAL AMOUNT</span>
              <div className="button-shine" />
            </button>

            <button className="claim-button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        );

      case "decrypting":
        return (
          <div className="claim-content decrypting-phase">
            <div className="decrypting-animation">
              <div className="decrypt-ring ring-1" />
              <div className="decrypt-ring ring-2" />
              <div className="decrypt-ring ring-3" />
              <div className="decrypt-center">
                <span className="decrypt-icon">🔐</span>
              </div>
            </div>

            <h2 className="claim-title">DECRYPTING...</h2>

            <div className="decrypt-progress">
              <div className="progress-bar decrypting">
                <div className="progress-fill" />
              </div>
              <p className="progress-text">Waiting for signature...</p>
            </div>

            <div className="decrypt-bytes">
              {[...Array(16)].map((_, i) => (
                <span
                  key={i}
                  className="byte"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {Math.random().toString(16).substr(2, 2)}
                </span>
              ))}
            </div>
          </div>
        );

      case "revealed":
        return (
          <div className="claim-content revealed-phase">
            <div className="amount-reveal">
              <div className="amount-glow" />
              <div className="amount-container">
                <span className="amount-label">YOUR WINNINGS</span>
                <span className="amount-value">{formatSol(revealedAmount)} SOL</span>
                <span className="amount-subtext">≈ ${(revealedAmount / 1e9 * 100).toFixed(2)} USD</span>
              </div>
            </div>

            <div className="claim-steps">
              <div className="step-item completed">
                <div className="step-number">✓</div>
                <div className="step-content">
                  <span className="step-title">Amount Revealed</span>
                  <span className="step-desc">{formatSol(revealedAmount)} SOL</span>
                </div>
              </div>
              <div className="step-connector active" />
              <div className="step-item active">
                <div className="step-number">2</div>
                <div className="step-content">
                  <span className="step-title">Claim SOL</span>
                  <span className="step-desc">Sign transaction to transfer</span>
                </div>
              </div>
            </div>

            <button className="claim-button primary gold" onClick={handleClaimRewards}>
              <span className="button-icon">💎</span>
              <span className="button-text">CLAIM {formatSol(revealedAmount)} SOL</span>
              <div className="button-shine" />
            </button>

            <button className="claim-button secondary" onClick={onClose}>
              Claim Later
            </button>
          </div>
        );

      case "claiming":
        return (
          <div className="claim-content claiming-phase">
            <div className="claiming-animation">
              <div className="coin-stack">
                <span className="coin coin-1">🪙</span>
                <span className="coin coin-2">🪙</span>
                <span className="coin coin-3">🪙</span>
              </div>
              <div className="transfer-arrow">→</div>
              <div className="wallet-icon">👛</div>
            </div>

            <h2 className="claim-title">CLAIMING...</h2>

            <div className="decrypt-progress">
              <div className="progress-bar claiming">
                <div className="progress-fill" />
              </div>
              <p className="progress-text">Transferring {formatSol(revealedAmount)} SOL to your wallet...</p>
            </div>
          </div>
        );

      case "success":
        return (
          <div className="claim-content success-phase">
            <div className="success-animation">
              <div className="success-burst" />
              <div className="success-icon">🎉</div>
              <div className="confetti-container">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="confetti"
                    style={{
                      left: `${Math.random() * 100}%`,
                      animationDelay: `${Math.random() * 0.5}s`,
                      backgroundColor: ['#ffd700', '#ff2fb4', '#00f0ff', '#22c55e'][Math.floor(Math.random() * 4)],
                    }}
                  />
                ))}
              </div>
            </div>

            <h2 className="claim-title success">CLAIMED!</h2>

            <div className="success-amount">
              <span className="amount-value">{formatSol(revealedAmount)} SOL</span>
              <span className="amount-subtext">Added to your wallet</span>
            </div>

            <p className="success-message">Your winnings have been transferred!</p>
          </div>
        );

      case "error":
        return (
          <div className="claim-content error-phase">
            <div className="error-icon-container">
              <span className="error-emoji">❌</span>
            </div>

            <h2 className="claim-title error">ERROR</h2>

            <p className="error-message">{error}</p>

            <button className="claim-button primary" onClick={() => setPhase("initial")}>
              <span className="button-text">TRY AGAIN</span>
            </button>

            <button className="claim-button secondary" onClick={onClose}>
              Close
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="claim-modal-overlay">
      <div className="claim-modal-backdrop" onClick={onClose} />
      <div className="claim-modal">
        <div className="modal-glow gold" />
        <div className="modal-border gold" />
        {renderContent()}
      </div>
    </div>
  );
};

export default ClaimRewardsModal;
