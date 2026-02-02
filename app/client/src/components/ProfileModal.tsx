import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    name: string;
    bio: string;
    pfp?: string;
  } | null;
  walletAddress: string;
}

const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  walletAddress,
}) => {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/90 border-2 border-yellow-400 text-white font-['Press_Start_2P'] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-yellow-400 text-center text-lg">
            PLAYER PROFILE
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 p-4">
          {/* Profile Avatar */}
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20 border-2 border-yellow-400">
              <AvatarImage src={profile?.pfp} alt={profile?.name} />
              <AvatarFallback className="bg-gray-800 text-yellow-400 text-xl font-bold">
                {profile?.name ? getInitials(profile.name) : '??'}
              </AvatarFallback>
            </Avatar>
            
            <div className="text-center">
              <h3 className="text-yellow-400 text-sm font-bold mb-1">
                {profile?.name || 'Anonymous Player'}
              </h3>
              <p className="text-gray-300 text-xs">
                {truncateAddress(walletAddress)}
              </p>
            </div>
          </div>

          {/* Profile Bio */}
          {profile?.bio && (
            <div className="w-full text-center">
              <h4 className="text-yellow-400 text-xs font-bold mb-2">
                BIO
              </h4>
              <p className="text-gray-300 text-xs leading-relaxed">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Stats Placeholder */}
          <div className="w-full border-t border-yellow-400/30 pt-4">
            <h4 className="text-yellow-400 text-xs font-bold mb-3 text-center">
              STATS
            </h4>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-gray-400 text-xs">CASINO WINS</p>
                <p className="text-yellow-400 text-sm font-bold">0</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">CHURCH POINTS</p>
                <p className="text-yellow-400 text-sm font-bold">0</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal; 