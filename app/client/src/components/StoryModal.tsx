import React, { useEffect, useState } from "react";
import { useAudio } from "../lib/stores/useAudio";
import "../styles/story-modal.css";

interface StoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StoryModal: React.FC<StoryModalProps> = ({ isOpen, onClose }) => {
  const { playHit } = useAudio();
  const [currentStep, setCurrentStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [displayedText, setDisplayedText] = useState("");

  const storyText = `🌌 The Casino and The Church 🌌 : A Tale of Crypto in Two Realms

Most believe crypto is one thing. They are wrong.
It is two.

On one side lies The Casino — flashing lights, spinning wheels, memecoin madness. Fortunes made, fortunes lost. A place where hope is pumped like oxygen, where laughter echoes alongside the sound of collapsing dreams. It is exhilarating, unpredictable, intoxicating.

On the other side stands The Church — a hall of sermons, prophecy, and belief. Here, old texts are rewritten as whitepapers. Here, the faithful argue over visions of tomorrow, promising freedom and salvation through code. It is solemn, righteous, inspiring.

But here is the truth:
The Casino funds the Church.
The Church built the Casino.
Neither can live without the other.

You are a wanderer between these realms.
In the Casino, your LUCK will rise and fall as you play the casino games.
In the Church, your FAITH will grow through writing, quests, and prophecy.

But beware—if you spend too long in one realm, the other will fade.
Too much gambling, and your faith begins to crumble.
Too much preaching, and your luck runs dry.

Balance is survival.
LUCK fuels FAITH.
FAITH shapes LUCK.
Together, they decide your fate.

So choose wisely, traveler.
Will you gamble with the Gambler?
Or pray with the Priest?
Perhaps both —because only those who master both sides of the coin can truly understand the world of crypto.

Your Mission is to achieve balance between the two realms. You will earn Jackpots and Bonuses for achieving balance.

Your FAITH points can be redeemable in the Casino.

Welcome to The Casino and The Church. Enjoy the spectacles while you pray for the miracles.

Click the "Read Backstory" button to read this story again.`;

  const storyParts = storyText.split('\n\n');

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setDisplayedText("");
      setIsTyping(false);
      return;
    }

    if (currentStep < storyParts.length) {
      setIsTyping(true);
      setDisplayedText("");
      
      const currentPart = storyParts[currentStep];
      let charIndex = 0;
      
      const typeInterval = setInterval(() => {
        if (charIndex < currentPart.length) {
          setDisplayedText(currentPart.substring(0, charIndex + 1));
          charIndex++;
        } else {
          setIsTyping(false);
          clearInterval(typeInterval);
        }
      }, 30); // Typing speed

      return () => clearInterval(typeInterval);
    }
  }, [isOpen, currentStep]);

  const handleNext = () => {
    playHit();
    if (currentStep < storyParts.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handleSkip = () => {
    playHit();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="story-modal-overlay">
      <div className="story-modal">
        <div className="story-content">
          <div className="story-text">
            {displayedText}
            {isTyping && <span className="typing-cursor">|</span>}
          </div>
          
          <div className="story-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${((currentStep + 1) / storyParts.length) * 100}%` }}
              ></div>
            </div>
            <span className="progress-text">
              {currentStep + 1} / {storyParts.length}
            </span>
          </div>
          
          <div className="story-controls">
            <button className="skip-button" onClick={handleSkip}>
              SKIP STORY
            </button>
            <button 
              className="next-button" 
              onClick={handleNext}
              disabled={isTyping}
            >
              {currentStep < storyParts.length - 1 ? 'NEXT' : 'BEGIN JOURNEY'}
            </button>
          </div>
        </div>
        
        <div className="story-decoration">
          <div className="casino-decoration">🎰</div>
          <div className="church-decoration">⛪</div>
          <div className="coin-decoration">🪙</div>
        </div>
      </div>
    </div>
  );
};

export default StoryModal; 