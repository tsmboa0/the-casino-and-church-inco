import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

interface PhaserSceneProps {
  width: number;
  height: number;
  side: 'casino' | 'church';
}

class PixelScene extends Phaser.Scene {
  private side: 'casino' | 'church';

  constructor(side: 'casino' | 'church') {
    super({ key: `${side}Scene` });
    this.side = side;
  }

  preload() {
    // Create pixel art programmatically since we're avoiding external assets
    this.load.image('pixel', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
  }

  create() {
    const { width, height } = this.cameras.main;

    if (this.side === 'casino') {
      this.createCasinoEffects(width, height);
    } else {
      this.createChurchEffects(width, height);
    }
  }

  createCasinoEffects(width: number, height: number) {
    // Create flickering neon effects
    const colors = [0xff00ff, 0x00ffff, 0xffff00, 0xff0080];
    
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      const light = this.add.circle(x, y, 2, color);
      
      this.tweens.add({
        targets: light,
        alpha: { from: 0.3, to: 1 },
        duration: 1000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // Create scanning lines effect
    const scanLine = this.add.rectangle(0, 0, width, 2, 0x00ffff, 0.3);
    this.tweens.add({
      targets: scanLine,
      y: height,
      duration: 3000,
      repeat: -1,
      ease: 'Linear'
    });
  }

  createChurchEffects(width: number, height: number) {
    // Create gentle floating particles
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      
      const particle = this.add.circle(x, y, 1, 0xffd700, 0.6);
      
      this.tweens.add({
        targets: particle,
        y: y - 50,
        alpha: { from: 0.6, to: 0 },
        duration: 3000 + Math.random() * 2000,
        repeat: -1,
        ease: 'Sine.easeOut'
      });
    }

    // Create soft glow effect
    const centerX = width / 2;
    const centerY = height / 2;
    
    for (let radius = 20; radius < 100; radius += 20) {
      const glow = this.add.circle(centerX, centerY, radius, 0xffffff, 0.1);
      
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.05, to: 0.15 },
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }
}

const PhaserScene: React.FC<PhaserSceneProps> = ({ width, height, side }) => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width,
        height,
        parent: containerRef.current,
        backgroundColor: side === 'casino' ? '#0a0a0a' : '#1a1a2e',
        scene: new PixelScene(side),
        physics: {
          default: 'arcade',
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };

      gameRef.current = new Phaser.Game(config);
    }

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [width, height, side]);

  return <div ref={containerRef} className="phaser-container" />;
};

export default PhaserScene;
