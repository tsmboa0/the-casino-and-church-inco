import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChurchProgress {
  // Tour state
  isFirstVisit: boolean;
  tourCompleted: boolean;
  currentTourStep: number;
  tourSkipped: boolean;

  // Achievement tracking
  questsCompleted: number;
  sermonsWritten: number;
  totalVisits: number;
  lastVisit: number;

  // Faith milestones (to prevent showing the same milestone twice)
  faithMilestonesShown: {
    reached25: boolean;
    reached50: boolean;
    reached75: boolean;
    reached100: boolean;
  };

  // Quest milestones
  questMilestonesShown: {
    first: boolean;
    fifth: boolean;
    tenth: boolean;
  };

  // Sermon milestones
  sermonMilestonesShown: {
    first: boolean;
  };
}

interface ChurchProgressActions {
  // Tour actions
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  completeTour: () => void;
  skipTour: () => void;
  resetTour: () => void;

  // Visit tracking
  recordVisit: () => void;

  // Quest/Sermon tracking
  incrementQuestsCompleted: () => void;
  incrementSermonsWritten: () => void;

  // Milestone management
  markFaithMilestoneShown: (milestone: 'reached25' | 'reached50' | 'reached75' | 'reached100') => void;
  markQuestMilestoneShown: (milestone: 'first' | 'fifth' | 'tenth') => void;
  markSermonMilestoneShown: (milestone: 'first') => void;

  // Check if milestone should be shown
  shouldShowFaithMilestone: (faithProgress: number) => 'reached25' | 'reached50' | 'reached75' | 'reached100' | null;
  shouldShowQuestMilestone: () => 'first' | 'fifth' | 'tenth' | null;
  shouldShowSermonMilestone: () => 'first' | null;

  // Check if returning after absence
  isReturningAfterAbsence: () => boolean;

  // Reset (for testing)
  resetAllProgress: () => void;
}

const initialState: ChurchProgress = {
  isFirstVisit: true,
  tourCompleted: false,
  currentTourStep: 0,
  tourSkipped: false,
  questsCompleted: 0,
  sermonsWritten: 0,
  totalVisits: 0,
  lastVisit: 0,
  faithMilestonesShown: {
    reached25: false,
    reached50: false,
    reached75: false,
    reached100: false,
  },
  questMilestonesShown: {
    first: false,
    fifth: false,
    tenth: false,
  },
  sermonMilestonesShown: {
    first: false,
  },
};

export const useChurchProgress = create<ChurchProgress & ChurchProgressActions>()(
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

      // Quest/Sermon tracking
      incrementQuestsCompleted: () => set((state) => ({
        questsCompleted: state.questsCompleted + 1,
      })),

      incrementSermonsWritten: () => set((state) => ({
        sermonsWritten: state.sermonsWritten + 1,
      })),

      // Milestone management
      markFaithMilestoneShown: (milestone) => set((state) => ({
        faithMilestonesShown: {
          ...state.faithMilestonesShown,
          [milestone]: true,
        },
      })),

      markQuestMilestoneShown: (milestone) => set((state) => ({
        questMilestonesShown: {
          ...state.questMilestonesShown,
          [milestone]: true,
        },
      })),

      markSermonMilestoneShown: (milestone) => set((state) => ({
        sermonMilestonesShown: {
          ...state.sermonMilestonesShown,
          [milestone]: true,
        },
      })),

      // Check if milestone should be shown
      shouldShowFaithMilestone: (faithProgress: number) => {
        const { faithMilestonesShown } = get();
        
        if (faithProgress >= 100 && !faithMilestonesShown.reached100) {
          return 'reached100';
        }
        if (faithProgress >= 75 && !faithMilestonesShown.reached75) {
          return 'reached75';
        }
        if (faithProgress >= 50 && !faithMilestonesShown.reached50) {
          return 'reached50';
        }
        if (faithProgress >= 25 && !faithMilestonesShown.reached25) {
          return 'reached25';
        }
        return null;
      },

      shouldShowQuestMilestone: () => {
        const { questsCompleted, questMilestonesShown } = get();
        
        if (questsCompleted >= 10 && !questMilestonesShown.tenth) {
          return 'tenth';
        }
        if (questsCompleted >= 5 && !questMilestonesShown.fifth) {
          return 'fifth';
        }
        if (questsCompleted >= 1 && !questMilestonesShown.first) {
          return 'first';
        }
        return null;
      },

      shouldShowSermonMilestone: () => {
        const { sermonsWritten, sermonMilestonesShown } = get();
        
        if (sermonsWritten >= 1 && !sermonMilestonesShown.first) {
          return 'first';
        }
        return null;
      },

      // Check if returning after absence (more than 24 hours)
      isReturningAfterAbsence: () => {
        const { lastVisit, totalVisits } = get();
        if (totalVisits === 0) return false;
        
        const hoursSinceLastVisit = (Date.now() - lastVisit) / (1000 * 60 * 60);
        return hoursSinceLastVisit > 24;
      },

      // Reset (for testing)
      resetAllProgress: () => set(initialState),
    }),
    {
      name: 'church-progress-storage',
    }
  )
);

