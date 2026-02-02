import React from 'react';

interface FaithChaliceProps {
  faithProgress: number;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const FaithChalice: React.FC<FaithChaliceProps> = ({ 
  faithProgress, 
  showLabel = true,
  size = 'medium' 
}) => {
  const isHighFaith = faithProgress >= 75;
  const fillPercent = Math.min(100, Math.max(0, faithProgress));
  
  // Calculate clip path for fill level (from bottom)
  // The chalice bowl is roughly from y=10 to y=35 in the viewBox
  // We need to clip from bottom up based on faith percentage
  const fillY = 35 - (fillPercent / 100) * 25; // 25 is the height of the bowl area

  const sizeClasses = {
    small: { width: 35, height: 42 },
    medium: { width: 50, height: 60 },
    large: { width: 70, height: 84 },
  };

  const { width, height } = sizeClasses[size];

  return (
    <div className={`faith-chalice-container ${isHighFaith ? 'high-faith' : ''}`}>
      <div className="faith-chalice" style={{ width, height }}>
        <div className="chalice-glow" />
        <svg 
          className="chalice-svg" 
          viewBox="0 0 50 60" 
          fill="none"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            {/* Gradient for the golden fill */}
            <linearGradient id="chaliceGradient" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#b8860b" />
              <stop offset="50%" stopColor="#ffd700" />
              <stop offset="100%" stopColor="#ffe566" />
            </linearGradient>
            
            {/* Glow filter */}
            <filter id="chaliceGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Clip path for fill animation */}
            <clipPath id={`fillClip-${fillPercent}`}>
              <rect x="0" y={fillY} width="50" height={60 - fillY} />
            </clipPath>
          </defs>
          
          {/* Chalice outline */}
          <path 
            className="chalice-outline"
            d="M15 10 
               Q10 10 8 15 
               Q5 22 10 30 
               Q15 38 22 40 
               L22 45 
               L18 48 
               Q15 50 15 52 
               L15 55 
               L35 55 
               L35 52 
               Q35 50 32 48 
               L28 45 
               L28 40 
               Q35 38 40 30 
               Q45 22 42 15 
               Q40 10 35 10 
               Z"
            stroke="#ffd700"
            strokeWidth="2"
            fill="none"
            filter="url(#chaliceGlow)"
          />
          
          {/* Chalice fill (clipped based on faith level) */}
          <path 
            className="chalice-fill"
            d="M15 10 
               Q10 10 8 15 
               Q5 22 10 30 
               Q15 38 22 40 
               L22 45 
               L18 48 
               Q15 50 15 52 
               L15 55 
               L35 55 
               L35 52 
               Q35 50 32 48 
               L28 45 
               L28 40 
               Q35 38 40 30 
               Q45 22 42 15 
               Q40 10 35 10 
               Z"
            fill="url(#chaliceGradient)"
            clipPath={`url(#fillClip-${fillPercent})`}
            style={{ 
              opacity: 0.9,
              transition: 'clip-path 0.5s ease' 
            }}
          />

          {/* Inner glow when filling */}
          {fillPercent > 0 && (
            <ellipse 
              cx="25" 
              cy={35 - (fillPercent / 100) * 15} 
              rx="12" 
              ry="3"
              fill="rgba(255, 237, 102, 0.6)"
              style={{
                filter: 'blur(2px)',
                transition: 'cy 0.5s ease'
              }}
            />
          )}

          {/* Highlight on the cup */}
          <path 
            d="M18 15 Q16 20 18 25"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        {/* Particle effects for high faith */}
        {isHighFaith && (
          <div className="chalice-particles">
            {[...Array(5)].map((_, i) => (
              <span 
                key={i} 
                className="chalice-particle"
                style={{
                  left: `${20 + Math.random() * 60}%`,
                  animationDelay: `${i * 0.3}s`,
                  animationDuration: `${1.5 + Math.random()}s`
                }}
              />
            ))}
          </div>
        )}
      </div>
      
      {showLabel && (
        <>
          <span className="faith-label">FAITH</span>
          <span className="faith-value">{faithProgress.toFixed(0)}%</span>
        </>
      )}

      <style>{`
        .chalice-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        
        .chalice-particle {
          position: absolute;
          bottom: 30%;
          width: 4px;
          height: 4px;
          background: #ffd700;
          border-radius: 50%;
          box-shadow: 0 0 6px #ffd700;
          animation: chaliceParticleRise 2s ease-out infinite;
        }
        
        @keyframes chaliceParticleRise {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.8;
          }
          100% {
            transform: translateY(-40px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default FaithChalice;

