import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAudio } from '../../lib/stores/useAudio';

export interface TourStep {
  id: string;
  title: string;
  message: string;
  targetSelector: string | null; // CSS selector for target element, null for centered modal
  preferredPosition: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  padding?: number; // Extra padding around the spotlight
}

interface SpotlightTourProps {
  steps: TourStep[];
  isActive: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

interface SpotlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface MessagePosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transform?: string;
  maxWidth: number;
}

type PositionSide = 'top' | 'bottom' | 'left' | 'right' | 'center';

const SpotlightTour: React.FC<SpotlightTourProps> = ({
  steps,
  isActive,
  currentStep,
  onNext,
  onPrev,
  onSkip,
  onComplete,
}) => {
  const { playHit } = useAudio();
  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null);
  const [messagePosition, setMessagePosition] = useState<MessagePosition | null>(null);
  const [actualPosition, setActualPosition] = useState<PositionSide>('center');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width <= 480);
      setIsTablet(width > 480 && width <= 768);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Lock body scroll when tour is active
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isActive]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          playHit();
          onSkip();
          break;
        case 'ArrowRight':
        case 'Enter':
          playHit();
          if (isLastStep) {
            onComplete();
          } else {
            onNext();
          }
          break;
        case 'ArrowLeft':
          if (!isFirstStep) {
            playHit();
            onPrev();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isLastStep, isFirstStep, onNext, onPrev, onSkip, onComplete, playHit]);

  // Calculate optimal message position that doesn't obstruct spotlight
  const calculateMessagePosition = useCallback((
    spotlightRect: SpotlightPosition | null,
    preferred: TourStep['preferredPosition']
  ): { position: MessagePosition; side: PositionSide } => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Responsive sizing
    const messageWidth = isMobile ? Math.min(260, viewportWidth - 24) : isTablet ? 320 : 360;
    const messageHeight = isMobile ? 170 : isTablet ? 190 : 210; // Approximate height
    const avatarWidth = isMobile ? 50 : isTablet ? 65 : 90;
    const totalWidth = messageWidth + avatarWidth + 16; // message + avatar + gap
    const gap = isMobile ? 12 : isTablet ? 16 : 24; // Gap between spotlight and message
    const viewportPadding = isMobile ? 8 : isTablet ? 12 : 20;

    // Centered position (no spotlight)
    if (!spotlightRect) {
      return {
        position: {
          top: viewportHeight / 2,
          left: viewportWidth / 2,
          transform: 'translate(-50%, -50%)',
          maxWidth: messageWidth,
        },
        side: 'center',
      };
    }

    // Calculate available space on each side (accounting for viewport bounds)
    const spaceTop = spotlightRect.top - gap - viewportPadding;
    const spaceBottom = viewportHeight - (spotlightRect.top + spotlightRect.height) - gap - viewportPadding;
    const spaceLeft = spotlightRect.left - gap - viewportPadding;
    const spaceRight = viewportWidth - (spotlightRect.left + spotlightRect.width) - gap - viewportPadding;

    // Minimum space needed for each position
    const minHeightNeeded = isMobile ? 150 : messageHeight;
    const minWidthNeeded = isMobile ? totalWidth - 30 : totalWidth;

    // Determine best position
    let bestSide: PositionSide = 'bottom';
    
    // Score each position based on available space and preference
    const positions: { side: PositionSide; score: number; viable: boolean }[] = [
      { 
        side: 'bottom', 
        score: spaceBottom + (preferred === 'bottom' ? 100 : 0),
        viable: spaceBottom >= minHeightNeeded
      },
      { 
        side: 'top', 
        score: spaceTop + (preferred === 'top' ? 100 : 0),
        viable: spaceTop >= minHeightNeeded
      },
      { 
        side: 'right', 
        score: spaceRight + (preferred === 'right' ? 100 : 0),
        viable: spaceRight >= minWidthNeeded
      },
      { 
        side: 'left', 
        score: spaceLeft + (preferred === 'left' ? 100 : 0),
        viable: spaceLeft >= minWidthNeeded
      },
    ];

    // First try to find a viable position
    const viablePositions = positions.filter(p => p.viable);
    if (viablePositions.length > 0) {
      // Sort by score (highest first)
      viablePositions.sort((a, b) => b.score - a.score);
      bestSide = viablePositions[0].side;
    } else {
      // No ideal position - pick the one with most space
      positions.sort((a, b) => b.score - a.score);
      bestSide = positions[0].side;
    }

    // Calculate actual position based on chosen side
    let position: MessagePosition;
    const spotlightCenterX = spotlightRect.left + spotlightRect.width / 2;
    const spotlightCenterY = spotlightRect.top + spotlightRect.height / 2;

    // Helper to clamp values within viewport
    const clampX = (x: number) => Math.max(viewportPadding, Math.min(x, viewportWidth - totalWidth - viewportPadding));
    const clampY = (y: number) => Math.max(viewportPadding, Math.min(y, viewportHeight - messageHeight - viewportPadding));

    switch (bestSide) {
      case 'top': {
        // Position above spotlight
        let topValue = spotlightRect.top - gap - messageHeight;
        // Ensure it stays in viewport
        topValue = Math.max(viewportPadding, topValue);
        
        let leftValue = spotlightCenterX - totalWidth / 2;
        leftValue = clampX(leftValue);
        
        position = {
          top: topValue,
          left: leftValue,
          maxWidth: messageWidth,
        };
        break;
      }
      case 'bottom': {
        // Position below spotlight
        let topValue = spotlightRect.top + spotlightRect.height + gap;
        // Ensure it stays in viewport
        topValue = Math.min(topValue, viewportHeight - messageHeight - viewportPadding);
        
        let leftValue = spotlightCenterX - totalWidth / 2;
        leftValue = clampX(leftValue);
        
        position = {
          top: topValue,
          left: leftValue,
          maxWidth: messageWidth,
        };
        break;
      }
      case 'left': {
        // Position to the left of spotlight
        let leftValue = spotlightRect.left - gap - totalWidth;
        // Ensure it stays in viewport
        leftValue = Math.max(viewportPadding, leftValue);
        
        let topValue = spotlightCenterY - messageHeight / 2;
        topValue = clampY(topValue);
        
        position = {
          top: topValue,
          left: leftValue,
          maxWidth: messageWidth,
        };
        break;
      }
      case 'right': {
        // Position to the right of spotlight
        let leftValue = spotlightRect.left + spotlightRect.width + gap;
        // Ensure it stays in viewport
        leftValue = Math.min(leftValue, viewportWidth - totalWidth - viewportPadding);
        
        let topValue = spotlightCenterY - messageHeight / 2;
        topValue = clampY(topValue);
        
        position = {
          top: topValue,
          left: leftValue,
          maxWidth: messageWidth,
        };
        break;
      }
      default:
        position = {
          top: viewportHeight / 2,
          left: viewportWidth / 2,
          transform: 'translate(-50%, -50%)',
          maxWidth: messageWidth,
        };
    }

    // Final safety check - ensure position values are valid numbers
    if (position.top !== undefined && (position.top < 0 || position.top > viewportHeight - 100)) {
      position.top = Math.max(viewportPadding, Math.min(position.top, viewportHeight - messageHeight - viewportPadding));
    }
    if (position.left !== undefined && (position.left < 0 || position.left > viewportWidth - 100)) {
      position.left = Math.max(viewportPadding, Math.min(position.left, viewportWidth - totalWidth - viewportPadding));
    }

    return { position, side: bestSide };
  }, [isMobile, isTablet]);

  // Calculate spotlight position for target element
  const calculateSpotlight = useCallback(() => {
    if (!step || !step.targetSelector) {
      setSpotlight(null);
      const { position, side } = calculateMessagePosition(null, 'auto');
      setMessagePosition(position);
      setActualPosition(side);
      return;
    }

    const element = document.querySelector(step.targetSelector);
    if (!element) {
      console.warn(`Church tour target element not found: ${step.targetSelector}`);
      setSpotlight(null);
      const { position, side } = calculateMessagePosition(null, 'auto');
      setMessagePosition(position);
      setActualPosition(side);
      return;
    }

    const rect = element.getBoundingClientRect();
    const padding = step.padding || 15;

    const spotlightRect: SpotlightPosition = {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };

    setSpotlight(spotlightRect);
    
    const { position, side } = calculateMessagePosition(spotlightRect, step.preferredPosition);
    setMessagePosition(position);
    setActualPosition(side);
  }, [step, calculateMessagePosition]);

  // Update positions when step changes
  useEffect(() => {
    if (!isActive || !step) return;

    setIsTransitioning(true);

    // Small delay to allow CSS transitions
    const timer = setTimeout(() => {
      calculateSpotlight();
      setIsTransitioning(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [isActive, step, calculateSpotlight]);

  // Recalculate on window resize
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => {
      calculateSpotlight();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive, calculateSpotlight]);

  // Scroll target into view if needed - ensure both spotlight and message will be visible
  useEffect(() => {
    if (!isActive || !step?.targetSelector) return;

    const element = document.querySelector(step.targetSelector);
    if (element) {
      const rect = element.getBoundingClientRect();
      const padding = step.padding || 15;
      const viewportHeight = window.innerHeight;
      const messageHeight = isMobile ? 170 : 210;
      const gap = isMobile ? 12 : 24;
      
      // Calculate total vertical space needed (spotlight + message + gaps)
      const spotlightHeight = rect.height + padding * 2;
      const totalNeeded = spotlightHeight + messageHeight + gap * 2;
      
      // Check if element (with room for message) fits in viewport
      const topWithBuffer = rect.top - padding - gap;
      const bottomWithBuffer = rect.bottom + padding + gap + messageHeight;
      
      const needsScroll = topWithBuffer < 0 || bottomWithBuffer > viewportHeight;
      
      if (needsScroll) {
        // Calculate optimal scroll position to show both spotlight and message
        // Try to center the spotlight with room for message below
        const idealScrollBlock = totalNeeded > viewportHeight * 0.7 ? 'start' : 'center';
        
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: idealScrollBlock as ScrollLogicalPosition
        });
        
        // Recalculate positions after scroll completes
        setTimeout(calculateSpotlight, 600);
      }
    }
  }, [isActive, step, calculateSpotlight, isMobile]);

  const handleNext = () => {
    playHit();
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  };

  const handlePrev = () => {
    playHit();
    onPrev();
  };

  const handleSkip = () => {
    playHit();
    onSkip();
  };

  if (!isActive || !step) return null;

  // Determine avatar position class based on message position
  const avatarPositionClass = actualPosition === 'left' || actualPosition === 'right' 
    ? (actualPosition === 'right' ? 'avatar-left' : 'avatar-right')
    : 'avatar-left';

  return (
    <div className="church-spotlight-overlay">
      {/* Dark overlay with cutout */}
      <svg
        className="church-spotlight-mask"
        width="100%"
        height="100%"
        style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
      >
        <defs>
          <mask id="church-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="12"
                ry="12"
                fill="black"
                className={`church-spotlight-cutout ${isTransitioning ? 'transitioning' : ''}`}
              />
            )}
          </mask>
        </defs>

        {/* Dark overlay with mask applied */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(26, 15, 10, 0.82)"
          mask="url(#church-spotlight-mask)"
        />
      </svg>

      {/* Spotlight border glow */}
      {spotlight && (
        <div
          className="church-spotlight-glow"
          style={{
            position: 'fixed',
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            zIndex: 1001,
            pointerEvents: 'none',
            borderRadius: '12px',
            boxShadow: `
              0 0 30px rgba(255, 215, 0, 0.5),
              0 0 60px rgba(255, 215, 0, 0.3),
              inset 0 0 20px rgba(184, 134, 11, 0.2)
            `,
            border: '2px solid rgba(255, 215, 0, 0.6)',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}

      {/* Message box with priest avatar */}
      <div
        ref={messageRef}
        className={`church-message-container ${actualPosition} ${avatarPositionClass}`}
        style={{
          position: 'fixed',
          zIndex: 1002,
          pointerEvents: 'all',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(messagePosition && {
            top: messagePosition.top,
            bottom: messagePosition.bottom,
            left: messagePosition.left,
            right: messagePosition.right,
            transform: messagePosition.transform,
            maxWidth: messagePosition.maxWidth,
          }),
        }}
      >
        <div className="church-message-content">
          {/* Priest avatar */}
          <div className="church-priest-avatar-wrapper">
            <div className="church-avatar-halo" />
            <img
              src="/avatars/priest.png"
              alt="Father Satoshi"
              className="church-priest-avatar"
            />
          </div>

          {/* Message box */}
          <div className="church-message-box">
            <div className="church-message-header">
              <span className="church-message-icon">✝</span>
              <span className="church-message-title">{step.title}</span>
            </div>

            <p className="church-message-text">{step.message}</p>

            <div className="church-message-actions">
              {isFirstStep ? (
                <button className="church-tour-btn secondary" onClick={handleSkip}>
                  Skip Tour
                </button>
              ) : (
                <button className="church-tour-btn secondary" onClick={handlePrev}>
                  ← Back
                </button>
              )}

              <button className="church-tour-btn primary" onClick={handleNext}>
                {isLastStep ? 'Begin Journey ✝' : 'Continue →'}
              </button>
            </div>

            {/* Progress dots */}
            <div className="church-tour-progress">
              {steps.map((_, index) => (
                <span
                  key={index}
                  className={`church-progress-dot ${
                    index === currentStep ? 'active' : index < currentStep ? 'completed' : ''
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inline styles for the tour */}
      <style>{`
        .church-spotlight-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          pointer-events: none;
        }

        .church-spotlight-mask {
          pointer-events: all;
        }

        .church-spotlight-cutout {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .church-spotlight-cutout.transitioning {
          opacity: 0.5;
        }

        .church-message-container {
          width: auto;
        }

        .church-message-container.center {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .church-message-content {
          display: flex;
          align-items: flex-end;
          gap: 16px;
        }

        .church-message-container.avatar-right .church-message-content {
          flex-direction: row-reverse;
        }

        .church-priest-avatar-wrapper {
          position: relative;
          flex-shrink: 0;
        }

        .church-avatar-halo {
          position: absolute;
          inset: -12px;
          background: radial-gradient(circle, rgba(255, 215, 0, 0.4) 0%, transparent 70%);
          border-radius: 50%;
          animation: churchHaloPulse 2s ease-in-out infinite;
        }

        @keyframes churchHaloPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.8; }
        }

        .church-priest-avatar {
          width: 90px;
          height: 90px;
          object-fit: contain;
          image-rendering: pixelated;
          filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.5));
          animation: priestBounce 3s ease-in-out infinite;
          position: relative;
          z-index: 1;
        }

        @keyframes priestBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        .church-message-box {
          background: linear-gradient(135deg, #f5f0e1 0%, #e8dcc4 100%);
          border: 3px solid #b8860b;
          border-radius: 12px;
          padding: 18px;
          flex: 1;
          box-shadow:
            0 0 25px rgba(255, 215, 0, 0.3),
            0 10px 40px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.5);
          position: relative;
        }

        .church-message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .church-message-icon {
          color: #b8860b;
          font-size: 18px;
          filter: drop-shadow(0 0 4px rgba(184, 134, 11, 0.5));
        }

        .church-message-title {
          font-family: 'Cinzel', 'Crimson Text', Georgia, serif;
          font-size: 13px;
          font-weight: 700;
          color: #2c1810;
          letter-spacing: 0.02em;
        }

        .church-message-text {
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 14px;
          color: #3d2817;
          line-height: 1.55;
          margin-bottom: 14px;
        }

        .church-message-actions {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .church-tour-btn {
          padding: 10px 16px;
          border-radius: 8px;
          font-family: 'Crimson Text', Georgia, serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          flex: 1;
          text-align: center;
        }

        .church-tour-btn.primary {
          background: linear-gradient(135deg, #b8860b 0%, #8b6914 100%);
          border: 2px solid #ffd700;
          color: #f5f0e1;
          box-shadow: 0 4px 15px rgba(184, 134, 11, 0.4);
        }

        .church-tour-btn.primary:hover {
          background: linear-gradient(135deg, #d4a017 0%, #b8860b 100%);
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(184, 134, 11, 0.5);
        }

        .church-tour-btn.secondary {
          background: transparent;
          border: 2px solid #5d4037;
          color: #5d4037;
        }

        .church-tour-btn.secondary:hover {
          background: rgba(93, 64, 55, 0.1);
          border-color: #3d2817;
          color: #3d2817;
        }

        .church-tour-progress {
          display: flex;
          justify-content: center;
          gap: 6px;
          margin-top: 12px;
        }

        .church-progress-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #c9b896;
          transition: all 0.3s ease;
        }

        .church-progress-dot.active {
          background: #b8860b;
          box-shadow: 0 0 10px rgba(184, 134, 11, 0.7);
          transform: scale(1.3);
        }

        .church-progress-dot.completed {
          background: #5d4037;
        }

        /* Tablet adjustments */
        @media (max-width: 768px) and (min-width: 481px) {
          .church-priest-avatar {
            width: 65px;
            height: 65px;
          }

          .church-avatar-halo {
            inset: -8px;
          }

          .church-message-box {
            padding: 14px;
          }

          .church-message-title {
            font-size: 11px;
          }

          .church-message-text {
            font-size: 13px;
            margin-bottom: 12px;
          }

          .church-tour-btn {
            padding: 9px 14px;
            font-size: 12px;
          }
        }

        /* Mobile adjustments */
        @media (max-width: 480px) {
          .church-message-container {
            width: auto;
            max-width: calc(100vw - 16px);
          }

          .church-message-content {
            flex-direction: row;
            align-items: flex-start;
            gap: 10px;
          }

          .church-message-container.avatar-right .church-message-content {
            flex-direction: row-reverse;
          }

          .church-message-container.top .church-message-content,
          .church-message-container.bottom .church-message-content {
            flex-direction: row;
          }

          .church-message-container.top.avatar-right .church-message-content,
          .church-message-container.bottom.avatar-right .church-message-content {
            flex-direction: row-reverse;
          }

          .church-priest-avatar-wrapper {
            display: flex;
            align-items: center;
            flex-shrink: 0;
          }

          .church-priest-avatar {
            width: 50px;
            height: 50px;
          }

          .church-avatar-halo {
            inset: -6px;
          }

          .church-message-box {
            padding: 12px;
            flex: 1;
            min-width: 0;
          }

          .church-message-header {
            margin-bottom: 6px;
            gap: 6px;
          }

          .church-message-icon {
            font-size: 14px;
          }

          .church-message-title {
            font-size: 9px;
            line-height: 1.3;
          }

          .church-message-text {
            font-size: 11px;
            line-height: 1.4;
            margin-bottom: 10px;
          }

          .church-message-actions {
            gap: 8px;
          }

          .church-tour-btn {
            padding: 8px 10px;
            font-size: 10px;
            border-radius: 6px;
          }

          .church-tour-progress {
            margin-top: 8px;
            gap: 5px;
          }

          .church-progress-dot {
            width: 5px;
            height: 5px;
          }
        }

        /* Very small screens */
        @media (max-width: 360px) {
          .church-message-container {
            max-width: calc(100vw - 12px);
          }

          .church-message-content {
            gap: 8px;
          }

          .church-priest-avatar {
            width: 42px;
            height: 42px;
          }

          .church-avatar-halo {
            inset: -5px;
          }

          .church-message-box {
            padding: 10px;
          }

          .church-message-header {
            margin-bottom: 5px;
          }

          .church-message-title {
            font-size: 8px;
          }

          .church-message-text {
            font-size: 10px;
            line-height: 1.35;
            margin-bottom: 8px;
          }

          .church-message-actions {
            gap: 6px;
          }

          .church-tour-btn {
            padding: 7px 8px;
            font-size: 9px;
          }

          .church-tour-progress {
            margin-top: 6px;
          }

          .church-progress-dot {
            width: 4px;
            height: 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default SpotlightTour;