// Tour step configuration
export const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to The Church',
    message: "Welcome, child. I am Father Satoshi. Allow me to guide you through these sacred halls where believers build real value...",
    highlight: null,
  },
  {
    id: 'faith',
    title: 'The Chalice of Faith',
    message: "This holy chalice measures your FAITH. Complete sacred quests to fill it with divine light. Your FAITH can be redeemed for rewards in the Casino realm...",
    highlight: 'faith-chalice',
  },
  {
    id: 'scripture',
    title: 'The Sacred Scripture',
    message: "These ancient pages contain your sacred quests. Each one is a calling to support real projects and spread the word of blockchain...",
    highlight: 'scripture',
  },
  {
    id: 'navigation',
    title: 'Turn the Pages',
    message: "Turn the pages to discover different callings. Each quest offers unique ways to earn FAITH and contribute to the faithful community...",
    highlight: 'scripture-controls',
  },
  {
    id: 'balance',
    title: 'Your Spiritual Balance',
    message: "Remember - true wealth is purpose, not speculation. What you build here has lasting meaning beyond mere numbers...",
    highlight: null,
  },
  {
    id: 'blessing',
    title: 'Go Forth',
    message: "Go forth, child. May your FAITH guide you on this righteous path. Return often, and your light shall grow ever stronger...",
    highlight: null,
  },
];

// Milestone messages
export const MILESTONE_MESSAGES = {
  // Faith milestones
  reached25: {
    icon: '✨',
    badge: 'Faith Awakened',
    message: "Your light grows stronger, child. The community feels your presence beginning to shine...",
  },
  reached50: {
    icon: '🌟',
    badge: 'Half-Enlightened',
    message: "Halfway to true enlightenment! Your dedication inspires others to follow the righteous path...",
  },
  reached75: {
    icon: '💫',
    badge: 'Beacon of Hope',
    message: "You are becoming a beacon of hope. Few pilgrims reach such heights of devotion...",
  },
  reached100: {
    icon: '👑',
    badge: 'Divine Blessing',
    message: "DIVINE BLESSING! You have achieved true enlightenment. The faithful throughout the realm rejoice in your glory!",
  },

  // Quest milestones
  firstQuest: {
    icon: '📜',
    badge: 'First Offering',
    message: "Your first offering pleases the faithful! Continue on this righteous path and your FAITH shall flourish...",
  },
  fifthQuest: {
    icon: '⭐',
    badge: 'True Pilgrim',
    message: "A true pilgrim emerges! Your commitment to the community is remarkable. The faithful recognize your devotion...",
  },
  tenthQuest: {
    icon: '🏆',
    badge: 'Devoted Disciple',
    message: "Ten sacred quests completed! You have proven yourself a devoted disciple. Your name shall be remembered...",
  },

  // Sermon milestones
  firstSermon: {
    icon: '✍️',
    badge: 'Voice of Faith',
    message: "Your words carry the weight of conviction. The faithful will remember your first sermon for ages to come...",
  },

  // Return after absence
  returnAfterAbsence: {
    icon: '🕯️',
    badge: 'Welcome Back',
    message: "Welcome back, child. We have missed your light in these sacred halls. Your return brings warmth to the faithful...",
  },
};

