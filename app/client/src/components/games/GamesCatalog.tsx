import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/games-catalog.css";
import { useAudio } from "../../lib/stores/useAudio";

const GamesCatalog: React.FC = () => {
  const navigate = useNavigate();
  const { playHit } = useAudio();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string>("");

  const gameImages = useMemo(() => ([
    // A large selection pulled from public assets; safe to repeat
    "104bf8ff8e8cae125_b0f8ac20-2f18-41e4-a507-7c9ac9f1d17a.jpeg",
    "432f10db51a752e51_f72c6605-3e1f-4ac0-9ef4-26c295758d36.jpeg",
    "48326e27605f6372_ee2458f4-2506-4088-87f8-f07ccbd0bb34.jpeg",
    "23cdf924ea48b55a_5880d743-1c9b-42d5-b0a8-6e36b07221f9.jpeg",
    "e4c67651336c2310c_bd6b4ffa-b4fd-4202-9ffe-4b45c43e70a4.jpeg",
    "c003fb1d8c362be9_aa7b3b97-3d24-40a3-8e6b-2edd307ea619.jpeg",
    "234e4c9bc789eb9c_442f8a65-8e19-4cce-9a4d-9849da2aff0d.jpeg",
    "f28bf9ec81eae7e4_b89988ab-9e37-46f6-b180-667d24b01c64.jpeg",
    "210f14d91965f37ad_4d4634cd-ece6-4507-a3f5-d10aba49ad00.jpeg",
    "e51f75ff07bd101e2_a926dc6a-6ebd-41c2-a5ac-ea67512ff58e.jpeg",
    "7db7d2c3ea401c81_9dcf394c-e57e-4647-8047-9af39ec255d1.webp",
    "7d5e5282cb47ea36_534ae4d6-3309-40a6-b569-2657cd98847c.webp",
    "49f3e2ee006b84ef_c0ea9322-0eec-4c69-803f-dc5667410eda.webp",
    "63ef62f7b322fa3d_67de8a0a-997d-4d45-ab51-93c664318464.webp",
    "a5d7af894dc1ece7_76853c0c-d363-4e08-9f2f-abb79c91c129.webp",
    "b4c12f1fe3fe98b4_53466184-d335-4084-a1b8-255512181680.webp",
    "e7f593ca2fd451fc_19d20e2a-f0b4-4cd6-a802-6c28533ae2fd.webp",
    "9b88963babf9f6102_392c6ab0-e018-4ba4-9da6-807713311a22.webp",
    "9ae7f1bf5aef347c_3ca5975e-a804-4013-a712-7eaa878efa3f.webp",
    "f16b8c32e2a554dd_2f5a16f7-d9ab-4582-8983-5b452a1bccd1.webp",
    "474ab282cd4607c2_122bfd24-b411-426b-b997-d300236e6a28.webp",
    "1547aaac3e765d36_a144bf08-14a6-4d1c-a4b4-9e9596f452e5.webp",
    "831d5f8101ddfb7ce_c447d162-5fb1-4361-9849-25b93af174e2.webp",
    "c106f63f2c70ab96a_84b38d0e-193f-47a7-b185-9de9a891ce1a.webp",
    "bb12eb29875b3785_cce56120-437e-4c10-b18e-898de2707905.webp",
    "100f7474e164b1f1b_85bdb7cc-dc77-4bf3-beb2-229eab7782cb.webp",
    "2e9b885310b1c9f43_5ff2e9a8-515e-44d2-aa70-d93a26f56c65.webp",
    "6731101953477f894_ae0fcb7b-80fb-40b8-a41a-754445899450.webp",
    "c6564499dd9a5d17_07fa8223-dacf-4686-a325-152f5720abe9.webp",
    "f2238c5ce9afbb32_f38915c4-55e6-4c6c-9ace-c451d413b82c.webp"
  ]), []);

  const handleBack = () => navigate(-1);

  const handleOpenGame = async (index: number) => {
    playHit();
    const base = gameImages[index] || "";
    const readable = base.replace(/[_-]/g, " ").replace(/\.[a-zA-Z0-9]+$/, "");
    setSelectedTitle(readable.toUpperCase());
    setShowComingSoon(true);
  };

  return (
    <div className="games-catalog-page">
      <div className="catalog-header">
        <button className="back-button" onClick={handleBack}>CASINO ← BACK</button>
        <div className="catalog-title">
          <span className="title-outline">CASINO</span>
          <span className="title-glow">GAMES</span>
        </div>
      </div>
      <div className="catalog-filters">
        <button className="pill active">Lobby</button>
        <button className="pill">Featured</button>
        <button className="pill">Popular</button>
        <button className="pill">Daily Hunt</button>
        <button className="pill">Jackpots</button>
      </div>
      <div className="catalog-grid">
        {gameImages.map((file, i) => (
          <button
            key={file + i}
            className="catalog-card"
            onClick={() => handleOpenGame(i)}
            title="Play"
          >
            <img src={`/assets/casino_games/${file}`} alt="casino game" />
          </button>
        ))}
      </div>
      {showComingSoon && (
        <div className="coming-modal-overlay" role="dialog" aria-modal="true">
          <div className="coming-modal">
            <div className="coming-header">
              <span className="coming-title">COMING SOON</span>
            </div>
            <div className="coming-body">
              <div className="soon-line">{selectedTitle || "NEW GAME"}</div>
              <div className="soon-sub">We are shuffling this table. Stay tuned!</div>
            </div>
            <div className="coming-actions">
              <button className="pixel-btn" onClick={() => { playHit(); setShowComingSoon(false); }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamesCatalog;


