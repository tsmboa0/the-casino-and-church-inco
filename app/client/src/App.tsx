import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletProvider } from "./lib/wallet/WalletProvider";
import CasinoChurchHomepage from "./components/CasinoChurchHomepage";
import CasinoRealm from "./components/CasinoRealm";
import ChurchRealm from "./components/ChurchRealm";
import WriteSermons from "./components/church/WriteSermons";
import ProphecyQuests from "./components/church/ProphecyQuests";
import QuestPage from "./components/church/QuestPage";
import SlotMachine from "./components/games/SlotMachine";
import MemecoinSimulator from "./components/games/MemecoinSimulator";
import Roulette from "./components/games/Roulette";
import Aviator from "./components/games/Aviator";
import CoinFlip from "./components/games/CoinFlip";
import GamesCatalog from "./components/games/GamesCatalog";
import "./styles/homepage.css";
import "./styles/wallet.css";

const ProtectedRoute = ({ element }: { element: JSX.Element }) => {
  const wallet = useWallet();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const isConnecting =
    wallet.connecting || wallet.wallet?.adapter?.connecting === true;
  const isConnected = wallet.connected && !!wallet.publicKey;

  // Give the wallet a brief window to finish auto-connecting before redirecting.
  useEffect(() => {
    if (isConnected || isConnecting) {
      setShouldRedirect(false);
      return;
    }
    const timer = setTimeout(() => setShouldRedirect(true), 800);
    return () => clearTimeout(timer);
  }, [isConnected, isConnecting]);

  if (!isConnected && isConnecting) {
    return (
      <div className="loading-screen">
        <div className="pixel-loader">Connecting wallet...</div>
      </div>
    );
  }

  console.log("connection from app.tsx is: ",isConnected);

  if (!isConnected && shouldRedirect) {
    return <Navigate to="/" replace />;
  }

  return element;
};

function App() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Simple loading delay to ensure assets are ready
    const timer = setTimeout(() => setIsLoaded(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <div className="pixel-loader">Loading...</div>
      </div>
    );
  }

  return (
    <WalletProvider>
      <Router>
        <div className="app-container">
          <Routes>
            <Route path="/" element={<CasinoChurchHomepage />} />
            <Route path="/casino" element={<ProtectedRoute element={<CasinoRealm />} />} />
            <Route path="/casino/roulette" element={<ProtectedRoute element={<Roulette />} />} />
            <Route path="/casino/slots" element={<ProtectedRoute element={<SlotMachine />} />} />
            
            <Route path="/casino/aviator" element={<ProtectedRoute element={<Aviator />} />} />
            <Route path="/casino/coinflip" element={<ProtectedRoute element={<CoinFlip />} />} />
            <Route path="/casino/memecoin" element={<ProtectedRoute element={<MemecoinSimulator />} />} />
            <Route path="/casino/games" element={<ProtectedRoute element={<GamesCatalog />} />} />
            <Route path="/church" element={<ProtectedRoute element={<ChurchRealm />} />} />
            <Route path="/church/sermons" element={<ProtectedRoute element={<WriteSermons />} />} />
            <Route path="/church/quests" element={<ProtectedRoute element={<ProphecyQuests />} />} />
            <Route path="/church/quests/:questId" element={<ProtectedRoute element={<QuestPage />} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </WalletProvider>
  );
}

export default App;
