import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "../hooks/use-is-mobile";
import { useAudio } from "../lib/stores/useAudio";
import { useProgress } from "../lib/stores/useProgress";
import { useSolBalance } from "../hooks/useSolBalance";
import { useChurchProgress, MILESTONE_MESSAGES } from "../lib/stores/useChurchProgress";
import "../styles/church-realm.css";
import FlipBook, { FlipPage } from "./church/FlipBook";
import FaithChalice from "./church/FaithChalice";
import PriestGuide from "./church/PriestGuide";

// Priest blessings that rotate
const PRIEST_BLESSINGS = [
  "Welcome, child. Choose your sacred calling and let your FAITH guide you...",
  "The faithful await your contribution. What path will you walk today?",
  "Every quest completed brings light to the community. Choose wisely...",
  "Your presence strengthens us all. The scriptures await your touch...",
];

// Chapter definitions
const CHAPTERS = [
  { id: 'all', name: 'All Chapters', icon: '📖' },
  { id: 'random', name: 'Random', icon: '🎲' },
  { id: 'jupiter', name: 'Jupiter', icon: '🪐' },
  { id: 'kamino', name: 'Kamino', icon: '🏛️' },
  { id: 'pumpfun', name: 'Pump.fun', icon: '🐸' },
  { id: 'Inco', name: 'Inco Privacy', icon: '🔮' },
  { id: 'general', name: 'General', icon: '✝' },
];

// Extended FlipPage type with chapter
interface ChapterFlipPage extends FlipPage {
  chapter: string;
}

