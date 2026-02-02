import React, { useEffect, useState } from 'react';
import { useCasinoProgress, CASINO_TOUR_STEPS } from '../../lib/stores/useCasinoProgress';
import { useAudio } from '../../lib/stores/useAudio';
import CasinoSpotlightTour from './CasinoSpotlightTour';

interface GamblerGuideProps {
  onTourComplete?: () => void;
}

const GamblerGuide: React.FC<GamblerGuideProps> = ({ onTourComplete }) => {
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
  } = useCasinoProgress();

  const [showTour, setShowTour] = useState(false);

  // Show tour on first visit after a delay (wait for page to render)
  useEffect(() => {
    if (isFirstVisit && !tourCompleted) {
      // Wait for page animations to complete and elements to be rendered
      const timer = setTimeout(() => {
        startTour();
        setShowTour(true);
      }, 2500); // Longer delay to account for casino transition screen
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

  // Only render tour when active
  if (!showTour) {
    return null;
  }

  return (
    <CasinoSpotlightTour
      steps={CASINO_TOUR_STEPS}
      isActive={showTour}
      currentStep={currentTourStep}
      onNext={handleNext}
      onPrev={handlePrev}
      onSkip={handleSkip}
      onComplete={handleComplete}
    />
  );
};

export default GamblerGuide;

// Helper hook to manually trigger the tour (e.g., from a help button)
export const useCasinoTour = () => {
  const { resetTour } = useCasinoProgress();

  const restartTour = () => {
    resetTour();
    // Force re-render by reloading - or you could use a state management approach
    window.location.reload();
  };

  return { restartTour };
};

