import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useIsMobile } from '../hooks/use-is-mobile';
// import { useProfile } from '../hooks/useProfile';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import ProfileModal from './ProfileModal';

const WalletConnectButton: React.FC = () => {
  const { publicKey } = useWallet();
  const isMobile = useIsMobile();
  // const { profile, isLoading } = useProfile();
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Truncate wallet address for display
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowProfileModal(true);
  };

  return (
    <>
      <div className="wallet-connect-container">
        {publicKey ? (
          <div className="wallet-profile-container">
            <WalletMultiButton className="wallet-connect-button">
              <span className="wallet-address">
                {isMobile ? truncateAddress(publicKey.toString()) : truncateAddress(publicKey.toString())}
              </span>
            </WalletMultiButton>
            
            <button 
              className="profile-avatar-button"
              onClick={handleProfileClick}
              disabled={false}
            >
              <Avatar className="profile-avatar">
                <AvatarImage src={''} alt={''} />
                <AvatarFallback className="profile-avatar-fallback">
                  {getInitials('')}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        ) : (
          <WalletMultiButton className="wallet-connect-button">
            {publicKey ? (
              <span className="wallet-address">
                {truncateAddress(publicKey)}
              </span>
            ) : (
              <span className="connect-text">CONNECT</span>
            )}
          </WalletMultiButton>
        )}
      </div>

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profile={null}
        walletAddress={publicKey?.toString() || ''}
      />
    </>
  );
};

export default WalletConnectButton; 