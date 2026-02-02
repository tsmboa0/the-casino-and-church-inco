// import createEdgeClient, { AdvancedTreeConfig, BadgesCondition, Project, Transaction, Transactions } from "@honeycomb-protocol/edge-client";
// import { sendClientTransactions } from "@honeycomb-protocol/edge-client/client/walletHelpers";

// import { useWallet } from "@solana/wallet-adapter-react";
// import base58 from "bs58";

// const API_URL = "https://edge.test.honeycombprotocol.com/";

// export const client = createEdgeClient(API_URL, true);

// export class Honeycomb {
//     private readonly client: any;
//     private readonly projectAddress: string;

//     constructor() {
//         this.client = client;
//         this.projectAddress = "HPZMbMvEqLhTB5xAVdGQQkAw8DNtEBx2Su2QEor4VYXp";
//     }

//     async getUserAccessToken(userPublicKey: string, userWallet: any){
//         console.log("Getting user access token");
//         if(localStorage.getItem("honeycomb_access_token")){
//             console.log("User access token found in localStorage");
//             return localStorage.getItem("honeycomb_access_token");
//         }

//         console.log("User access token not found in localStorage, requesting new one");

//         const { 
//             authRequest: { message: authRequest } 
//           } = await this.client.authRequest({
//             userPublicKey: userPublicKey
//           });

//           console.log("Auth request:", authRequest);

//           const encodedMessage = new TextEncoder().encode(authRequest);
//           const signedUIntArray = await userWallet.signMessage(encodedMessage);
//           const signature = base58.encode(signedUIntArray);
//           const { authConfirm } = await this.client.authConfirm({ wallet: userPublicKey.toString(), signature });

//           console.log(`authConfirm: ${authConfirm}`);

//           localStorage.setItem("honeycomb_access_token", authConfirm.accessToken);

//           return authConfirm.accessToken;
//     }

//     async sendUserTransaction(txResponse: Transaction, userWallet: any){
//         const response = await sendClientTransactions(
//             this.client,
//             userWallet,
//             txResponse
//         );

//         return response;
//     }

//     async getOrCreateUser(userName: string = "Player 456", userBio: string = "A new user", userPfp?: string, userWallet?: any){
//         console.log("Getting or creating user");
//         try{
//             const userPublicKey = userWallet?.publicKey;

//             if (!userPublicKey) {
//                 throw new Error("No wallet connected");
//             }

//             const user = await this.client
//             .findUsers({
//             wallets: [userPublicKey.toString()],
//             })

//             if(user){
//                 console.log("User found ", user);
//                 return user;
//             }

//             console.log("User not found, creating new user");

//             const {
//                 createNewUserTransaction: txResponse
//             } = await this.client.createNewUserTransaction({
//                 wallet: userPublicKey.toString(),
//                 info: {
//                     name: userName,
//                     pfp: userPfp,
//                     bio: userBio,
//                 },
//                 payer: userPublicKey.toString(),
//             });

//             console.log("Sending create new user transaction");

//             await this.sendUserTransaction(txResponse, userWallet);

//             console.log("Transaction sent, user created");

//             return await this.client
//             .findUsers({
//                 wallets: [userPublicKey.toString()],
//             });
//         } catch (error) {
//             console.error("Error getting or creating user:", error);
//             throw error;
//         }
//     }

//     async getOrCreateUserProfile(userPublicKey: string, userName: string, userBio: string, userPfp?: string, userWallet?: any){
//         console.log("Getting or creating user profile");

//         try {
//             const user = await this.getOrCreateUser(userName, userBio, userPfp, userWallet);

//             if(!user){
//                 throw new Error("User not found");
//             }

//             console.log("User found");

//             const profile = await this.client.findProfiles({
//                 projects: [this.projectAddress],
//                 addresses: [userPublicKey],
//             });

//             if(profile.length > 0){
//                 console.log("Profile found");
//                 return profile[0];
//             }

//             console.log("Creating new profile");

//             const { createNewProfileTransaction: txResponse } =
//             await this.client.createNewProfileTransaction(
//                 {
//                     project: this.projectAddress,
//                     info: {
//                         name: userName,
//                         bio: userBio,
//                         pfp: userPfp,
//                     },
//                     payer: userPublicKey.toString(),
//                 },
//                 {
//                     fetchOptions: {
//                         headers: {
//                             authorization: `Bearer ${await this.getUserAccessToken(userPublicKey, userWallet)}`,
//                         },
//                     },
//                 }
//             );

//             console.log("Sending create new profile transaction");

//             await this.sendUserTransaction(txResponse, userWallet);

//             console.log("Transaction sent, profile created");

//             return await this.client.findProfiles({
//                 projects: [this.projectAddress],
//                 addresses: [userPublicKey],
//             });
//         } catch (error) {
//             console.error("Error getting or creating user profile:", error);
//             throw error;
//         }
//     }
// }