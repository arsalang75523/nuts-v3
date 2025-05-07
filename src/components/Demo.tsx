/* eslint-disable @next/next/no-img-element */
/* eslint-disable @next/next/no-page-custom-font */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Metadata } from "next";
import Image from "next/image";
import { signIn, signOut, getCsrfToken } from "next-auth/react";
import sdk, { SignIn as SignInCore } from "@farcaster/frame-sdk";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi"; // import { useAccount, useConnect, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useSession } from "next-auth/react";
import { useFrame } from "~/components/providers/FrameProvider";
import { Button } from "~/components/ui/Button";
import { Database } from "@sqlitecloud/drivers";
import { size, toHex } from "viem";

// تعریف ABI برای قراردادهای NFT
const ogNftAbi = [
  {
    inputs: [],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const allowanceNftAbi = [
  {
    inputs: [],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const OG_NFT_CONTRACT_ADDRESS = "0x8F7Aa5FFd552e9ceA4d0Dd06A8BF97AbaaE9136e";
const ALLOWANCE_NFT_CONTRACT_ADDRESS = "0x0e0E1d68954411BF0Cc1743dc3616c3fe29CF004";

interface NeynarUser {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  custody_address?: string;
  verifications?: string[];
}

interface ButtonItem {
  text: string;
  image: string;
  onClick: () => void;
  className: string;
}

interface TipStats {
  todayEarning: number;
  allTimeEarning: number;
  tippedToday: number;
  rank: number;
  allowance: number | string;
  memberType: string;
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  author: { fid: number };
  parent_hash?: string;
  parent_author?: { fid: number };
  replies?: { count: number; casts: Cast[] };
}

interface SearchCastsResponse {
  result: {
    casts: Cast[];
    next?: { cursor: string };
  };
}

interface DuneRow {
  parent_fid: string | null;
  total_peanut_count: number | null;
  rank: number | null;
  daily_peanut_count: number | null;
  all_time_peanut_count: number | null;
  fid: string | null;
  sent_peanut_count: number | null;
}

interface NFTHolder {
  wallet: string;
  count: number;
}

interface CastWithAuthor {
  text: string;
  author: { fid: number; username: string };
}

// تابع برای کوتاه کردن آدرس
const truncateAddressShort = (address: string) => {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// تابع برای محاسبه اندازه تصویر
const calculateImageSize = (fid: string | undefined) => {
  const baseSize = fid ? Number(fid) % 100 : 50;
  return size(toHex(baseSize)).toString();
};

// تابع برای دریافت نام‌های کاربری بر اساس فیدها
const fetchUsernames = async (fids: number[]): Promise<Record<number, string>> => {
  if (fids.length === 0) return {};
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids.join(",")}`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-neynar-experimental": "false",
      "x-api-key": "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
    },
  };
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    const usernameMap: Record<number, string> = {};
    json.users.forEach((user: NeynarUser) => {
      usernameMap[user.fid] = user.username;
    });
    return usernameMap;
  } catch (err) {
    console.error("Failed to fetch usernames:", err);
    return {};
  }
};

export const metadata: Metadata = {
  openGraph: {
    title: "Farcaster Tips Stats by Arsalang & Jeyloo",
    description:
      "Track your daily and all-time tips on Farcaster, check your rank, and manage your allowance with this mini app!",
    images: [
      {
        url: "https://i.imgur.com/MU8y95W.jpg",
        width: 1200,
        height: 630,
        alt: "Farcaster Tips Stats Mini App",
      },
    ],
  },
};

export default function Demo(
  { title }: { title?: string } = { title: "Farcaster Tips Stats Demo" }
) {
  const { isSDKLoaded, context, notificationDetails } = useFrame();
  const { address, isConnected } = useAccount();
  // const { connect, connectors, error: connectError } = useConnect(); // اضافه کردن useConnect
  const { status } = useSession();

  // Hooks for OG NFT contract interaction
  const {
    writeContract: mintOgNft,
    isPending: isOgMinting,
    data: ogTxData,
  } = useWriteContract();

  const {
    isLoading: isOgTxLoading,
  } = useWaitForTransactionReceipt({
    hash: ogTxData,
  });

  // Hooks for Allowance NFT contract interaction
  const {
    writeContract: mintAllowanceNft,
    isPending: isAllowanceMinting,
    data: allowanceTxData,
  } = useWriteContract();

  const {
    isLoading: isAllowanceTxLoading,
  } = useWaitForTransactionReceipt({
    hash: allowanceTxData,
  });

  const [userData, setUserData] = useState<NeynarUser | null>(null);
  const [tipStats, setTipStats] = useState<TipStats>({
    todayEarning: 0,
    allTimeEarning: 0,
    tippedToday: 0,
    rank: 0,
    allowance: "Mint your allowance",
    memberType: "Not Active",
  });
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isWebnutsModalOpen, setIsWebnutsModalOpen] = useState(false);
  const [tippedTodayCasts, setTippedTodayCasts] = useState<CastWithAuthor[]>([]);
  const [isTippedTodayModalOpen, setIsTippedTodayModalOpen] = useState(false);
  const [todayEarningCasts, setTodayEarningCasts] = useState<CastWithAuthor[]>([]);
  const [isTodayEarningModalOpen, setIsTodayEarningModalOpen] = useState(false);
  const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<
    { fid: number; username: string; rank: number; allTimePeanutCount: number }[]
  >([]);
  const [sendNotificationResult, setSendNotificationResult] = useState("");
  const [targetFid, setTargetFid] = useState<string>("443855"); // مقدار پیش‌فرض FID
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  // بعد از ساین‌این، FID کاربر جایگزین می‌شه
  useEffect(() => {
    if (status === "authenticated" && context?.user?.fid) {
      setTargetFid(context.user.fid.toString());
    }
  }, [status, context]);

  
  useEffect(() => {
    const computedSize = calculateImageSize(targetFid);
    console.log("[Debug] Computed image size:", computedSize);

    const fetchAllData = async () => {
      try {
        setLoading(true);
        setProgress(10);
        const [userData, tipStats, duneStats, nftData, leaderboard] = await Promise.all([
          fetchUserData(),
          fetchTipStats(),
          fetchDuneStats(),
          fetchNFTData(),
          fetchLeaderboard(),
        ]);
        setUserData(userData || null);
        setTipStats((prev) => ({
          ...prev,
          todayEarning: tipStats.todayEarning || 0,
          tippedToday: tipStats.tippedToday || 0,
          allTimeEarning: duneStats.allTimeEarning || 0,
          rank: duneStats.rank || 0,
          allowance: nftData.allowance || "Mint your allowance",
          memberType: nftData.memberType || "Not Active",
        }));
        setLeaderboardData(leaderboard);
        setProgress(100);
      } catch (err) {
        setError("Failed to fetch data: " + (err as Error).message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const fetchUserData = async (): Promise<NeynarUser | undefined> => {
      const url: string = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${targetFid}`;
      const options = {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-neynar-experimental": "false",
          "x-api-key": "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
        },
      };

      try {
        setProgress(20);
        const res = await fetch(url, options);
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const json = await res.json();
        if (json.users && json.users.length > 0) {
          setUserData(json.users[0]);
          return json.users[0];
        } else {
          setError("User not found");
          return undefined;
        }
      } catch (err) {
        setError("Failed to fetch user data: " + (err as Error).message);
        console.error(err);
        return undefined;
      }
    };

    const fetchTipStats = async (): Promise<{ todayEarning: number; tippedToday: number }> => {
      console.log("[Debug] targetFid:", targetFid);
      let tippedToday = 0;
      let todayEarning = 0;

      try {
        setProgress(40);
        let allCastsForTipped: Cast[] = [];
        let cursorForTipped: string | null = null;
        const maxTippedPages = 10;
        let tippedPages = 0;

        console.log("[Debug] Starting to fetch casts for tippedToday");
        do {
          const searchUrl: string = `https://api.neynar.com/v2/farcaster/cast/search?q=%F0%9F%A5%9C%20after:2025-04-04&limit=100${cursorForTipped ? `&cursor=${cursorForTipped}` : ""}`;
          console.log("[Debug] Fetching casts for tippedToday from URL:", searchUrl);
          const searchRes: Response = await fetch(searchUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              "x-api-key": "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
            },
          });
          if (!searchRes.ok) {
            throw new Error(
              `HTTP error fetching casts for tippedToday! status: ${searchRes.status}`
            );
          }
          const searchJson: SearchCastsResponse = await searchRes.json();
          console.log(
            "[Debug] Received casts for tippedToday:",
            searchJson.result.casts.length
          );
          allCastsForTipped = allCastsForTipped.concat(
            searchJson.result.casts || []
          );
          cursorForTipped = searchJson.result.next?.cursor || null;
          tippedPages++;
          setProgress(40 + (tippedPages / maxTippedPages) * 20);
        } while (cursorForTipped && tippedPages < maxTippedPages);

        console.log(
          "[Debug] Total casts for tippedToday:",
          allCastsForTipped.length
        );

        const now = new Date();
        const startOfDayUTC = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0
          )
        );
        const endOfDayUTC = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            23,
            59,
            59
          )
        );

        const relevantCastsForTipped = allCastsForTipped.filter((cast) => {
          const castTimestamp = new Date(cast.timestamp);
          return (
            cast.author.fid === Number(targetFid) &&
            cast.parent_author &&
            castTimestamp >= startOfDayUTC &&
            castTimestamp <= endOfDayUTC
          );
        });

        console.log(
          "[Debug] Relevant casts for tippedToday:",
          relevantCastsForTipped.length
        );

        const recipientFidsForTipped = [
          ...new Set(
            relevantCastsForTipped
              .filter((cast) => cast.parent_author)
              .map((cast) => cast.parent_author!.fid)
          ),
        ];
        const usernameMapForTipped = await fetchUsernames(recipientFidsForTipped);

        const castTextsWithAuthor: CastWithAuthor[] = relevantCastsForTipped
          .filter((cast) => cast.text.includes("🥜"))
          .map((cast) => ({
            text: cast.text,
            author: {
              fid: cast.parent_author?.fid || 0,
              username: usernameMapForTipped[cast.parent_author?.fid || 0] || "Unknown",
            },
          }));
        setTippedTodayCasts(castTextsWithAuthor);

        relevantCastsForTipped.forEach((cast) => {
          const text = cast.text || "";
          if (!text.includes("🥜")) return;

          let peanutCount = 0;
          const match = text.match(/(\d+)x🥜/);
          if (match) {
            peanutCount = parseInt(match[1], 10);
          } else {
            peanutCount = (text.match(/🥜/g) || []).length;
          }
          tippedToday += peanutCount;
          console.log(
            "[Debug] Cast text for tippedToday:",
            text,
            "Peanuts counted:",
            peanutCount
          );
        });

        setTipStats((prev) => ({ ...prev, tippedToday }));
        setProgress(60);

        let allCastsForEarning: Cast[] = [];
        let cursorForEarning: string | null = null;
        const maxEarningPages = 10;
        let earningPages = 0;

        console.log("[Debug] Starting to fetch casts for todayEarning");
        do {
          const earningUrl: string = `https://api.neynar.com/v2/farcaster/cast/search?q=%F0%9F%A5%9C%20after:2025-04-04&limit=100${cursorForEarning ? `&cursor=${cursorForEarning}` : ""}`;
          console.log(
            "[Debug] Fetching casts for todayEarning from URL:",
            earningUrl
          );
          const earningRes: Response = await fetch(earningUrl, {
            method: "GET",
            headers: {
              accept: "application/json",
              "x-api-key": "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
            },
          });
          if (!earningRes.ok) {
            throw new Error(
              `HTTP error fetching casts for todayEarning! status: ${earningRes.status}`
            );
          }
          const earningJson: SearchCastsResponse = await earningRes.json();
          console.log(
            "[Debug] Received casts for todayEarning:",
            earningJson.result.casts.length
          );
          allCastsForEarning = allCastsForEarning.concat(
            earningJson.result.casts || []
          );
          cursorForEarning = earningJson.result.next?.cursor || null;
          earningPages++;
          setProgress(60 + (earningPages / maxEarningPages) * 20);
        } while (cursorForEarning && earningPages < maxEarningPages);

        console.log(
          "[Debug] Total casts for todayEarning:",
          allCastsForEarning.length
        );

        const replyCastsForEarning = allCastsForEarning.filter(
          (cast) =>
            cast.parent_author && cast.parent_author.fid === Number(targetFid)
        );

        console.log(
          "[Debug] Filtered reply casts for todayEarning:",
          replyCastsForEarning.length
        );

        const relevantCastsForEarning = replyCastsForEarning.filter((cast) => {
          const castTimestamp = new Date(cast.timestamp);
          console.log(
            "[Debug] Checking cast timestamp for todayEarning:",
            castTimestamp
          );
          return (
            castTimestamp >= startOfDayUTC && castTimestamp <= endOfDayUTC
          );
        });

        console.log(
          "[Debug] Relevant casts for todayEarning:",
          relevantCastsForEarning.length
        );

        const authorFidsForEarning = [
          ...new Set(relevantCastsForEarning.map((cast) => cast.author.fid)),
        ];
        const usernameMapForEarning = await fetchUsernames(authorFidsForEarning);

        const earningCastTextsWithAuthor: CastWithAuthor[] = relevantCastsForEarning
          .filter((cast) => cast.text.includes("🥜"))
          .map((cast) => ({
            text: cast.text,
            author: {
              fid: cast.author.fid,
              username: usernameMapForEarning[cast.author.fid] || "Unknown",
            },
          }));
        setTodayEarningCasts(earningCastTextsWithAuthor);

        relevantCastsForEarning.forEach((cast) => {
          const text = cast.text || "";
          if (!text.includes("🥜")) return;

          let peanutCount = 0;
          const match = text.match(/(\d+)x🥜/);
          if (match) {
            peanutCount = parseInt(match[1], 10);
          } else {
            peanutCount = (text.match(/🥜/g) || []).length;
          }
          todayEarning += peanutCount;
          console.log(
            "[Debug] Cast text for todayEarning:",
            text,
            "Peanuts counted:",
            peanutCount
          );
        });

        setTipStats((prev) => ({ ...prev, todayEarning }));
        return { todayEarning, tippedToday };
      } catch (err) {
        console.error("Failed to fetch tip stats:", err);
        setError("Failed to fetch tip stats: " + (err as Error).message);
        setTipStats((prev) => ({ ...prev, todayEarning: 0, tippedToday: 0 }));
        return { todayEarning: 0, tippedToday: 0 };
      }
    };

    const fetchDuneStats = async (): Promise<{ allTimeEarning: number; rank: number }> => {
      try {
        console.log(
          "[SQLite] Fetching data from SQLite Cloud for targetFid:",
          targetFid,
          " (type:",
          typeof targetFid,
          ")"
        );
        const db = new Database(
          "sqlitecloud://cntihai1nk.g4.sqlite.cloud:8860/dune_data.db?apikey=GEKHc2AnfNuuZQvBjekbuOP7QHlFWPHSHPChPKswA4c"
        );
        const rows = await db.sql`SELECT * FROM peanut_data;`;

        if (!rows || rows.length === 0) {
          throw new Error("No data returned from SQLite Cloud");
        }

        console.log(
          "[SQLite] Available parent_fids and fids:",
          rows.map((row: DuneRow) => ({ parent_fid: row.parent_fid, fid: row.fid }))
        );
        const userData = rows.find(
          (row: DuneRow) =>
            String(row.parent_fid) === String(targetFid) ||
            String(row.fid) === String(targetFid)
        );

        if (!userData) {
          console.error("[SQLite Error] No data found for FID:", targetFid);
          setError(`No SQLite data found for FID: ${targetFid}`);
          setTipStats((prev) => ({
            ...prev,
            allTimeEarning: 0,
            rank: 0,
          }));
          return { allTimeEarning: 0, rank: 0 };
        }

        console.log("[SQLite] Found userData:", userData);
        setTipStats((prev) => ({
          ...prev,
          allTimeEarning: userData.all_time_peanut_count || 0,
          rank: userData.rank || 0,
        }));
        return { allTimeEarning: userData.all_time_peanut_count || 0, rank: userData.rank || 0 };
      } catch (err) {
        console.error("[SQLite Error] Failed to fetch data:", err);
        setError("Failed to fetch SQLite data: " + (err as Error).message);
        setTipStats((prev) => ({
          ...prev,
          allTimeEarning: 0,
          rank: 0,
        }));
        return { allTimeEarning: 0, rank: 0 };
      }
    };

    const fetchNFTData = async (): Promise<{ allowance: number | string; memberType: string }> => {
      try {
        console.log("[SQLite NFT] Fetching NFT data for wallets:", userData?.verifications);
        const db = new Database(
          "sqlitecloud://cntihai1nk.g4.sqlite.cloud:8860/nft_holders.db?apikey=GEKHc2AnfNuuZQvBjekbuOP7QHlFWPHSHPChPKswA4c"
        );

        const newNFTHolders: NFTHolder[] = await db.sql`SELECT * FROM holders_new_nft;`;
        const nftHolders: NFTHolder[] = await db.sql`SELECT * FROM holders_nft;`;

        let allowance = 0;
        let memberType = "Not Active";

        // بررسی همه آدرس‌های تأییدشده
        const wallets = userData?.verifications || [];
        if (userData?.custody_address && !wallets.includes(userData.custody_address)) {
          wallets.push(userData.custody_address);
        }

        for (const wallet of wallets) {
          const newNFTData = newNFTHolders.find(
            (holder) => holder.wallet.toLowerCase() === wallet.toLowerCase()
          );
          const nftData = nftHolders.find(
            (holder) => holder.wallet.toLowerCase() === wallet.toLowerCase()
          );

          if (newNFTData) {
            allowance += (newNFTData.count || 0) * 30;
            memberType = memberType === "OG" ? "Hero" : "Active";
          }
          if (nftData) {
            allowance += (nftData.count || 0) * 150;
            memberType = memberType === "Active" ? "Hero" : "OG";
          }
        }

        const finalAllowance = allowance > 0 ? allowance : "Mint your allowance";
        if (!wallets.length) {
          console.error("[SQLite NFT Error] No valid wallet addresses available");
          memberType = "Not Active";
        }

        console.log("[SQLite NFT] Allowance:", finalAllowance, "Member Type:", memberType);
        setTipStats((prev) => ({
          ...prev,
          allowance: finalAllowance,
          memberType,
        }));
        return { allowance: finalAllowance, memberType };
      } catch (err) {
        console.error("[SQLite NFT Error] Failed to fetch NFT data:", err);
        setError("Failed to fetch NFT data: " + (err as Error).message);
        setTipStats((prev) => ({
          ...prev,
          allowance: "Mint your allowance",
          memberType: "Not Active",
        }));
        return { allowance: "Mint your allowance", memberType: "Not Active" };
      }
    };

    const fetchLeaderboard = async () => {
      try {
        console.log("[SQLite] Fetching leaderboard data from SQLite Cloud");
        const db = new Database(
          "sqlitecloud://cntihai1nk.g4.sqlite.cloud:8860/dune_data.db?apikey=GEKHc2AnfNuuZQvBjekbuOP7QHlFWPHSHPChPKswA4c"
        );
        const rows = await db.sql`SELECT fid, rank, all_time_peanut_count FROM peanut_data WHERE rank IS NOT NULL ORDER BY rank ASC LIMIT 11;`;

        if (!rows || rows.length === 0) {
          console.error("[SQLite Error] No leaderboard data found");
          return [];
        }

        const fids = rows.map((row: DuneRow) => Number(row.fid!)).filter((fid: number) => fid);
        const usernameMap = await fetchUsernames(fids);

        const leaderboardData = rows
          .filter((row: DuneRow) => row.fid && Number(row.fid))
          .map((row: DuneRow) => ({
            fid: Number(row.fid),
            username: usernameMap[Number(row.fid)] || `user${row.fid}`,
            rank: (row.rank || 0) - 1,
            allTimePeanutCount: row.all_time_peanut_count || 0,
          }));

        console.log("[SQLite] Leaderboard data:", leaderboardData);
        return leaderboardData;
      } catch (err) {
        console.error("[SQLite Error] Failed to fetch leaderboard data:", err);
        return [];
      }
    };

    fetchAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFid]); // هر وقت targetFid تغییر کنه، داده‌ها دوباره fetch می‌شن

  const sendNotification = useCallback(async () => {
    setSendNotificationResult("");
    if (!notificationDetails || !context || !tipStats) return;

    try {
      const response = await fetch("/api/send-notification", {
        method: "POST",
        mode: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: context?.user?.fid,
          notificationDetails: {
            message: `You received a new tip! Today's earning: ${tipStats.todayEarning}`,
          },
        }),
      });

      if (response.status === 200) {
        setSendNotificationResult("Notification sent!");
      } else if (response.status === 429) {
        setSendNotificationResult("Rate limited");
      } else {
        const data = await response.text();
        setSendNotificationResult(`Error: ${data}`);
      }
    } catch (error) {
      setSendNotificationResult(`Error: ${error}`);
    }
  }, [context, notificationDetails, tipStats]);

  console.log("Rendering with tipStats:", tipStats);

  if (!isSDKLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2b1409] via-[#4a2512] to-[#6b3a1e] p-4">
        <div className="loader-container">
          <h2 className="loader-text">Crunching Peanuts </h2>
          <div className="peanut-bar">
            <div className="peanut-fill" style={{ width: `${progress}%` }}>
              <span className="peanut-emoji"></span>
            </div>
          </div>
          <p className="progress-percent">{Math.min(progress, 100)}%</p>
        </div>
        <style jsx>{`
          .loader-container {
            text-align: center;
            padding: 2.5rem;
            background: rgba(42, 26, 16, 0.85);
            border-radius: 1.5rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 0 10px rgba(245, 197, 66, 0.2);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(90, 58, 42, 0.5);
            position: relative;
            overflow: hidden;
          }
          .loader-container::before {
            content: "";
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(245, 197, 66, 0.1) 10%, transparent 50%);
            animation: rotate 10s linear infinite;
          }
          .loader-text {
            color: #f5c542;
            font-size: 1.75rem;
            font-weight: 700;
            margin-bottom: 1.5rem;
            text-shadow: 0 0 8px rgba(245, 197, 66, 0.7), 0 0 15px rgba(245, 197, 66, 0.4);
            position: relative;
            z-index: 1;
            animation: pulse 2s ease-in-out infinite;
          }
          .peanut-bar {
            width: 320px;
            height: 30px;
            background: #3a2a1a;
            border-radius: 15px;
            overflow: hidden;
            position: relative;
            border: 3px solid #5a3a2a;
            box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
          }
          .peanut-fill {
            height: 100%;
            background: linear-gradient(90deg, #8b5e34, #f5c542);
            transition: width 0.6s ease-in-out;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 10px;
            box-shadow: 0 0 15px rgba(245, 197, 66, 0.8);
          }
          .peanut-fill::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(
              45deg,
              rgba(139, 94, 52, 0.2),
              rgba(139, 94, 52, 0.2) 10px,
              transparent 10px,
              transparent 20px
            );
            animation: slide 3s linear infinite;
          }
          .peanut-emoji {
            font-size: 1.5rem;
            animation: bounce 1s infinite;
          }
          .progress-percent {
            color: #fff;
            font-size: 1.2rem;
            font-weight: 600;
            margin-top: 1rem;
            text-shadow: 0 0 5px rgba(245, 197, 66, 0.6), 0 0 10px rgba(245, 197, 66, 0.3);
            position: relative;
            z-index: 1;
          }
          @keyframes rotate {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
          @keyframes pulse {
            0%,
            100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
          }
          @keyframes slide {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }
          @keyframes bounce {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-5px);
            }
          }
        `}</style>
      </div>
    );
  }

  if (error) return <div className="text-red-500 text-center">{error}</div>;

  console.log("Rendering with tipStats:", tipStats);

  const buttons: ButtonItem[] = [
    {
      image: "https://img1.pixhost.to/images/5196/590496129_webnuts-btn.png",
      onClick: () => setIsWebnutsModalOpen(true),
      text: "",
      className: "w-100 h-100",
    },
    {
      text: "",
      image: "https://img1.pixhost.to/images/5196/590498823_share-btn.png",
      onClick: () => setIsShareModalOpen(true),
      className: "",
    },
    {
      text: "",
      image: "https://img1.pixhost.to/images/5196/590498822_og-btn.png",
      onClick: () => {
        if (!isConnected) {
          alert("Please connect your wallet first");
          return;
        }
        mintOgNft({
          address: OG_NFT_CONTRACT_ADDRESS,
          abi: ogNftAbi,
          functionName: "mint",
        });
      },
      className: isOgMinting || isOgTxLoading ? "opacity-50 cursor-not-allowed" : "",
    },
    {
      text: "",
      image: "https://img1.pixhost.to/images/5196/590498821_allowance-btn.png",
      onClick: () => {
        if (!isConnected) {
          alert("Please connect your wallet first");
          return;
        }
        mintAllowanceNft({
          address: ALLOWANCE_NFT_CONTRACT_ADDRESS,
          abi: allowanceNftAbi,
          functionName: "mint",
        });
      },
      className: isAllowanceMinting || isAllowanceTxLoading ? "opacity-50 cursor-not-allowed" : "",
    },
  ];

  const memberImageMap: Record<string, string> = {
    OG: "https://img1.pixhost.to/images/5213/590757653_og-coin.png",
    Active: "https://img1.pixhost.to/images/5213/590757645_active-coin.png",
    Hero: "https://img1.pixhost.to/images/5213/590757647_hero-coin.png",
    "Not Active": "https://img1.pixhost.to/images/5214/590768360_hero-coin2.png",
  };

  const memberImageUrl =
    memberImageMap[tipStats.memberType] || memberImageMap["Not Active"];

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2b1409] via-[#4a2512] to-[#6b3a1e] p-4"
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div
        className="relative w-full max-w-[365px] h-[80%]"
        style={{
          backgroundImage:
            "url('https://img1.pixhost.to/images/5212/590751646_bg3.png')",
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
          backgroundPosition: "center",
        }}
      >
        <link
          href="https://fonts.googleapis.com/css2?family=Chicle&family=Poetsen+One&family=Poiret+One&family=Quicksand:wght@300..700&family=Rubik+Dirt&family=Rubik+Moonrocks&family=Winky+Sans:ital,wght@0,300..900;1,300..900&family=Yrsa:ital,wght@0,300..700;1,300..700&display=swap"
          rel="stylesheet"
        />
        <h1 className="text-2xl font-bold text-center mb-4 text-[#f5c542]">{title}</h1>

        {!isConnected ? (
          <>
            {/* <div className="text-center mb-4">
              <Button
                onClick={() => {
                  const injectedConnector = connectors.find(c => c.id === "injected");
                  if (injectedConnector) {
                    connect({ connector: injectedConnector });
                  } else {
                    alert("Wallet connector not found. Please ensure Wallet is installed.");
                  }
                }}
                className="py-2 px-4 bg-[#f5c542] text-[#1a0e06] rounded-lg font-semibold hover:bg-[#ff6f61] transition-colors duration-200"
              >
                Connect Wallet
              </Button>
              {connectError && (
                <p className="text-red-500 text-sm mt-2">{connectError.message}</p>
              )}
            </div>*/}
            </>
          ) : (
            <p className="text-center text-[#f5c542] mb-4">
              Connected: {truncateAddressShort(address || "")}
            </p> 
        )}

        <div className="relative w-full h-[150px] mb-10">
          <div className="absolute top-[17px] left-[6px] w-[117px] h-[117px] rounded-full overflow-hidden transition-transform border-4 border-white">
            {userData?.pfp_url ? (
              <Image
                src={userData.pfp_url}
                alt="Profile"
                fill
                className="object-cover"
              />
            ) : (
              <span className="flex items-center justify-center h-full text-3xl bg-[#3a2a1a] text-white"></span>
            )}
          </div>

          <div
            className="absolute"
            style={{ top: 85, right: -10, width: 160, height: 160 }}
          >
            <img
              src={memberImageUrl}
              alt="Member Coin"
              className="w-[160px] h-[160px] object-contain"
            />
          </div>

          <div
            className="absolute top-[50px] left-[140px] text-[#ffffff] text-xl font-bold animate-pulse-slow"
            style={{ fontFamily: '"Poetsen One", sans-serif' }}
          >
            {userData?.username || "user.eth"}
          </div>

          <div
            className="absolute top-[98px] left-[180px] text-[#432818] text-lg font-bold animate-pulse-slow"
            style={{ fontFamily: '"Poetsen One", sans-serif' }}
          >
            {targetFid || "N/A"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            {
              value: `${tipStats.todayEarning} `,
              color: "text-white",
              minimal: true,
              offsetX: 60,
              offsetY: 17,
              action: () => setIsTodayEarningModalOpen(true),
              cursor: true,
              style: {
                lineHeight: "1.1",
              },
            },
            {
              value: `${tipStats.allTimeEarning} `,
              color: "text-white",
              minimal: true,
              offsetX: 60,
              offsetY: 17,
              style: {
                lineHeight: "1.1",
              },
            },
            {
              title: "Tipped Today",
              value: `${tipStats.tippedToday} `,
              color: "text-white",
              action: () => setIsTippedTodayModalOpen(true),
              cursor: true,
              minimal: true,
              offsetX: -190,
              offsetY: 75,
              style: {
                lineHeight: "1.1",
              },
            },
            {
              title: "Rank",
              value: tipStats.rank,
              color: "text-white",
              minimal: true,
              offsetX: 190,
              offsetY: -22,
              action: () => setIsLeaderboardModalOpen(true),
              cursor: true,
              style: {
                lineHeight: "1.1",
              },
            },
            {
              title: "Allowance",
              value:
                typeof tipStats.allowance === "number"
                  ? `${tipStats.allowance} `
                  : tipStats.allowance,
              color: "text-[#432818]",
              style: {
                fontSize: "0.95rem",
                fontFamily: '"Poetsen One", sans-serif',
                lineHeight: "1.1",
              },
              minimal: true,
              offsetX: -85,
              offsetY: 50,
            },
            {
              title: "Member Type",
              value: tipStats.memberType,
              minimal: true,
              color: "text-[#432818]",
              offsetX: -200,
              offsetY: -183,
              style: {
                fontFamily: "Poetsen One",
                fontSize: "2rem",
                lineHeight: "1.1",
              },
            },
          ].map((item, idx) => (
            <div
              key={idx}
              onClick={item.action}
              className={`text-center p-4 rounded-xl min-h-[80px] flex flex-col items-center justify-center transition-all duration-300 ${
                item.cursor ? "cursor-pointer" : ""
              } ${
                item.minimal
                  ? ""
                  : "bg-[#3a2a1a]/60 border border-[#f5c542]/20 hover:scale-105 hover:bg-[#4a3a2a]/80 hover:shadow-[0_0_15px_rgba(245,197,66,0.3)]"
              }`}
              style={{
                transform: `translate(${item.offsetX || 0}px, ${item.offsetY || 0}px)`,
              }}
            >
              <div
                className={`text-xs uppercase tracking-wider ${
                  item.minimal ? "invisible" : "text-gray-300"
                }`}
              >
                {item.title || ""}
              </div>
              <div
                className={`text-xl font-bold ${item.color}`}
                style={item.style || {}}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div
          className="text-center p-4 rounded-xl min-h-[80px] flex flex-col items-center justify-center transition-all duration-300"
          style={{ transform: `translate(105px, -55px)` }}
        >
          <div
            className="text-xl font-bold text-[#fca311]"
            style={{
              fontSize: "0.9rem",
              fontFamily: " sans-serif",
              lineHeight: "1.2",
            }}
          >
            {userData?.verifications?.[0]
              ? truncateAddressShort(userData.verifications[0])
              : "None"}
            <br />
            {userData?.custody_address &&
            userData.custody_address !== userData?.verifications?.[0]
              ? truncateAddressShort(userData.custody_address)
              : null}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-[0.1px] mb-3 mt-6">
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              className={`px-0.5 py-0.5 ${btn.className} text-[#1a0e06] rounded-lg font-semibold text-sm transition-all duration-200 flex flex-col items-center justify-center`}
            >
              <img
                src={btn.image}
                alt={btn.text}
                className="w-[82px] h-[52px] mb-1 transition-all duration-200 hover:shadow-[0_0_4px_rgba(0,0,0,0.15)] hover:scale-135 rounded-md"
              />
              {btn.text}
            </button>
          ))}
        </div>

        <div className="flex justify-center items-center space-x-4 mb-4">
          <SignIn />
          <img
            src="https://img1.pixhost.to/images/5197/590510978_notif-btn.png"
            alt="Notify Me"
            onClick={sendNotification}
            className={`w-[140px] cursor-pointer transition-transform duration-200 hover:scale-105 ${
              !notificationDetails || !isConnected
                ? "opacity-50 pointer-events-none"
: ""
            }`}
          />
        </div>
        {sendNotificationResult && (
          <div className="text-sm text-center text-gray-300 mt-2">
            {sendNotificationResult}
          </div>
        )}

        {isShareModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-0 share-modal-container">
            <div className="bg-[#1c0e06]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 w-full max-w-[90vw] sm:max-w-[600px] mx-auto max-h-[90vh] overflow-auto border border-[#f5c542]/30 share-modal">
              <div className="flex justify-between items-center mb-4 w-full">
                <h2 className="text-xl font-bold text-[#f5c542]">Share Preview</h2>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="text-[#f5c542] hover:text-[#ff6f61] transition-colors duration-200"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col items-center w-full">
                {isImageLoading && (
                  <div className="loading-spinner-container">
                    <div className="loading-spinner"></div>
                  </div>
                )}
                <img
                  src={`/api/og?fid=${targetFid}`}
                  alt="OpenGraph Preview"
                  className="w-full rounded-lg mb-4 max-w-md mx-auto"
                  onLoad={() => setIsImageLoading(false)}
                  onError={() => setIsImageLoading(false)}
                  style={{ display: isImageLoading ? 'none' : 'block' }}
                />
                <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                  <button
                    onClick={() => {
                      const shareUrl = `${window.location.origin}/api/og?fid=${targetFid}`;
                      navigator.clipboard.writeText(shareUrl);
                      alert("URL copied to clipboard!");
                    }}
                    className="py-2 px-4 bg-[#f5c542] text-[#1a0e06] rounded-lg font-semibold hover:bg-[#e5b532] transition-colors duration-200"
                  >
                    Copy Share URL
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: "Farcaster Tips Stats",
                          text: `Check out my Farcaster Tips Stats`,
                          url: `${window.location.origin}/api/og?fid=${targetFid}`,
                        });
                      } else {
                        alert("Web Share API is not supported in your browser.");
                      }
                    }}
                    className="py-2 px-4 bg-[#f5c542] text-[#1a0e06] rounded-lg font-semibold hover:bg-[#e5b532] transition-colors duration-200"
                  >
                    Share
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isWebnutsModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#1c0e06]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 w-full max-w-[365px] max-h-[667px] overflow-auto border border-[#f5c542]/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-[#f5c542]">Webnuts</h2>
                <button
                  onClick={() => setIsWebnutsModalOpen(false)}
                  className="text-[#f5c542] hover:text-[#ff6f61] transition-colors duration-200"
                >
                  ✕
                </button>
              </div>
              <iframe
                src="https://basednuts.github.io/Webnuts/"
                className="w-full h-[70vh] rounded-lg"
                title="Webnuts"
                allow="clipboard-write"
              />
            </div>
          </div>
        )}

        {isTippedTodayModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#1c0e06]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 w-full max-w-[365px] max-h-[667px] overflow-auto border border-[#f5c542]/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-[#f5c542]">
                  Tipped Today Casts
                </h2>
                <button
                  onClick={() => setIsTippedTodayModalOpen(false)}
                  className="text-[#f5c542] hover:text-[#ff6f61] transition-colors duration-200"
                >
                  ✕
                </button>
              </div>
              <iframe
                srcDoc={`<html><head><style>
                  body {font-family: Arial, sans-serif; background-color: #1c0e06; color: #fff; padding: 20px; line-height: 1.6;}
                  .cast {margin-bottom: 15px; padding: 10px; background: #3a2a1a; border-radius: 8px;}
                  .author {font-size: 0.9rem; color: #f5c542; margin-bottom: 5px;}
                </style></head><body>${
                  tippedTodayCasts.length > 0
                    ? tippedTodayCasts
                        .map(
                          (cast) =>
                            `<div class="cast"><div class="author">Author: @${cast.author.username} (FID: ${cast.author.fid})</div>${cast.text}</div>`
                        )
                        .join("")
                    : "<p>No casts found for Tipped Today.</p>"
                }</body></html>`}
                className="w-full h-[70vh] rounded-lg"
                title="Tipped Today Casts"
              />
            </div>
          </div>
        )}

        {isTodayEarningModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#1c0e06]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 w-full max-w-[365px] max-h-[667px] overflow-auto border border-[#f5c542]/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-[#f5c542]">Today Earning Casts</h2>
                <button
                  onClick={() => setIsTodayEarningModalOpen(false)}
                  className="text-[#f5c542] hover:text-[#ff6f61] transition-colors duration-200"
                >
                  ✕
                </button>
              </div>
              <iframe
                srcDoc={`<html><head><style>
                  body {font-family: Arial, sans-serif; background-color: #1c0e06; color: #fff; padding: 20px; line-height: 1.6;}
                  .cast {margin-bottom: 15px; padding: 10px; background: #3a2a1a; border-radius: 8px;}
                  .author {font-size: 0.9rem; color: #f5c542; margin-bottom: 5px;}
                </style></head><body>${
                  todayEarningCasts.length > 0
                    ? todayEarningCasts
                        .map(
                          (cast) =>
                            `<div class="cast"><div class="author">Author: @${cast.author.username} (FID: ${cast.author.fid})</div>${cast.text}</div>`
                        )
                        .join("")
                    : "<p>No casts found for Today Earning.</p>"
                }</body></html>`}
                className="w-full h-[70vh] rounded-lg"
                title="Today Earning Casts"
              />
            </div>
          </div>
        )}

        {isLeaderboardModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[#1c0e06]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-4 w-full max-w-[365px] max-h-[667px] overflow-auto border border-[#f5c542]/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-[#f5c542]">Leaderboard</h2>
                <button
                  onClick={() => setIsLeaderboardModalOpen(false)}
                  className="text-[#f5c542] hover:text-[#ff6f61] transition-colors duration-200"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                {leaderboardData.length > 0 ? (
                  leaderboardData.map((entry) => (
                    <div
                      key={entry.fid}
                      className="p-4 bg-[#3a2a1a] rounded-lg"
                    >
                      <div className="text-[#f5c542] font-bold">Rank {entry.rank}</div>
                      <div className="text-white">@{entry.username} (FID: {entry.fid})</div>
                      <div className="text-gray-300">Total Peanuts: {entry.allTimePeanutCount}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-white">No leaderboard data available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="frame-by">
          Frame by: <span className="text-[#f5c542]">@arsalang.eth</span> &{" "}
          <span className="text-[#f5c542]">@jeyloo.eth</span>
        </div>
      </div>

      <style jsx>{`
        .frame-by {
          font-size: 0.65rem;
          text-align: center;
          color: #432818;
          margin-bottom: 1rem;
          font-family: "Poetsen One";
        }
        .frame-by span {
          color: rgb(196, 138, 51);
        }

        .animate-pulse-slow {
          animation: pulse 3s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.02);
          }
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(245, 197, 66, 0.3);
          border-top-color: #f5c542;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        .share-modal-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 0;
          margin: 0;
          width: 100vw;
          left: 0;
          top: 0;
        }

        .share-modal {
          transform: translate(0, 0);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 640px) {
          .share-modal {
            width: 90vw;
            max-width: 365px;
            margin: 0 auto;
          }
        }
      `}</style>
    </div>
  );
}

function SignIn() {
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signInResult, setSignInResult] = useState<SignInCore.SignInResult>();
  const [signInFailure, setSignInFailure] = useState<string>();
  const { status } = useSession();

  const getNonce = useCallback(async () => {
    const nonce = await getCsrfToken();
    if (!nonce) throw new Error("Unable to generate nonce");
    return nonce;
  }, []);

  const handleSignIn = useCallback(async () => {
    try {
      setSigningIn(true);
      setSignInFailure(undefined);
      const nonce = await getNonce();
      const result = await sdk.actions.signIn({ nonce });
      setSignInResult(result);
      await signIn("credentials", {
        message: result.message,
        signature: result.signature,
        redirect: false,
      });
    } catch (e) {
      if (e instanceof SignInCore.RejectedByUser) {
        setSignInFailure("Rejected by user");
      } else {
        setSignInFailure("Unknown error");
      }
    } finally {
      setSigningIn(false);
    }
  }, [getNonce]);

  const handleSignOut = useCallback(async () => {
    try {
      setSigningOut(true);
      await signOut({ redirect: false });
      setSignInResult(undefined);
    } finally {
      setSigningOut(false);
    }
  }, []);

  return (
    <>
      {status !== "authenticated" ? (
        <img
          src="https://img1.pixhost.to/images/5197/590510357_sign-in-btn.png"
          alt="Sign In with Farcaster"
          onClick={handleSignIn}
          className="w-[140px] cursor-pointer transition-transform duration-200 hover:scale-105"
        />
      ) : (
        <Button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex-1 py-2 bg-[#f5425d] text-white rounded-lg font-semibold hover:bg-[#ff627a] transition-colors duration-200"
        >
          Sign Out
        </Button>
      )}
      {signInFailure && !signingIn && (
        <div className="text-sm text-red-400 mt-2 text-center">{signInFailure}</div>
      )}
      {signInResult && !signingIn && (
        <div className="text-sm text-green-400 mt-2 text-center">
          Signed in successfully!
        </div>
      )}
    </>
  );
}
