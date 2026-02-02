import React, { useEffect, useState } from 'react';
import { useChurchProgress, MILESTONE_MESSAGES } from '../../lib/stores/useChurchProgress';
import { useAudio } from '../../lib/stores/useAudio';
import SpotlightTour, { TourStep } from './SpotlightTour';

interface PriestGuideProps {
  onTourComplete?: () => void;
  onMilestoneDismiss?: () => void;
}

// Tour steps with element targeting
const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to The Church',
    message: "Welcome, child. I am Father Satoshi. Allow me to guide you through these sacred halls where believers build real value...",
    targetSelector: null, // No spotlight, centered message
    preferredPosition: 'auto',
  },
  {
    id: 'faith',
    title: 'The Chalice of Faith',
    message: "This holy chalice measures your FAITH. Complete sacred quests to fill it with divine light. Your FAITH can be redeemed for rewards in the Casino realm...",
    targetSelector: '#faith-chalice',
    preferredPosition: 'bottom',
    padding: 20,
  },
  {
    id: 'chapters',
    title: 'Choose Your Chapter',
    message: "Use this dropdown to filter quests by project. Select 'Jupiter', 'Kamino', 'Pump.fun', or other chapters to focus on specific callings. Choose 'Random' for divine surprise...",
    targetSelector: '#chapters-dropdown',
    preferredPosition: 'bottom',
    padding: 15,
  },
  {
    id: 'scripture',
    title: 'The Sacred Scripture',
    message: "These ancient pages contain your sacred quests. Each one is a calling to support real projects and spread the word of blockchain...",
    targetSelector: '#scripture-section',
    preferredPosition: 'auto',
    padding: 25,
  },
  {
    id: 'navigation',
    title: 'Turn the Pages',
    message: "Use these buttons or swipe left/right on the book to turn pages and discover different callings. Each quest offers unique ways to earn FAITH...",
    targetSelector: '#scripture-nav',
    preferredPosition: 'top',
    padding: 15,
  },
  {
    id: 'priest',
    title: 'Your Spiritual Guide',
    message: "I will be here to guide you on your journey. When you achieve milestones, I will appear to celebrate with you and offer blessings...",
    targetSelector: '#priest-section',
    preferredPosition: 'auto',
    padding: 20,
  },
  {
    id: 'blessing',
    title: 'Go Forth',
    message: "Go forth, child. May your FAITH guide you on this righteous path. Return often, and your light shall grow ever stronger...",
    targetSelector: null,
    preferredPosition: 'auto',
  },
];

// Type for milestone keys
type MilestoneType = 
  | 'reached25' | 'reached50' | 'reached75' | 'reached100' 
  | 'firstQuest' | 'fifthQuest' | 'tenthQuest' 
  | 'firstSermon' | 'returnAfterAbsence';

const PriestGuide: React.FC<PriestGuideProps> = ({ 
  onTourComplete,
  onMilestoneDismiss 
}) => {
  const { playHit } = useAudio();
  const {
    isFirstVisit,
    tourCompleted,
    currentTourStep,
    nextTourStep,
    prevTourStep,
    completeTour,
    skipTour,
    startTour,
  } = useChurchProgress();

  const [showTour, setShowTour] = useState(false);
  const [milestone, setMilestone] = useState<MilestoneType | null>(null);

  // Show tour on first visit after a delay
  useEffect(() => {
    if (isFirstVisit && !tourCompleted) {
      // Wait for page animations to complete and elements to be rendered
      const timer = setTimeout(() => {
        startTour();
        setShowTour(true);
      }, 3000); // Longer delay to account for church transition screen
      return () => clearTimeout(timer);
    }
  }, [isFirstVisit, tourCompleted, startTour]);

  const handleNext = () => {
    nextTourStep();
  };

  const handlePrev = () => {
    prevTourStep();
  };

  const handleSkip = () => {
    playHit();
    skipTour();
    setShowTour(false);
    onTourComplete?.();
  };

  const handleComplete = () => {
    playHit();
    completeTour();
    setShowTour(false);
    onTourComplete?.();
  };

  const handleMilestoneDismiss = () => {
    playHit();
    setMilestone(null);
    onMilestoneDismiss?.();
  };

  // Expose method to show milestone (can be called from parent)
  const showMilestone = (type: MilestoneType) => {
    setMilestone(type);
  };

  // Attach to window for parent access
  useEffect(() => {
    (window as any).showChurchMilestone = showMilestone;
    return () => {
      delete (window as any).showChurchMilestone;
    };
  }, []);

  // Generate particles for milestone celebration
  const generateParticles = () => {
    return [...Array(20)].map((_, i) => {
      const angle = (i / 20) * Math.PI * 2;
      const distance = 100 + Math.random() * 150;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      
      return (
        <span
          key={i}
          className="milestone-particle"
          style={{
            left: '50%',
            top: '50%',
            '--tx': `${tx}px`,
            '--ty': `${ty}px`,
            animationDelay: `${Math.random() * 0.3}s`,
          } as React.CSSProperties}
        />
      );
    });
  };

  // Spotlight Tour
  if (showTour) {
    return (
      <SpotlightTour
        steps={TOUR_STEPS}
        isActive={showTour}
        currentStep={currentTourStep}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onComplete={handleComplete}
      />
    );
  }

  // Milestone celebration
  if (milestone) {
    const milestoneData = MILESTONE_MESSAGES[milestone as keyof typeof MILESTONE_MESSAGES];
    
    if (!milestoneData) return null;

    return (
      <div className="milestone-celebration">
        <div className="milestone-particles">
          {generateParticles()}
        </div>
        
        <div className="milestone-content">
          <span className="milestone-icon">{milestoneData.icon}</span>
          <span className="milestone-badge">{milestoneData.badge}</span>
          
          <div className="milestone-priest">
            <img 
              src="/avatars/priest.png" 
              alt="Father Satoshi" 
              className="milestone-priest-avatar"
            />
            <div className="milestone-message">
              <p className="milestone-message-text">
                "{milestoneData.message}"
              </p>
            </div>
          </div>
          
          <button 
            className="milestone-close-btn"
            onClick={handleMilestoneDismiss}
          >
            Receive Blessing ✨
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default PriestGuide;

// Helper hook to trigger milestones from anywhere
export const useMilestone = () => {
  const triggerMilestone = (type: MilestoneType) => {
    if ((window as any).showChurchMilestone) {
      (window as any).showChurchMilestone(type);
    }
  };

  return { triggerMilestone };
};
