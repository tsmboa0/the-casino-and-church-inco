import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAudio } from "../../lib/stores/useAudio";
import "../../styles/church-flipbook.css";

export type FlipPage = {
  id: string;
  title: string;
  subtitle?: string;
  art?: string;
  route?: string;
  comingSoon?: boolean;
};

type Props = {
  pages: FlipPage[];
  onSelect: (page: FlipPage) => void;
};

const FlipBook: React.FC<Props> = ({ pages, onSelect }) => {
  const { playHit } = useAudio();
  const [index, setIndex] = useState(0); // left page index
  const [isFlipping, setIsFlipping] = useState(false);
  const [direction, setDirection] = useState<"ltor" | "rtol" | null>(null);
  const [showParticles, setShowParticles] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Touch swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const leftPage = pages[index];
  const rightPage = pages[index + 1];

  const canPrev = index > 0 && !isFlipping;
  const canNext = index + 2 < pages.length && !isFlipping;

  // Calculate total spreads for page indicator
  const totalSpreads = Math.ceil(pages.length / 2);
  const currentSpread = Math.floor(index / 2);

  const handlePrev = useCallback(() => {
    if (!canPrev) return;
    playHit();
    setDirection("ltor");
    setIsFlipping(true);
    setShowParticles(true);
    
    setTimeout(() => {
      setIndex((i) => Math.max(0, i - 2));
      setIsFlipping(false);
      setDirection(null);
      setShowParticles(false);
    }, 600);
  }, [canPrev, playHit]);

  const handleNext = useCallback(() => {
    if (!canNext) return;
    playHit();
    setDirection("rtol");
    setIsFlipping(true);
    setShowParticles(true);
    
    setTimeout(() => {
      setIndex((i) => Math.min(pages.length - 2, i + 2));
      setIsFlipping(false);
      setDirection(null);
      setShowParticles(false);
    }, 600);
  }, [canNext, playHit, pages.length]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrev, handleNext]);

  // Touch swipe support - using touch events for better mobile support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    
    // Only trigger swipe if horizontal movement is greater than vertical
    // and the swipe distance is at least 50px
    const minSwipeDistance = 50;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        // Swipe right = previous page
        handlePrev();
      } else {
        // Swipe left = next page
        handleNext();
      }
    }
    
    touchStartX.current = null;
    touchStartY.current = null;
  }, [handlePrev, handleNext]);

  // Get first letter for illuminated initial
  const getInitial = (title: string) => {
    return title.charAt(0).toUpperCase();
  };

  // Generate particles for page turn effect
  const particles = useMemo(() => {
    return [...Array(8)].map((_, i) => ({
      tx: (Math.random() - 0.5) * 100,
      ty: (Math.random() - 0.5) * 80 - 20,
      delay: Math.random() * 0.2,
    }));
  }, [showParticles]);

  const renderPageContent = (page: FlipPage | undefined, side: 'left' | 'right') => {
    if (!page) {
      return (
        <div className="scripture-empty">
          <span className="scripture-empty-icon">📜</span>
          <span className="scripture-empty-text">More scriptures coming soon...</span>
        </div>
      );
    }

    return (
      <div className="scripture-content">
        <div className="scripture-inner-border" />
        
        {page.art && (
          <img 
            className="scripture-art" 
            src={page.art} 
            alt={page.title}
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/avatars/priest.png';
            }}
          />
        )}
        
        <span className="scripture-initial">{getInitial(page.title)}</span>
        <div className="scripture-title">{page.title}</div>
        
        {page.subtitle && (
          <div className="scripture-subtitle">"{page.subtitle}"</div>
        )}
        
        {!page.comingSoon ? (
          <button 
            className="scripture-btn"
            onClick={() => onSelect(page)}
          >
            ✝ Begin Pilgrimage
          </button>
        ) : (
          <div className="scripture-coming-soon">
            <span className="coming-soon-text">Coming Soon</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="sacred-flipbook" 
      ref={containerRef} 
      id="scripture"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation buttons container - positioned for tour targeting */}
      <div className="book-nav-container" id="scripture-nav">
        <button 
          className="book-nav prev" 
          onClick={handlePrev} 
          aria-label="Previous pages" 
          disabled={!canPrev}
        >
          ◀
        </button>
        
        <span className="nav-hint">Swipe or tap</span>
        
        <button 
          className="book-nav next" 
          onClick={handleNext} 
          aria-label="Next pages" 
          disabled={!canNext}
        >
          ▶
        </button>
      </div>

      <div className="book-wrapper">
        {/* Ornate frame */}
        <div className="book-frame" />
        
        <div className={`book-stage ${isFlipping ? `flipping-${direction}` : ""}`}>
          {/* Book spine */}
          <div className="book-spine" />

          {/* Left page */}
          <div className="scripture-page left">
            <div className="page-texture" />
            {renderPageContent(leftPage, 'left')}
          </div>

          {/* Right page */}
          <div className="scripture-page right">
            <div className="page-texture" />
            {renderPageContent(rightPage, 'right')}
          </div>

          {/* Turning page animation */}
          {direction && (
            <div className={`turning-page ${direction === 'ltor' ? 'from-left' : 'from-right'}`}>
              <div className="page-texture" />
            </div>
          )}

          {/* Page turn particles */}
          {showParticles && (
            <div className="page-turn-particles">
              {particles.map((p, i) => (
                <span
                  key={i}
                  className="page-particle"
                  style={{
                    left: '50%',
                    top: '50%',
                    '--tx': `${p.tx}px`,
                    '--ty': `${p.ty}px`,
                    animationDelay: `${p.delay}s`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Page indicator */}
      <div className="page-indicator">
        <div className="page-dots">
          {[...Array(totalSpreads)].map((_, i) => (
            <span 
              key={i} 
              className={`page-dot ${i === currentSpread ? 'active' : ''}`}
            />
          ))}
        </div>
        <span>Page {currentSpread + 1} of {totalSpreads}</span>
      </div>
    </div>
  );
};

export default FlipBook;
