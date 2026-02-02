use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RouletteBet {
    pub player: Pubkey,
    pub seed: u128,
    pub slot: u64,
    pub amount: u64,
    /// Bet type: 0 = straight, 1 = color (0 red, 1 black)
    pub bet_type: u8,
    pub choice: u8,
    pub bump: u8,
}

impl RouletteBet {
    pub fn to_slice(&self) -> Vec<u8> {
        let mut s = self.player.to_bytes().to_vec();
        s.extend_from_slice(&self.seed.to_le_bytes());
        s.extend_from_slice(&self.slot.to_le_bytes());
        s.extend_from_slice(&self.amount.to_le_bytes());
        s.extend_from_slice(&[self.bet_type, self.choice, self.bump]);
        s
    }
}

#[account]
#[derive(InitSpace)]
pub struct CoinflipBet {
    pub player: Pubkey,
    pub seed: u128,
    pub slot: u64,
    pub amount: u64,
    /// 0 = heads, 1 = tails
    pub choice: u8,
    pub bump: u8,
}

impl CoinflipBet {
    pub fn to_slice(&self) -> Vec<u8> {
        let mut s = self.player.to_bytes().to_vec();
        s.extend_from_slice(&self.seed.to_le_bytes());
        s.extend_from_slice(&self.slot.to_le_bytes());
        s.extend_from_slice(&self.amount.to_le_bytes());
        s.extend_from_slice(&[self.choice, self.bump]);
        s
    }
}

#[account]
#[derive(InitSpace)]
pub struct SlotSpin {
    pub player: Pubkey,
    pub seed: u128,
    pub slot: u64,
    pub amount: u64,
    pub bump: u8,
}

impl SlotSpin {
    pub fn to_slice(&self) -> Vec<u8> {
        let mut s = self.player.to_bytes().to_vec();
        s.extend_from_slice(&self.seed.to_le_bytes());
        s.extend_from_slice(&self.slot.to_le_bytes());
        s.extend_from_slice(&self.amount.to_le_bytes());
        s.extend_from_slice(&[self.bump]);
        s
    }
}

#[account]
#[derive(InitSpace)]
pub struct AviatorBet {
    pub player: Pubkey,
    pub seed: u128,
    pub slot: u64,
    pub amount: u64,
    /// desired cashout multiplier in basis points (e.g. 15000 = 1.5x)
    pub target_multiplier_bps: u32,
    pub bump: u8,
}

impl AviatorBet {
    pub fn to_slice(&self) -> Vec<u8> {
        let mut s = self.player.to_bytes().to_vec();
        s.extend_from_slice(&self.seed.to_le_bytes());
        s.extend_from_slice(&self.slot.to_le_bytes());
        s.extend_from_slice(&self.amount.to_le_bytes());
        s.extend_from_slice(&self.target_multiplier_bps.to_le_bytes());
        s.extend_from_slice(&[self.bump]);
        s
    }
}

// =============================================================================
// NEW: Unified game result with encrypted handles for Inco integration
// =============================================================================

/// Game type enum for unified GameResult
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum GameType {
    /// Roulette: bet_type 0=straight (36x), 1=color (2x)
    Roulette { bet_type: u8 },
    /// Coinflip: 50/50 heads or tails
    Coinflip,
    /// Slot: 3 reels with tiered payouts
    Slot,
    /// Aviator: cashout before crash
    Aviator { target_multiplier_bps: u32 },
}

/// Unified game result storing encrypted handles
/// Used for all casino games with Inco privacy integration
#[account]
#[derive(InitSpace)]
pub struct GameResult {
    /// Player who placed the bet
    pub player: Pubkey,
    /// Type of game played
    pub game_type: GameType,
    /// Unique seed for this game
    pub seed: u128,
    /// Amount bet in lamports
    pub bet_amount: u64,
    /// Slot when bet was placed
    pub slot: u64,
    
    // Encrypted handles (stored as u128, inner value of Euint128)
    /// Player's encrypted choice (e.g., coinflip side, roulette number)
    pub choice_handle: u128,
    /// Encrypted payout amount (0 if lost, winnings if won)
    pub payout_handle: u128,
    
    /// Array of random result handles - supports up to 4 random values
    /// [0] = primary result (coinflip flip, roulette spin, aviator crash, slot reel1)
    /// [1] = slot reel2 (0 for other games)
    /// [2] = slot reel3 (0 for other games)
    /// [3] = reserved for future use
    pub random_handles: [u128; 4],
    
    /// Whether rewards have been claimed
    pub claimed: bool,
    /// PDA bump
    pub bump: u8,
}