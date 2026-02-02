// import { useState, useEffect } from 'react';
// import { useWallet } from '@solana/wallet-adapter-react';
// import { Honeycomb, client as honeycombClient } from '../lib/honeycomb';

// interface Profile {
//   name: string;
//   bio: string;
//   pfp?: string;
// }

// export const useProfile = () => {
//   const { publicKey, signMessage } = useWallet();
//   const [profile, setProfile] = useState<Profile | null>(null);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const createProfile = async () => {
//     if (!publicKey) {
//       setError('No wallet connected');
//       return;
//     }

//     setIsLoading(true);
//     setError(null);

//     try {
//       const honeycomb = new Honeycomb();
      
//       // Generate a random player name
//       const playerNames = [
//         'Lucky Gambler',
//         'Holy Roller',
//         'Crypto Priest',
//         'DeFi Devotee',
//         'Blockchain Believer',
//         'Solana Saint',
//         'Token Trader',
//         'Protocol Prophet',
//         'Yield Seeker',
//         'Stake Master'
//       ];
      
//       const randomName = playerNames[Math.floor(Math.random() * playerNames.length)];
//       const randomBio = `A ${randomName.toLowerCase()} exploring the realms of Casino & Church.`;

//       const userProfile = await honeycomb.getOrCreateUserProfile(
//         publicKey.toString(),
//         randomName,
//         randomBio,
//         undefined,
//         useWallet()
//       );

//       if (userProfile) {
//         setProfile({
//           name: userProfile.info?.name || randomName,
//           bio: userProfile.info?.bio || randomBio,
//           pfp: userProfile.info?.pfp
//         });
//       }
//     } catch (err) {
//       console.error('Error creating profile:', err);
//       setError('Failed to create profile');
//     } finally {
//       setIsLoading(false);
//     }
//   };

// //   // Create profile when wallet connects
// //   useEffect(() => {
// //     if (publicKey && !profile) {
// //       createProfile();
// //     }
// //   }, [publicKey]);

//   return {
//     profile,
//     isLoading,
//     error,
//     createProfile
//   };
// }; 