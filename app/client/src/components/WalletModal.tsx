import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="wallet-modal-overlay" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wallet-modal-content">
          <div className="wallet-modal-header">
            <h2 className="wallet-modal-title">WALLET REQUIRED</h2>
            <button className="wallet-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          
          <div className="wallet-modal-body">
            <div className="wallet-modal-icon">🔐</div>
            <p className="wallet-modal-message">
              You must connect your Solana wallet to enter the realms.
            </p>
            <p className="wallet-modal-subtitle">
              Connect your wallet to start your journey in The Casino & The Church.
            </p>
          </div>
          
          <div className="wallet-modal-footer">
            <WalletMultiButton className="wallet-modal-connect-button">
              CONNECT WALLET
            </WalletMultiButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletModal; 