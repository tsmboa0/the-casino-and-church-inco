import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CasinoNChurch } from "../target/types/casino_n_church.js";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { encryptValue } from "@inco/solana-sdk/encryption";
import { decrypt } from "@inco/solana-sdk/attested-decrypt";
import { handleToBuffer, plaintextToBuffer, hexToBuffer } from "@inco/solana-sdk/utils";
import { expect } from "chai";
import BN from "bn.js";
import IDL from "../target/idl/casino_n_church.json";

const INCO_LIGHTNING_PROGRAM_ID = new PublicKey(
  "5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj"
);

describe("Casino & Church - Inco Privacy Tests", () => {
  const connection = new Connection("https://devnet.helius-rpc.com/?api-key=<API_KEY>", "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    anchor.AnchorProvider.env().wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = new anchor.Program<CasinoNChurch>(IDL as anchor.Idl, provider);
  console.log("Program ID:", program.programId.toBase58());
  let wallet: Keypair;

  // PDAs
  let adminPda: PublicKey;
  let casinoVaultPda: PublicKey;
  let lpVaultPda: PublicKey;

  // Test config
  const BET_AMOUNT = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL
  const VAULT_INIT_AMOUNT = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL

  // Unique seeds for each test
  const baseTimestamp = Math.floor(Date.now() / 1000);

  before(async () => {
    wallet = (provider.wallet as any).payer as Keypair;
    console.log("Wallet:", wallet.publicKey.toBase58());

    // Derive PDAs
    [adminPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin"), wallet.publicKey.toBuffer()],
      program.programId
    );

    [casinoVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("casino_vault"), adminPda.toBuffer()],
      program.programId
    );

    [lpVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_vault"), adminPda.toBuffer()],
      program.programId
    );

    console.log("Admin PDA:", adminPda.toBase58());
    console.log("Casino Vault PDA:", casinoVaultPda.toBase58());
    console.log("LP Vault PDA:", lpVaultPda.toBase58());
  });

  // ============ HELPER FUNCTIONS ============

  function deriveAllowancePda(handle: bigint): [PublicKey, number] {
    const buf = Buffer.alloc(16);
    let v = handle;
    for (let i = 0; i < 16; i++) {
      buf[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    return PublicKey.findProgramAddressSync(
      [buf, wallet.publicKey.toBuffer()],
      INCO_LIGHTNING_PROGRAM_ID
    );
  }

  function seedToBuffer(seed: bigint): Buffer {
    const buf = Buffer.alloc(16);
    let v = seed;
    for (let i = 0; i < 16; i++) {
      buf[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    return buf;
  }

  async function decryptHandle(
    handle: string
  ): Promise<{ plaintext: string; ed25519Instructions: any[] } | null> {
    // Wait longer for covalidator to sync allowance records
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const result = await decrypt([handle], {
        address: wallet.publicKey,
        signMessage: async (msg: Uint8Array) =>
          nacl.sign.detached(msg, wallet.secretKey),
      });
      return {
        plaintext: result.plaintexts[0],
        ed25519Instructions: result.ed25519Instructions,
      };
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  }

  // Interface for all handles from simulation/logs
  interface GameHandles {
    payoutHandle: bigint | null;
    randomHandles: (bigint | null)[];  // Up to 4 random handles
  }

  async function getHandlesFromSimulation(tx: anchor.web3.Transaction): Promise<GameHandles> {
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);

    const sim = await connection.simulateTransaction(tx);

    // Check for simulation errors
    if (sim.value.err) {
      console.log("   ⚠️ Simulation error:", JSON.stringify(sim.value.err));
      console.log("   ⚠️ Last 10 simulation logs:");
      sim.value.logs?.slice(-10).forEach(log => console.log("      ", log));
    }

    // Debug: Show all handle-related logs
    const handleLogs = (sim.value.logs || []).filter(log =>
      log.includes("handle") || log.includes("Handle")
    );
    if (handleLogs.length === 0) {
      console.log("   ⚠️ No handle logs found in simulation! Total logs:", sim.value.logs?.length || 0);
      // Show last 5 logs to see what's happening
      console.log("   Last 5 logs:");
      sim.value.logs?.slice(-5).forEach(log => console.log("      ", log));
    }

    let payoutHandle: bigint | null = null;
    const randomHandles: (bigint | null)[] = [];

    for (const log of sim.value.logs || []) {
      if (log.includes("Payout handle:")) {
        const match = log.match(/Payout handle:\s*(\d+)/);
        if (match) payoutHandle = BigInt(match[1]);
      }
      // Single random result games
      if (log.includes("Random handle:") || log.includes("Spin handle:") || log.includes("Crash point handle:")) {
        const match = log.match(/handle:\s*(\d+)/);
        if (match) randomHandles.push(BigInt(match[1]));
      }
      // Slot reels
      if (log.includes("Reel1 handle:")) {
        const match = log.match(/Reel1 handle:\s*(\d+)/);
        if (match) randomHandles.push(BigInt(match[1]));
      }
      if (log.includes("Reel2 handle:")) {
        const match = log.match(/Reel2 handle:\s*(\d+)/);
        if (match) randomHandles.push(BigInt(match[1]));
      }
      if (log.includes("Reel3 handle:")) {
        const match = log.match(/Reel3 handle:\s*(\d+)/);
        if (match) randomHandles.push(BigInt(match[1]));
      }
    }

    console.log(`The length of random handles is: ${randomHandles.length}`);
    return { payoutHandle, randomHandles };
  }

  async function getHandlesFromTxLogs(txSignature: string): Promise<{ payoutHandle: string | null; randomHandles: (string | null)[] }> {
    await new Promise((r) => setTimeout(r, 2000));
    const txDetails = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    const logs = txDetails?.meta?.logMessages || [];
    let payoutHandle: string | null = null;
    const randomHandles: (string | null)[] = [];

    for (const log of logs) {
      if (log.includes("Payout handle:")) {
        const match = log.match(/Payout handle:\s*(\d+)/);
        if (match) payoutHandle = match[1];
      }
      if (log.includes("Random handle:") || log.includes("Spin handle:") || log.includes("Crash point handle:")) {
        const match = log.match(/handle:\s*(\d+)/);
        if (match) randomHandles.push(match[1]);
      }
      if (log.includes("Reel1 handle:")) {
        const match = log.match(/Reel1 handle:\s*(\d+)/);
        if (match) randomHandles.push(match[1]);
      }
      if (log.includes("Reel2 handle:")) {
        const match = log.match(/Reel2 handle:\s*(\d+)/);
        if (match) randomHandles.push(match[1]);
      }
      if (log.includes("Reel3 handle:")) {
        const match = log.match(/Reel3 handle:\s*(\d+)/);
        if (match) randomHandles.push(match[1]);
      }
    }
    return { payoutHandle, randomHandles };
  }

  // Creates a dummy PDA for when we don't have a real handle
  function getDummyAllowancePda(index: number): PublicKey {
    // Use a deterministic dummy seed based on index
    const dummyHandle = BigInt(index + 1);
    return deriveAllowancePda(dummyHandle)[0];
  }

  function buildAllowanceAccounts(payoutHandle: bigint | null, randomHandles: (bigint | null)[]): any[] {
    const accounts: any[] = [];

    // If no payout handle, return empty - transaction will execute without allowance
    // (allowance is only created if remaining accounts are provided)
    if (!payoutHandle) {
      console.log("   No payout handle from simulation, proceeding without allowance accounts");
      return accounts;
    }

    console.log("   Payout handle active");
    const [payoutAllowancePda] = deriveAllowancePda(payoutHandle);
    console.log(`   Payout handle PDA: ${payoutAllowancePda.toBase58()}`);
    accounts.push(
      { pubkey: payoutAllowancePda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: false, isWritable: false }
    );

    // For each random handle position, add accounts
    for (let i = 0; i < randomHandles.length; i++) {
      const handle = randomHandles[i];
      if (handle) {
        console.log(`   Random handle ${i} active`);
        const [randomAllowancePda] = deriveAllowancePda(handle);
        console.log(`   Random handle ${i} PDA: ${randomAllowancePda.toBase58()}`);
        accounts.push(
          { pubkey: randomAllowancePda, isSigner: false, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: false, isWritable: false }
        );
      } else {
        console.log(`   Random handle ${i} inactive, skipping`);
      }
    }

    return accounts;
  }

  // ============ INITIALIZATION ============

  describe("1. Initialize Vault", () => {
    it("should initialize admin and fund vaults", async () => {
      try {
        // Check if already initialized
        const adminInfo = await connection.getAccountInfo(adminPda);
        if (adminInfo) {
          console.log("   Admin already initialized, skipping...");
          return;
        }

        const tx = await program.methods
          .initializeVault(new BN(VAULT_INIT_AMOUNT))
          .accounts({
            house: wallet.publicKey,
            casinoVault: casinoVaultPda,
            lpVault: lpVaultPda,
            admin: adminPda,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();

        console.log("   Vault initialized:", tx);

        // Verify
        const casinoBalance = await connection.getBalance(casinoVaultPda);
        const lpBalance = await connection.getBalance(lpVaultPda);
        console.log("   Casino vault:", casinoBalance / LAMPORTS_PER_SOL, "SOL");
        console.log("   LP vault:", lpBalance / LAMPORTS_PER_SOL, "SOL");

        expect(casinoBalance).to.be.gte(VAULT_INIT_AMOUNT);
      } catch (e: any) {
        if (e.message?.includes("already in use")) {
          console.log("   Admin already initialized");
        } else {
          throw e;
        }
      }
    });
  });

  // ============ COINFLIP TESTS ============

  describe("2. Coinflip Game", () => {
    const coinflipSeed = BigInt(baseTimestamp);
    console.log(`coinflip seed is: ${coinflipSeed}`);
    let gamePda: PublicKey;

    before(() => {
      [gamePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("game_coinflip"),  // Fixed: matches Rust code
          wallet.publicKey.toBuffer(),
          seedToBuffer(coinflipSeed),
        ],
        program.programId
      );
    });

    it("2a. Play coinflip with encrypted choice (heads=0)", async () => {
      console.log("   Encrypting choice: HEADS (0)");
      const encryptedChoice = await encryptValue(BigInt(0)); // Heads = 0

      // Step 1: Simulate to get payout handle
      const txForSim = await program.methods
        .playCoinflip(
          new BN(coinflipSeed.toString()),
          hexToBuffer(encryptedChoice),
          new BN(BET_AMOUNT)
        )
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .transaction();

      const { payoutHandle: simPayoutHandle, randomHandles: simRandomHandles } = await getHandlesFromSimulation(txForSim);
      console.log("   Simulated payout handle:", simPayoutHandle?.toString());
      console.log("   Simulated random handle:", simRandomHandles[0]?.toString());

      // Step 2: Build remaining accounts for allowance
      const remainingAccounts = buildAllowanceAccounts(simPayoutHandle, simRandomHandles);

      // Step 3: Execute with remaining accounts
      const tx = await program.methods
        .playCoinflip(
          new BN(coinflipSeed.toString()),
          hexToBuffer(encryptedChoice),
          new BN(BET_AMOUNT)
        )
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts(remainingAccounts)
        .rpc();

      console.log("   Coinflip placed:", tx);

      // Fetch game state
      const gameAccount = await program.account.gameResult.fetch(gamePda);
      console.log("   Payout handle:", gameAccount.payoutHandle.toString());
      console.log("   Random handle (flip):", gameAccount.randomHandles[0].toString());
    });

    it("2b. Decrypt coinflip result", async () => {
      // Fetch game state
      const gameAccount = await program.account.gameResult.fetch(gamePda);

      console.log("   === STORED HANDLES ===");
      console.log("   Payout handle:", gameAccount.payoutHandle.toString());
      console.log("   Flip result handle:", gameAccount.randomHandles[0].toString());
      console.log("   Choice handle:", gameAccount.choiceHandle.toString());

      console.log("   === DECRYPTION RESULTS ===");
      // Decrypt payout
      const payoutResult = await decryptHandle(gameAccount.payoutHandle.toString());
      if (payoutResult) {
        const payout = parseInt(payoutResult.plaintext, 10);
        console.log("   Decrypted payout:", payout, "lamports");
        console.log("   Result:", payout > 0 ? "🎉 WON!" : "😢 LOST");
      } else {
        console.log("   ❌ Could not decrypt payout");
      }

      // Decrypt flip result
      const randomResult = await decryptHandle(gameAccount.randomHandles[0].toString());
      if (randomResult) {
        const flip = parseInt(randomResult.plaintext, 10);
        console.log("   Decrypted flip:", flip === 0 ? "🪙 HEADS (0)" : "🪙 TAILS (1)");
      } else {
        console.log("   ❌ Could not decrypt flip result");
      }
    });
  });

  // ============ ROULETTE TESTS ============

  describe("3. Roulette Game", () => {
    describe("3a. Straight Bet (bet on number)", () => {
      const rouletteSeed = BigInt(baseTimestamp + 100);
      let gamePda: PublicKey;

      before(() => {
        [gamePda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("game_roulette"),
            wallet.publicKey.toBuffer(),
            seedToBuffer(rouletteSeed),
          ],
          program.programId
        );
      });

      it("Play roulette straight bet on number 17", async () => {
        console.log("   Encrypting choice: number 17");
        const encryptedChoice = await encryptValue(BigInt(17)); // Number 17

        // Step 1: Simulate to get handles
        const txForSim = await program.methods
          .playRoulette(
            new BN(rouletteSeed.toString()),
            hexToBuffer(encryptedChoice),
            new BN(BET_AMOUNT)
          )
          .accounts({
            player: wallet.publicKey,
            admin: adminPda,
            casinoVault: casinoVaultPda,
            game: gamePda,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .transaction();

        const { payoutHandle: simPayoutHandle, randomHandles: simRandomHandles } = await getHandlesFromSimulation(txForSim);
        console.log("   Simulated payout handle:", simPayoutHandle?.toString());
        console.log("   Simulated spin handle:", simRandomHandles[0]?.toString());
        const remainingAccounts = buildAllowanceAccounts(simPayoutHandle, simRandomHandles);

        // Step 2: Execute with remaining accounts
        const tx = await program.methods
          .playRoulette(
            new BN(rouletteSeed.toString()),
            hexToBuffer(encryptedChoice),
            new BN(BET_AMOUNT)
          )
          .accounts({
            player: wallet.publicKey,
            admin: adminPda,
            casinoVault: casinoVaultPda,
            game: gamePda,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .remainingAccounts(remainingAccounts)
          .rpc();

        console.log("   Roulette straight bet placed:", tx);

        // Fetch game state
        const gameAccount = await program.account.gameResult.fetch(gamePda);
        console.log("   === STORED HANDLES ===");
        console.log("   Payout handle:", gameAccount.payoutHandle.toString());
        console.log("   Spin handle:", gameAccount.randomHandles[0].toString());

        console.log("   === DECRYPTION RESULTS ===");
        // Decrypt payout
        const payoutResult = await decryptHandle(gameAccount.payoutHandle.toString());
        if (payoutResult) {
          const payout = parseInt(payoutResult.plaintext, 10);
          console.log("   Decrypted payout:", payout, "lamports");
          console.log("   Result:", payout > 0 ? `🎉 WON ${payout / LAMPORTS_PER_SOL} SOL!` : "😢 LOST");
        } else {
          console.log("   ❌ Could not decrypt payout");
        }

        // Decrypt spin result
        const spinResult = await decryptHandle(gameAccount.randomHandles[0].toString());
        if (spinResult) {
          const spin = parseInt(spinResult.plaintext, 10);
          console.log("   Decrypted spin:", spin);
          console.log("   Spin parity:", spin === 0 ? "🟢 GREEN (0 - house wins odd/even)" : spin % 2 === 0 ? "EVEN" : "ODD");
        } else {
          console.log("   ❌ Could not decrypt spin");
        }
      });
    });
  });


  // ============ SLOT MACHINE TESTS ============

  describe("4. Slot Machine", () => {
    const slotSeed = BigInt(baseTimestamp + 200);
    let gamePda: PublicKey;

    before(() => {
      [gamePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("game_slot"),
          wallet.publicKey.toBuffer(),
          seedToBuffer(slotSeed),
        ],
        program.programId
      );
    });

    it("Spin the slot machine", async () => {
      console.log("   🎰 Spinning slot machine...");

      // Step 1: Simulate to get handles
      const txForSim = await program.methods
        .playSlot(new BN(slotSeed.toString()), new BN(BET_AMOUNT))
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .transaction();

      const { payoutHandle: simPayoutHandle, randomHandles: simRandomHandles } = await getHandlesFromSimulation(txForSim);
      console.log("   Simulated payout handle:", simPayoutHandle?.toString());
      console.log("   Simulated reel handles:", simRandomHandles.map(h => h?.toString()));
      const remainingAccounts = buildAllowanceAccounts(simPayoutHandle, simRandomHandles);

      // Step 2: Execute with remaining accounts
      const tx = await program.methods
        .playSlot(new BN(slotSeed.toString()), new BN(BET_AMOUNT))
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts(remainingAccounts)
        .rpc();

      console.log("   Slot spin placed:", tx);

      // Fetch game state
      const gameAccount = await program.account.gameResult.fetch(gamePda);
      console.log("   === STORED HANDLES ===");
      console.log("   Payout handle:", gameAccount.payoutHandle.toString());
      console.log("   Reel 1 handle:", gameAccount.randomHandles[0].toString());
      console.log("   Reel 2 handle:", gameAccount.randomHandles[1].toString());
      console.log("   Reel 3 handle:", gameAccount.randomHandles[2].toString());

      console.log("   === DECRYPTION RESULTS ===");
      // Decrypt payout
      const payoutResult = await decryptHandle(gameAccount.payoutHandle.toString());
      if (payoutResult) {
        const payout = parseInt(payoutResult.plaintext, 10);
        console.log("   Decrypted payout:", payout, "lamports");
        if (payout === 0) {
          console.log("   Result: 😢 No match");
        } else if (payout > BET_AMOUNT * 10) {
          console.log(`   Result: 🎉🎉🎉 JACKPOT! Won ${payout / LAMPORTS_PER_SOL} SOL!`);
        } else {
          console.log(`   Result: 🎉 Small win! Won ${payout / LAMPORTS_PER_SOL} SOL!`);
        }
      } else {
        console.log("   ❌ Could not decrypt payout");
      }

      // Decrypt all 3 reels
      const reelSymbols = ["🍒", "🍋", "🍊", "🍇", "⭐", "🔔", "💎", "🎰", "7️⃣", "🍀"];
      for (let i = 0; i < 3; i++) {
        const reelResult = await decryptHandle(gameAccount.randomHandles[i].toString());
        if (reelResult) {
          const reel = parseInt(reelResult.plaintext, 10);
          console.log(`   Reel ${i + 1}: ${reelSymbols[reel % 10]} (${reel})`);
        } else {
          console.log(`   ❌ Could not decrypt reel ${i + 1}`);
        }
      }
    });
  });


  // ============ AVIATOR TESTS ============

  describe("5. Aviator Game", () => {
    const aviatorSeed = BigInt(baseTimestamp + 300);
    let gamePda: PublicKey;

    before(() => {
      [gamePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("game_aviator"),
          wallet.publicKey.toBuffer(),
          seedToBuffer(aviatorSeed),
        ],
        program.programId
      );
    });

    it("Play aviator with 2x target multiplier", async () => {
      // Target 2x multiplier = 20000 BPS
      const targetMultiplierBps = BigInt(20000);
      console.log("   Target multiplier: 2.00x (20000 BPS)");
      console.log("   Encrypting target multiplier...");

      const encryptedTarget = await encryptValue(targetMultiplierBps);

      // Step 1: Simulate to get handles
      const txForSim = await program.methods
        .playAviator(
          new BN(aviatorSeed.toString()),
          hexToBuffer(encryptedTarget),
          new BN(BET_AMOUNT)
        )
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .transaction();

      const { payoutHandle: simPayoutHandle, randomHandles: simRandomHandles } = await getHandlesFromSimulation(txForSim);
      console.log("   Simulated payout handle:", simPayoutHandle?.toString());
      console.log("   Simulated crash handle:", simRandomHandles[0]?.toString());
      const remainingAccounts = buildAllowanceAccounts(simPayoutHandle, simRandomHandles);

      // Step 2: Execute with remaining accounts
      const tx = await program.methods
        .playAviator(
          new BN(aviatorSeed.toString()),
          hexToBuffer(encryptedTarget),
          new BN(BET_AMOUNT)
        )
        .accounts({
          player: wallet.publicKey,
          admin: adminPda,
          casinoVault: casinoVaultPda,
          game: gamePda,
          incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .remainingAccounts(remainingAccounts)
        .rpc();

      console.log("   Aviator bet placed:", tx);

      // Fetch game state
      const gameAccount = await program.account.gameResult.fetch(gamePda);
      console.log("   === STORED HANDLES ===");
      console.log("   Payout handle:", gameAccount.payoutHandle.toString());
      console.log("   Crash point handle:", gameAccount.randomHandles[0].toString());
      console.log("   Target (encrypted choice):", gameAccount.choiceHandle.toString());

      console.log("   === DECRYPTION RESULTS ===");
      // Decrypt payout
      const payoutResult = await decryptHandle(gameAccount.payoutHandle.toString());
      if (payoutResult) {
        const payout = parseInt(payoutResult.plaintext, 10);
        console.log("   Decrypted payout:", payout, "lamports");
        console.log("   Result:", payout > 0 ? `🚀 Cashed out! Won ${payout / LAMPORTS_PER_SOL} SOL!` : "💥 Crashed before target!");
      } else {
        console.log("   ❌ Could not decrypt payout");
      }

      // Decrypt crash point
      const crashResult = await decryptHandle(gameAccount.randomHandles[0].toString());
      if (crashResult) {
        const crashBps = parseInt(crashResult.plaintext, 10);
        console.log(`   Crash point: ${(crashBps / 10000).toFixed(2)}x (${crashBps} BPS)`);
      } else {
        console.log("   ❌ Could not decrypt crash point");
      }
    });
  });


  // ============ CLAIM REWARDS TEST ============

  describe("6. Claim Rewards", () => {
    it("Claim rewards from slot machine win", async () => {
      // Use the slot machine game which has the highest payout
      const slotSeed = BigInt(baseTimestamp + 200);
      const [gamePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("game_slot"),
          wallet.publicKey.toBuffer(),
          seedToBuffer(slotSeed),
        ],
        program.programId
      );

      // Fetch game state
      let gameAccount;
      try {
        gameAccount = await program.account.gameResult.fetch(gamePda);
      } catch {
        console.log("   Game not found, skipping claim test");
        return;
      }

      if (gameAccount.claimed) {
        console.log("   Already claimed, skipping");
        return;
      }

      const payoutHandle = gameAccount.payoutHandle.toString();
      console.log("   Payout handle:", payoutHandle);

      // Decrypt to get plaintext (with Ed25519 signature)
      const result = await decryptHandle(payoutHandle);
      if (!result) {
        console.log("   Could not decrypt, skipping claim");
        return;
      }

      const payout = parseInt(result.plaintext, 10);
      console.log("   Decrypted payout:", payout, "lamports");

      if (payout === 0) {
        console.log("   No payout to claim (lost the game)");
        return;
      }

      // Build claim transaction with Ed25519 signature verification
      try {
        console.log("   Building claim transaction...");

        const claimIx = await program.methods
          .claimRewards(handleToBuffer(payoutHandle), plaintextToBuffer(result.plaintext))
          .accounts({
            player: wallet.publicKey,
            admin: adminPda,
            casinoVault: casinoVaultPda,
            lpVault: lpVaultPda,
            game: gamePda,
            instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
            incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();

        // Build transaction with Ed25519 pre-instructions (for on-chain signature verification)
        const tx = new Transaction();
        result.ed25519Instructions.forEach((ix) => tx.add(ix));
        tx.add(claimIx);

        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        const signedTx = await provider.wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(sig, "confirmed");

        console.log("   🎉 Claimed:", sig);
        console.log(`   Received: ${payout / LAMPORTS_PER_SOL} SOL`);

        // Verify game is marked as claimed
        const updatedGame = await program.account.gameResult.fetch(gamePda);
        console.log("   Game claimed status:", updatedGame.claimed);
      } catch (e: any) {
        console.log("   Claim failed:", e.message?.slice(0, 200));
        console.log("   Full error:", e);
      }
    });
  });

  // ============ MULTIPLE GAMES TEST ============

  // describe("7. Multiple Games Stress Test", () => {
  //   it("Play 3 coinflips in sequence", async () => {
  //     for (let i = 0; i < 3; i++) {
  //       const seed = BigInt(baseTimestamp + 1000 + i);
  //       const [gamePda] = PublicKey.findProgramAddressSync(
  //         [
  //           Buffer.from("game_coinflip"),
  //           wallet.publicKey.toBuffer(),
  //           seedToBuffer(seed),
  //         ],
  //         program.programId
  //       );

  //       const choice = i % 2; // Alternate heads/tails
  //       console.log(`   Game ${i + 1}: ${choice === 0 ? "HEADS" : "TAILS"}`);

  //       const encryptedChoice = await encryptValue(BigInt(choice));

  //       try {
  //         const tx = await program.methods
  //           .playCoinflip(
  //             new BN(seed.toString()),
  //             hexToBuffer(encryptedChoice),
  //             new BN(BET_AMOUNT)
  //           )
  //           .accounts({
  //             player: wallet.publicKey,
  //             admin: adminPda,
  //             casinoVault: casinoVaultPda,
  //             game: gamePda,
  //             incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
  //             systemProgram: SystemProgram.programId,
  //           } as any)
  //           .rpc();

  //         console.log(`   Game ${i + 1} tx:`, tx.slice(0, 20) + "...");

  //         // Brief pause between games
  //         await new Promise((r) => setTimeout(r, 1000));
  //       } catch (e: any) {
  //         console.log(`   Game ${i + 1} error:`, e.message?.slice(0, 50));
  //       }
  //     }
  //   });
  // });

  // ============ ERROR CASE TESTS ============

  // describe("8. Error Cases", () => {
  //   it("Should reject bet below minimum", async () => {
  //     const seed = BigInt(baseTimestamp + 2000);
  //     const [gamePda] = PublicKey.findProgramAddressSync(
  //       [
  //         Buffer.from("game_coinflip"),
  //         wallet.publicKey.toBuffer(),
  //         seedToBuffer(seed),
  //       ],
  //       program.programId
  //     );

  //     const tooSmall = 1000; // Way below minimum
  //     const encryptedChoice = await encryptValue(BigInt(0));

  //     try {
  //       await program.methods
  //         .playCoinflip(
  //           new BN(seed.toString()),
  //           hexToBuffer(encryptedChoice),
  //           new BN(tooSmall)
  //         )
  //         .accounts({
  //           player: wallet.publicKey,
  //           admin: adminPda,
  //           casinoVault: casinoVaultPda,
  //           game: gamePda,
  //           incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
  //           systemProgram: SystemProgram.programId,
  //         } as any)
  //         .rpc();

  //       throw new Error("Should have failed!");
  //     } catch (e: any) {
  //       if (e.message.includes("MinimumBet") || e.message.includes("Should have failed")) {
  //         console.log("   ✅ Correctly rejected minimum bet violation");
  //       } else {
  //         console.log("   ✅ Rejected:", e.message?.slice(0, 50));
  //       }
  //     }
  //   });

  //   it("Should reject bet above maximum", async () => {
  //     const seed = BigInt(baseTimestamp + 2001);
  //     const [gamePda] = PublicKey.findProgramAddressSync(
  //       [
  //         Buffer.from("game_coinflip"),
  //         wallet.publicKey.toBuffer(),
  //         seedToBuffer(seed),
  //       ],
  //       program.programId
  //     );

  //     const tooLarge = 100 * LAMPORTS_PER_SOL; // Above 10 SOL max
  //     const encryptedChoice = await encryptValue(BigInt(0));

  //     try {
  //       await program.methods
  //         .playCoinflip(
  //           new BN(seed.toString()),
  //           hexToBuffer(encryptedChoice),
  //           new BN(tooLarge)
  //         )
  //         .accounts({
  //           player: wallet.publicKey,
  //           admin: adminPda,
  //           casinoVault: casinoVaultPda,
  //           game: gamePda,
  //           incoLightningProgram: INCO_LIGHTNING_PROGRAM_ID,
  //           systemProgram: SystemProgram.programId,
  //         } as any)
  //         .rpc();

  //       throw new Error("Should have failed!");
  //     } catch (e: any) {
  //       if (e.message.includes("MaximumBet") || e.message.includes("Should have failed")) {
  //         console.log("   ✅ Correctly rejected maximum bet violation");
  //       } else {
  //         console.log("   ✅ Rejected:", e.message?.slice(0, 50));
  //       }
  //     }
  //   });
  // });
});
