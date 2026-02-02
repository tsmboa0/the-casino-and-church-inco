import React, { useState, useEffect } from "react";
import "../../styles/confidential-reveal.css";

export type RevealPhase = "reveal-result" | "revealing-result" | "decrypted";

interface ConfidentialRevealModalProps {
    isOpen: boolean;
    phase: RevealPhase;
    onRevealResult: () => void;
    onClose: () => void;
}

const ConfidentialRevealModal: React.FC<ConfidentialRevealModalProps> = ({
    isOpen,
    phase,
    onRevealResult,
    onClose,
}) => {
    const [typedText, setTypedText] = useState("");
    const [progressStage, setProgressStage] = useState<"waiting" | "signing" | "complete">("waiting");
    
    const storyText = "Your fate is sealed on-chain, encrypted and hidden from all eyes. Only YOU possess the key to unveil the truth...";
    
    // Typing effect for story text
    useEffect(() => {
        if (!isOpen || phase !== "reveal-result") {
            setTypedText("");
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
        }, 30);
        
        return () => clearInterval(timer);
    }, [isOpen, phase]);

    // Progress bar stages
    useEffect(() => {
        if (phase === "revealing-result") {
            // Start at "waiting" - fills to 50%
            setProgressStage("waiting");
            
            // After a moment, move to "signing" stage (user is signing)
            const timer = setTimeout(() => {
                setProgressStage("signing");
            }, 500);
            
            return () => clearTimeout(timer);
        } else if (phase === "decrypted") {
            // Decryption complete - fill to 100%
            setProgressStage("complete");
        } else {
            setProgressStage("waiting");
        }
    }, [phase]);

    // Auto-close when decrypted
    useEffect(() => {
        if (phase === "decrypted") {
            const timer = setTimeout(() => {
                onClose();
            }, 800); // Brief delay to show completion
            return () => clearTimeout(timer);
        }
    }, [phase, onClose]);
    
    if (!isOpen) return null;
    
    const renderContent = () => {
        switch (phase) {
            case "reveal-result":
                return (
                    <div className="reveal-content reveal-result-phase">
                        <div className="reveal-icon-container">
                            <div className="lock-icon">
                                <span className="lock-body">🔐</span>
                            </div>
                            <div className="lock-glow" />
                        </div>
                        
                        <h2 className="reveal-title">CONFIDENTIAL RESULT</h2>
                        
                        <div className="reveal-story">
                            <p className="story-text">{typedText}<span className="cursor">|</span></p>
                        </div>
                        
                        <div className="reveal-info">
                            <div className="info-item">
                                <span className="info-icon">🎲</span>
                                <span className="info-text">Result encrypted on Solana</span>
                            </div>
                            <div className="info-item">
                                <span className="info-icon">🔑</span>
                                <span className="info-text">Your signature is the key</span>
                            </div>
                        </div>
                        
                        <button 
                            className="reveal-button primary"
                            onClick={onRevealResult}
                        >
                            <span className="button-icon">🔓</span>
                            <span className="button-text">REVEAL YOUR FATE</span>
                            <div className="button-shine" />
                        </button>
                        
                        <p className="reveal-hint">Sign with your wallet to decrypt the result</p>
                    </div>
                );
                
            case "revealing-result":
            case "decrypted":
                return (
                    <div className="reveal-content revealing-phase">
                        <div className={`revealing-animation ${progressStage === "complete" ? "complete" : ""}`}>
                            <div className="decrypt-ring ring-1" />
                            <div className="decrypt-ring ring-2" />
                            <div className="decrypt-ring ring-3" />
                            <div className="decrypt-center">
                                <span className="decrypt-icon">
                                    {progressStage === "complete" ? "🔓" : "🔐"}
                                </span>
                            </div>
                        </div>
                        
                        <h2 className="reveal-title">
                            {progressStage === "complete" ? "DECRYPTED!" : 
                             progressStage === "signing" ? "SIGN TO DECRYPT..." : 
                             "PREPARING..."}
                        </h2>
                        
                        <div className="decrypt-progress">
                            <div className={`progress-bar ${progressStage}`}>
                                <div className="progress-fill" />
                            </div>
                            <p className="progress-text">
                                {progressStage === "complete" ? "Revealing your fate..." :
                                 progressStage === "signing" ? "Waiting for signature..." :
                                 "Preparing decryption..."}
                            </p>
                        </div>
                        
                        <div className="decrypt-bytes">
                            {[...Array(20)].map((_, i) => (
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
                
            default:
                return null;
        }
    };
    
    return (
        <div className="confidential-modal-overlay">
            <div className="confidential-modal-backdrop" />
            <div className="confidential-modal">
                <div className="modal-glow" />
                <div className="modal-border" />
                {renderContent()}
            </div>
        </div>
    );
};

export default ConfidentialRevealModal;
