import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Tour step configuration type
export interface CasinoTourStep {
  id: string;
  title: string;
  message: string;
  targetSelector: string | null; // CSS selector for target element, null for centered modal
  preferredPosition: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  padding?: number; // Extra padding around the spotlight
}

interface CasinoProgress {
  // Tour state
  isFirstVisit: boolean;
  tourCompleted: boolean;
  tourSkipped: boolean;
  currentTourStep: number;

  // Visit tracking
  totalVisits: number;
  lastVisit: number;
}

interface CasinoProgressActions {
  // Tour actions
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTour: () => void;

  // Visit tracking
  recordVisit: () => void;

  // Reset (for testing)
  resetAllProgress: () => void;
}

const initialState: CasinoProgress = {
  isFirstVisit: true,
  tourCompleted: false,
  tourSkipped: false,
  currentTourStep: 0,
  totalVisits: 0,
  lastVisit: 0,
};

export const useCasinoProgress = create<CasinoProgress & CasinoProgressActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Tour actions
      startTour: () => set({ currentTourStep: 0 }),

      nextTourStep: () => set((state) => ({
        currentTourStep: state.currentTourStep + 1
      })),

      prevTourStep: () => set((state) => ({
        currentTourStep: Math.max(0, state.currentTourStep - 1)
      })),

      completeTour: () => set({
        tourCompleted: true,
        isFirstVisit: false,
        currentTourStep: 0
      }),

      skipTour: () => set({
        tourSkipped: true,
        tourCompleted: true,
        isFirstVisit: false,
        currentTourStep: 0
      }),

      resetTour: () => set({
        isFirstVisit: true,
        tourCompleted: false,
        tourSkipped: false,
        currentTourStep: 0,
      }),

      // Visit tracking
      recordVisit: () => set((state) => ({
        totalVisits: state.totalVisits + 1,
        lastVisit: Date.now(),
        isFirstVisit: state.totalVisits === 0,
      })),

      // Reset all
      resetAllProgress: () => set(initialState),
    }),
    {
      name: 'casino-progress-storage',
    }
  )
);

// Tour steps configuration
export const CASINO_TOUR_STEPS: CasinoTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome, High Roller!',
    message: "I'm your guide through these neon halls. Let me show you around the Casino Realm where fortune favors the bold...",
    targetSelector: null,
    preferredPosition: 'auto',
  },
  {
    id: 'exit',
    title: 'Exit Button',
    message: "Need to leave? This button will take you back to the realm selection. But why would you want to leave when the cards are hot?",
    targetSelector: '#casino-exit-button',
    preferredPosition: 'bottom',
    padding: 15,
  },
  {
    id: 'wallet',
    title: 'Your Bankroll',
    message: "Keep an eye on your SOL balance here. This is your lifeline in the casino. Manage it wisely, or go all in - your choice!",
    targetSelector: '#casino-wallet-display',
    preferredPosition: 'bottom',
    padding: 15,
  },
  {
    id: 'luck-meter',
    title: 'The Luck Meter',
    message: "This mystical meter tracks your fortune. Win streaks boost it, losses drain it. Some say higher luck means better odds... but that's just superstition, right?",
    targetSelector: '#casino-luck-meter',
    preferredPosition: 'top',
    padding: 20,
  },
  {
    id: 'featured-deck',
    title: 'Featured Games',
    message: "Swipe through our hottest games! Each card reveals a different thrill. Tap the arrows or swipe to shuffle through the deck.",
    targetSelector: '#casino-featured-deck',
    preferredPosition: 'auto',
    padding: 25,
  },
  {
    id: 'filters',
    title: 'Game Categories',
    message: "Looking for something specific? Filter games by category - slots, roulette, table games, or trending picks. Find your poison!",
    targetSelector: '#casino-filters',
    preferredPosition: 'bottom',
    padding: 15,
  },
  {
    id: 'games-grid',
    title: 'All Games',
    message: "Browse the full collection here. Each game offers unique ways to test your luck. Click 'Play' to jump in or 'Info' to learn more.",
    targetSelector: '#casino-games-grid',
    preferredPosition: 'top',
    padding: 20,
  },
  {
    id: 'farewell',
    title: 'Ready to Roll?',
    message: "That's the tour! Remember: the house always has an edge, but legends are made by those who beat the odds. Now go chase that jackpot!",
    targetSelector: null,
    preferredPosition: 'auto',
  },
];