const ChurchRealm: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [isGoingBack, setIsGoingBack] = useState(false);
  const [churchMusic, setChurchMusic] = useState<HTMLAudioElement | null>(null);
  const [currentBlessing, setCurrentBlessing] = useState(0);
  const [showMilestone, setShowMilestone] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState('all');
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  
  // Progress system integration
  const { 
    faithProgress,
    updateFaithProgress,
    setLastChurchTime, 
    applyCrossRealmDecay 
  } = useProgress();
  
  const { balance: solBalance } = useSolBalance();
  
  const { 
    backgroundMusic, 
    isMuted,
    stopBackgroundMusic,
    playHit,
  } = useAudio();

  // Church progress tracking
  const {
    recordVisit,
    shouldShowFaithMilestone,
    markFaithMilestoneShown,
    isReturningAfterAbsence,
  } = useChurchProgress();

  // All pages with chapter assignments
  const allPages: ChapterFlipPage[] = useMemo(() => ([
    // Jupiter quests
    { id: 'jupiter-1', chapter: 'jupiter', title: 'Jupiter Liquidity Quest', subtitle: 'Route the best swaps for the faithful', art: '/brands/jupiter.jpg', route: '/church/quests/jupiter' },
    { id: 'jupiter-2', chapter: 'jupiter', title: 'Jupiter DCA Disciple', subtitle: 'Master dollar-cost averaging', art: '/brands/jupiter.jpg', route: '/church/quests/jupiter-dca', comingSoon: true },
    
    // Kamino quests
    { id: 'kamino-1', chapter: 'kamino', title: 'Kamino Vault Steward', subtitle: 'Optimize risk-adjusted yield', art: '/brands/kamino.png', route: '/church/quests/kamino' },
    { id: 'kamino-2', chapter: 'kamino', title: 'Kamino Lending Light', subtitle: 'Illuminate the lending pools', art: '/brands/kamino.png', route: '/church/quests/kamino-lend', comingSoon: true },
    
    // Pump.fun quests
    { id: 'pumpfun-1', chapter: 'pumpfun', title: 'Pump.fun Evangelism', subtitle: 'Spread the word of memes', art: '/brands/pumpfun.jpeg', route: '/church/quests/pumpfun' },
    { id: 'pumpfun-2', chapter: 'pumpfun', title: 'Meme Creator Ministry', subtitle: 'Create tokens for the faithful', art: '/brands/pumpfun.jpeg', route: '/church/quests/pumpfun-create', comingSoon: true },
    
    // Arcium quests
    { id: 'inco-1', chapter: 'inco', title: 'Inco Privacy Pilgrim', subtitle: 'Index and reveal sacred insights', art: '/brands/inco-logo.jpeg', route: '/church/quests/inco' },
    { id: 'inco-2', chapter: 'inco', title: 'Inco Privacy Pilgrim', subtitle: 'Protect the faithful\'s secrets', art: '/brands/inco-logo.jpeg', route: '/church/quests/inco', comingSoon: true },
    
    // General quests
    { id: 'write-sermons', chapter: 'general', title: 'Write Sacred Sermons', subtitle: 'Share wisdom and build belief', art: '/avatars/priest.png', route: '/church/sermons' },
    // { id: 'prophecy-quests', chapter: 'general', title: 'Prophecy Quests', subtitle: 'Complete sacred missions', art: '/brands/arcium.jpg', comingSoon: true },
  ]), []);

  // Shuffle array helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Filter and shuffle pages based on selected chapter
  // Always put "coming soon" pages at the END of the book
  const filteredPages = useMemo(() => {
    let pages: ChapterFlipPage[];
    
    if (selectedChapter === 'all') {
      pages = allPages;
    } else if (selectedChapter === 'random') {
      // For random, only shuffle available quests, keep coming soon at end
      const available = allPages.filter(p => !p.comingSoon);
      const comingSoon = allPages.filter(p => p.comingSoon);
      pages = [...shuffleArray(available), ...comingSoon];
    } else {
      pages = allPages.filter(page => page.chapter === selectedChapter);
    }
    
    // Sort: available quests first, then coming soon at the end
    const availablePages = pages.filter(p => !p.comingSoon);
    const comingSoonPages = pages.filter(p => p.comingSoon);
    const sortedPages = [...availablePages, ...comingSoonPages];
    
    // Ensure we have at least 2 pages for the flipbook (left and right)
    if (sortedPages.length === 1) {
      return [...sortedPages, { ...sortedPages[0], id: `${sortedPages[0].id}-placeholder` }];
    }
    
    return sortedPages;
  }, [selectedChapter, allPages]);

  // Handle chapter selection
  const handleChapterSelect = (chapterId: string) => {
    playHit();
    setSelectedChapter(chapterId);
    setIsChapterDropdownOpen(false);
  };

  // Get current chapter info
  const currentChapter = CHAPTERS.find(c => c.id === selectedChapter) || CHAPTERS[0];

  // Initialize church music and handle transition
  useEffect(() => {
    // Stop homepage music
    if (backgroundMusic) {
      stopBackgroundMusic();
    }

    // Initialize church music
    const churchAudio = new Audio('/sounds/church_realm_music.mp3');
    churchAudio.loop = true;
    churchAudio.volume = 0.6;
    churchAudio.preload = 'auto';
    setChurchMusic(churchAudio);

    // Record visit
    recordVisit();

    // Start church music after transition
    const transitionTimer = setTimeout(() => {
      setIsTransitioning(false);
      if (!isMuted && churchAudio) {
        churchAudio.play().catch(error => {
          console.log("Church music autoplay prevented:", error);
        });
      }
    }, 2500);

    return () => {
      clearTimeout(transitionTimer);
      if (churchAudio) {
        churchAudio.pause();
        churchAudio.currentTime = 0;
      }
    };
  }, [backgroundMusic, stopBackgroundMusic, isMuted, recordVisit]);

  // Apply cross-realm decay and track church time
  useEffect(() => {
    applyCrossRealmDecay();
    setLastChurchTime();
    
    const decayInterval = setInterval(() => {
      applyCrossRealmDecay();
    }, 30000);

    return () => {
      clearInterval(decayInterval);
    };
  }, [applyCrossRealmDecay, setLastChurchTime]);

  // Check for faith milestones
  useEffect(() => {
    const milestone = shouldShowFaithMilestone(faithProgress);
    if (milestone && !isTransitioning) {
      // Small delay to not interrupt transition
      const timer = setTimeout(() => {
        setShowMilestone(milestone);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [faithProgress, shouldShowFaithMilestone, isTransitioning]);

  // Check for return after absence
  useEffect(() => {
    if (!isTransitioning && isReturningAfterAbsence()) {
      const timer = setTimeout(() => {
        setShowMilestone('returnAfterAbsence');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, isReturningAfterAbsence]);

  // Rotate blessings
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBlessing((prev) => (prev + 1) % PRIEST_BLESSINGS.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.chapters-dropdown')) {
        setIsChapterDropdownOpen(false);
      }
    };
    
    if (isChapterDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isChapterDropdownOpen]);

  const handleMilestoneDismiss = useCallback(() => {
    if (showMilestone && showMilestone !== 'returnAfterAbsence') {
      markFaithMilestoneShown(showMilestone as any);
    }
    setShowMilestone(null);
  }, [showMilestone, markFaithMilestoneShown]);

  const playHoverSound = () => {
    playHit();
  };

  const handleActivitySelect = (page: FlipPage) => {
    playHit();
    
    if (page.comingSoon || !page.route) {
      return;
    }
    
    navigate(page.route);
  };

  const handleBackToHome = () => {
    playHit();
    if (churchMusic) {
      churchMusic.pause();
      churchMusic.currentTime = 0;
    }
    setIsGoingBack(true);
    setTimeout(() => {
      navigate('/');
    }, 1500);
  };

  // Generate sacred particles
  const particles = useMemo(() => {
    return [...Array(15)].map((_, i) => ({
      type: i % 3 === 0 ? 'spark' : 'dust',
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 8}s`,
      duration: `${10 + Math.random() * 8}s`,
    }));
  }, []);

  // Transition screen
  if (isTransitioning) {
    return (
      <div className="church-transition-screen">
        <div className="church-transition-content">
          <span className="church-cross-animation">✝</span>
          <div className="church-transition-text">Entering the sacred realm...</div>
        </div>
      </div>
    );
  }

  // Going back transition
  if (isGoingBack) {
    return (
      <div className="church-transition-screen">
        <div className="church-transition-content">
          <span className="church-cross-animation">✝</span>
          <div className="church-transition-text">Returning to the crossroads...</div>
        </div>
      </div>
    );
  }

  // Get milestone data if showing
  const milestoneData = showMilestone 
    ? MILESTONE_MESSAGES[showMilestone as keyof typeof MILESTONE_MESSAGES]
    : null;

  return (
    <div className={`church-realm-container ${isMobile ? 'mobile' : 'desktop'}`}>
      {/* Background Image - No blur! */}
      <div className="church-background">
        <img src="/scenes/church_scene.png" alt="Church Realm" />
        <div className="church-vignette" />
      </div>

      {/* Divine Light Rays */}
      <div className="light-rays-container">
        <div className="light-ray" />
        <div className="light-ray" />
        <div className="light-ray" />
      </div>

      {/* Sacred Particles */}
      <div className="particles-container">
        {particles.map((particle, i) => (
          <span
            key={i}
            className={`sacred-particle ${particle.type}`}
            style={{
              left: particle.left,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            }}
          />
        ))}
      </div>

      {/* Main Shell */}
      <div className="church-shell">
        {/* Top Bar */}
        <header className="church-topbar">
          <button 
            className="church-back-button"
            onClick={handleBackToHome}
            onMouseEnter={playHoverSound}
          >
            <span className="church-back-icon">←</span>
            <span className="church-back-text">Exit</span>
          </button>

          <div className="church-title">
            <span className="church-title-icon">✝</span>
            <span className="church-title-text">THE CHURCH</span>
          </div>

          <div className="church-top-actions">
            {/* Faith Chalice */}
            <div id="faith-chalice">
              <FaithChalice 
                faithProgress={faithProgress} 
                size={isMobile ? 'small' : 'medium'}
              />
            </div>

            {/* Audio Toggle */}
            <button
              className="church-audio-toggle"
              onClick={() => {
                if (churchMusic) {
                  if (churchMusic.paused) {
                    churchMusic.play();
                  } else {
                    churchMusic.pause();
                  }
                }
              }}
              title="Toggle Music"
            >
              {churchMusic && !churchMusic.paused ? "🔊" : "🔇"}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="church-main-content">
          {/* Priest Section - ID for tour targeting */}
          <div className="priest-section" id="priest-section">
            <div className="priest-avatar-container">
              <div className="priest-halo" />
              <img 
                src="/avatars/priest.png" 
                alt="Father Satoshi" 
                className="priest-avatar"
              />
            </div>
            
            <div className="priest-blessing">
              <p className="priest-blessing-text">
                "{PRIEST_BLESSINGS[currentBlessing]}"
              </p>
            </div>
          </div>

          {/* Scripture Section - ID for tour targeting */}
          <div className="scripture-section" id="scripture-section">
            <div className="scripture-header">
              <h1 className="scripture-title">SACRED SCRIPTURE</h1>
              <p className="scripture-subtitle">Choose your divine calling</p>
              
              {/* Chapters Dropdown */}
              <div className="chapters-dropdown" id="chapters-dropdown">
                <button 
                  className="chapters-dropdown-trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    playHit();
                    setIsChapterDropdownOpen(!isChapterDropdownOpen);
                  }}
                  onMouseEnter={playHoverSound}
                >
                  <span className="chapter-icon">{currentChapter.icon}</span>
                  <span className="chapter-name">{currentChapter.name}</span>
                  <span className={`chapter-arrow ${isChapterDropdownOpen ? 'open' : ''}`}>▼</span>
                </button>
                
                {isChapterDropdownOpen && (
                  <div className="chapters-dropdown-menu">
                    {CHAPTERS.map(chapter => (
                      <button
                        key={chapter.id}
                        className={`chapter-option ${selectedChapter === chapter.id ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChapterSelect(chapter.id);
                        }}
                        onMouseEnter={playHoverSound}
                      >
                        <span className="chapter-icon">{chapter.icon}</span>
                        <span className="chapter-name">{chapter.name}</span>
                        {selectedChapter === chapter.id && <span className="chapter-check">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <FlipBook
              pages={filteredPages}
              onSelect={handleActivitySelect}
            />
          </div>
        </div>
      </div>

      {/* Priest Guide (Tour System) */}
      <PriestGuide 
        onTourComplete={() => console.log('Tour completed!')}
        onMilestoneDismiss={() => console.log('Milestone dismissed')}
      />

      {/* Milestone Celebration Modal */}
      {showMilestone && milestoneData && (
        <div className="milestone-celebration">
          <div className="milestone-particles">
            {[...Array(20)].map((_, i) => {
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
            })}
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
      )}
    </div>
  );
};

export default ChurchRealm;
