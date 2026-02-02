import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface ProgressState {
  // Progress values (0-100)
  luckProgress: number;
  faithProgress: number;
  
  // Balances
  casinoBalance: number;
  churchBalance: number;
  
  // Time tracking for cross-realm decay
  lastCasinoTime: number;
  lastChurchTime: number;
  
  // Actions
  updateLuckProgress: (change: number) => void;
  updateFaithProgress: (change: number) => void;
  updateCasinoBalance: (change: number) => void;
  updateChurchBalance: (change: number) => void;
  setLastCasinoTime: () => void;
  setLastChurchTime: () => void;
  applyCrossRealmDecay: () => void;
  resetProgress: () => void;
}

// Load from localStorage
const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem('casino-church-progress');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading progress from localStorage:', error);
  }
  
  // Default values - Start at 0% for both progress bars
  return {
    luckProgress: 0,
    faithProgress: 0,
    casinoBalance: 1000,
    churchBalance: 100,
    lastCasinoTime: Date.now(),
    lastChurchTime: Date.now(),
  };
};

// Save to localStorage
const saveToStorage = (state: ProgressState) => {
  try {
    localStorage.setItem('casino-church-progress', JSON.stringify({
      luckProgress: state.luckProgress,
      faithProgress: state.faithProgress,
      casinoBalance: state.casinoBalance,
      churchBalance: state.churchBalance,
      lastCasinoTime: state.lastCasinoTime,
      lastChurchTime: state.lastChurchTime,
    }));
  } catch (error) {
    console.error('Error saving progress to localStorage:', error);
  }
};

export const useProgress = create<ProgressState>((set, get) => {
  const initialState = loadFromStorage();
  
  return {
    ...initialState,
      
      updateLuckProgress: (change: number) => {
        set((state: ProgressState) => {
          const newProgress = Math.max(0, Math.min(100, state.luckProgress + change));
          const newState = { ...state, luckProgress: newProgress };
          saveToStorage(newState);
          return newState;
        });
      },
      
      updateFaithProgress: (change: number) => {
        set((state: ProgressState) => {
          const newProgress = Math.max(0, Math.min(100, state.faithProgress + change));
          const newState = { ...state, faithProgress: newProgress };
          saveToStorage(newState);
          return newState;
        });
      },
      
      updateCasinoBalance: (change: number) => {
        set((state: ProgressState) => {
          const newBalance = Math.max(0, state.casinoBalance + change);
          const newState = { ...state, casinoBalance: newBalance };
          saveToStorage(newState);
          return newState;
        });
      },
      
      updateChurchBalance: (change: number) => {
        set((state: ProgressState) => {
          const newBalance = Math.max(0, state.churchBalance + change);
          const newState = { ...state, churchBalance: newBalance };
          saveToStorage(newState);
          return newState;
        });
      },
      
      setLastCasinoTime: () => {
        set((state: ProgressState) => {
          const newState = { ...state, lastCasinoTime: Date.now() };
          saveToStorage(newState);
          return newState;
        });
      },
      
      setLastChurchTime: () => {
        set((state: ProgressState) => {
          const newState = { ...state, lastChurchTime: Date.now() };
          saveToStorage(newState);
          return newState;
        });
      },
      
      applyCrossRealmDecay: () => {
        set((state: ProgressState) => {
          const now = Date.now();
          const casinoTimeDiff = now - state.lastCasinoTime;
          const churchTimeDiff = now - state.lastChurchTime;
          
          // Much slower decay rate: 0.1% per minute (60000ms) spent in the other realm
          const casinoDecayRate = 0.1 / 60000; // 0.1% per minute
          const churchDecayRate = 0.1 / 60000; // 0.1% per minute
          
          let newFaithProgress = state.faithProgress;
          let newLuckProgress = state.luckProgress;
          
          // Only apply decay if we're NOT in the respective realm
          // If we're in casino, faith decays (but luck stays constant)
          // If we're in church, luck decays (but faith stays constant)
          
          // Check if we're currently in casino (casino time is more recent than church time)
          const inCasino = casinoTimeDiff < churchTimeDiff;
          
          if (inCasino && casinoTimeDiff > 30000) {
            // In casino, faith decays slowly
            const faithDecay = Math.min(1, casinoTimeDiff * casinoDecayRate); // Max 1% decay
            newFaithProgress = Math.max(0, newFaithProgress - faithDecay);
          } else if (!inCasino && churchTimeDiff > 30000) {
            // In church, luck decays slowly
            const luckDecay = Math.min(1, churchTimeDiff * churchDecayRate); // Max 1% decay
            newLuckProgress = Math.max(0, newLuckProgress - luckDecay);
          }
          
          const newState = {
            ...state,
            faithProgress: newFaithProgress,
            luckProgress: newLuckProgress,
          };
          
          saveToStorage(newState);
          return newState;
        });
      },
      
      resetProgress: () => {
        const defaultState: ProgressState = {
          luckProgress: 0,
          faithProgress: 0,
          casinoBalance: 1000,
          churchBalance: 100,
          lastCasinoTime: Date.now(),
          lastChurchTime: Date.now(),
          updateLuckProgress: () => {},
          updateFaithProgress: () => {},
          updateCasinoBalance: () => {},
          updateChurchBalance: () => {},
          setLastCasinoTime: () => {},
          setLastChurchTime: () => {},
          applyCrossRealmDecay: () => {},
          resetProgress: () => {},
        };
        set(defaultState);
        saveToStorage(defaultState);
      },
    };
  });

// Note: Auto-save is handled within each action function 