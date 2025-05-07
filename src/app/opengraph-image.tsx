import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Farcaster Tips Stats";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// تنظیم metadataBase برای رفع URL‌های نسبی
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || "https://nuts-founder.vercel.app"),
};

interface NeynarUser {
  fid: number;
  username: string;
  pfp_url: string;
  custody_address?: string;
  verifications?: string[];
}

interface TipStats {
  todayEarning: number;
  allTimeEarning: number;
  tippedToday: number;
  rank: number;
  allowance: string;
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

async function fetchUserData(fid: string): Promise<NeynarUser | null> {
  const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-neynar-experimental": "false",
      "x-api-key": process.env.NEYNAR_API_KEY || "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
    },
  };

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.error(`[fetchUserData] HTTP error! status: ${res.status}`);
      return null;
    }
    const json = await res.json();
    console.log("[fetchUserData] Neynar user data:", json.users?.[0]);
    if (json.users && json.users.length > 0) {
      return json.users[0];
    }
    console.error("[fetchUserData] No users found for FID:", fid);
    return null;
  } catch (err) {
    console.error("[fetchUserData] Failed to fetch user data:", err);
    return null;
  }
}

async function fetchTipStats(fid: string): Promise<{ todayEarning: number; tippedToday: number }> {
  let tippedToday = 0;
  let todayEarning = 0;

  try {
    let allCastsForTipped: Cast[] = [];
    let cursorForTipped: string | null = null;
    const maxTippedPages = 10;
    let tippedPages = 0;

    do {
      const searchUrl: string = `https://api.neynar.com/v2/farcaster/cast/search?q=%F0%9F%A5%9C%20after:2025-04-04&limit=100${cursorForTipped ? `&cursor=${cursorForTipped}` : ""}`;
      const searchRes: Response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY || "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
        },
      });
      if (!searchRes.ok) {
        console.error(`[fetchTipStats] HTTP error fetching casts for tippedToday! status: ${searchRes.status}`);
        break;
      }
      const searchJson: SearchCastsResponse = await searchRes.json();
      allCastsForTipped = allCastsForTipped.concat(searchJson.result.casts || []);
      cursorForTipped = searchJson.result.next?.cursor || null;
      tippedPages++;
    } while (cursorForTipped && tippedPages < maxTippedPages);

    const now = new Date();
    const startOfDayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
    );
    const endOfDayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)
    );

    const relevantCastsForTipped = allCastsForTipped.filter((cast) => {
      const castTimestamp = new Date(cast.timestamp);
      return (
        cast.author.fid === Number(fid) &&
        cast.parent_author &&
        castTimestamp >= startOfDayUTC &&
        castTimestamp <= endOfDayUTC
      );
    });

    relevantCastsForTipped.forEach((cast: Cast) => {
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
    });

    let allCastsForEarning: Cast[] = [];
    let cursorForEarning: string | null = null;
    const maxEarningPages = 10;
    let earningPages = 0;

    do {
      const earningUrl: string = `https://api.neynar.com/v2/farcaster/cast/search?q=%F0%9F%A5%9C%20after:2025-04-04&limit=100${cursorForEarning ? `&cursor=${cursorForEarning}` : ""}`;
      const earningRes: Response = await fetch(earningUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": process.env.NEYNAR_API_KEY || "C283694F-C6E2-492F-B7B7-7DD1F7B3D9DC",
        },
      });
      if (!earningRes.ok) {
        console.error(`[fetchTipStats] HTTP error fetching casts for todayEarning! status: ${earningRes.status}`);
        break;
      }
      const earningJson: SearchCastsResponse = await earningRes.json();
      allCastsForEarning = allCastsForEarning.concat(earningJson.result.casts || []);
      cursorForEarning = earningJson.result.next?.cursor || null;
      earningPages++;
    } while (cursorForEarning && earningPages < maxEarningPages);

    const replyCastsForEarning = allCastsForEarning.filter(
      (cast) => cast.parent_author && cast.parent_author.fid === Number(fid)
    );

    const relevantCastsForEarning = replyCastsForEarning.filter((cast) => {
      const castTimestamp = new Date(cast.timestamp);
      return castTimestamp >= startOfDayUTC && castTimestamp <= endOfDayUTC;
    });

    relevantCastsForEarning.forEach((cast: Cast) => {
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
    });

    console.log("[fetchTipStats] Returning: ", { todayEarning, tippedToday });
    return { todayEarning, tippedToday };
  } catch (err) {
    console.error("[fetchTipStats] Failed to fetch tip stats:", err);
    return { todayEarning: 0, tippedToday: 0 };
  }
}

// تابع برای دریافت داده‌ها از SQLite Cloud مشابه Demo.tsx
async function fetchDuneStats(fid: string): Promise<{ allTimeEarning: number; rank: number }> {
  try {
    console.log("[fetchDuneStats] Fetching data for FID:", fid);
    
    // Use the new API endpoint instead of connecting to SQLite directly
    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://nuts-founder.vercel.app";
    const apiUrl = `${baseUrl}/api/dune-stats?fid=${fid}`;
    console.log("[fetchDuneStats] Calling API:", apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Use cache: 'no-store' to ensure fresh data
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error("[fetchDuneStats] API responded with status:", response.status);
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("[fetchDuneStats] API response:", data);
    
    return {
      allTimeEarning: data.allTimeEarning || 0,
      rank: data.rank || 0
    };
  } catch (err) {
    console.error("[fetchDuneStats] Failed to fetch data:", err);
    return { allTimeEarning: 0, rank: 0 };
  }
}

// تابع برای دریافت اطلاعات NFT مشابه Demo.tsx
async function fetchNFTData(userData: NeynarUser | null): Promise<{ allowance: number | string; memberType: string }> {
  try {
    if (!userData) {
      console.log("[fetchNFTData] No userData provided, returning default");
      return { allowance: "Mint your allowance", memberType: "Not Active" };
    }
    
    console.log("[fetchNFTData] Fetching NFT data for wallets:", userData.verifications);
    
    const wallets = userData.verifications || [];
    if (userData.custody_address && !wallets.includes(userData.custody_address)) {
      wallets.push(userData.custody_address);
    }
    
    if (wallets.length === 0) {
      console.log("[fetchNFTData] No wallets available, returning default");
      return { allowance: "Mint your allowance", memberType: "Not Active" };
    }
    
    const apiUrl = `${process.env.NEXT_PUBLIC_URL || "https://nuts-founder.vercel.app"}/api/nft-data`;
    console.log("[fetchNFTData] Fetching from API:", apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wallets }),
    });
    
    if (!response.ok) {
      console.error("[fetchNFTData] API responded with status:", response.status);
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("[fetchNFTData] Returning:", { allowance: data.allowance, memberType: data.memberType });
    return { 
      allowance: data.allowance > 0 ? data.allowance : "Mint your allowance", 
      memberType: data.memberType 
    };
  } catch (err) {
    console.error("[fetchNFTData] Failed to fetch NFT data:", err);
    return { allowance: "Mint your allowance", memberType: "Not Active" };
  }
}

// تابع برای اعتبارسنجی URL
function isValidUrl(url: string | undefined): boolean {
  if (!url || typeof url !== "string" || url.trim() === "") return false;
  try {
    const parsedUrl = new URL(url);
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

async function loadFont(): Promise<ArrayBuffer> {
  const fontUrl = `${process.env.NEXT_PUBLIC_URL || "https://nuts-founder.vercel.app"}/fonts/poetsen-one.ttf`;
  console.log("[loadFont] Fetching font from:", fontUrl);
  const res = await fetch(fontUrl);
  if (!res.ok) {
    console.error("[loadFont] Failed to fetch font, status:", res.status);
    throw new Error("Failed to fetch local font");
  }
  return await res.arrayBuffer();
}

export default async function Image({ params }: { params?: { fid?: string } }) {
  const fid = params?.fid || "443855"; // FID پیش‌فرض
  console.log("[Image] Processing FID:", fid);

  const userData = await fetchUserData(fid);
  const tipStats = await fetchTipStats(fid);
  const duneStats = await fetchDuneStats(fid);
  const nftData = await fetchNFTData(userData);

  const stats: TipStats = {
    todayEarning: tipStats.todayEarning,
    allTimeEarning: duneStats.allTimeEarning,
    tippedToday: tipStats.tippedToday,
    rank: duneStats.rank,
    allowance: nftData.allowance.toString(),
    memberType: nftData.memberType,
  };

  console.log("[Image] Final stats:", stats);

  // اعتبارسنجی URL تصویر پروفایل
  const profileImageUrl = isValidUrl(userData?.pfp_url)
    ? userData?.pfp_url
    : "https://via.placeholder.com/150";

  try {
    const fontData = await loadFont();

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #2b1409, #4a2512, #6b3a1e)",
            fontFamily: '"Poetsen One", sans-serif',
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "rgba(58, 42, 26, 0.85)",
              borderRadius: "24px",
              padding: "32px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(90, 58, 42, 0.5)",
              maxWidth: "1000px",
            }}
          >
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              marginBottom: "24px" 
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profileImageUrl}
                alt="User Profile"
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  border: "4px solid #ffffff",
                  marginRight: "16px",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <h1 style={{ fontSize: "48px", color: "#f5c542", margin: "0" }}>
                  @{userData?.username || "Unknown"}
                </h1>
                <p style={{ fontSize: "24px", color: "#ffffff", margin: "0" }}>FID: {fid}</p>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                width: "100%",
                justifyContent: "center",
              }}
            >
              {[
                { label: "Today Earning", value: `${stats.todayEarning} 🥜` },
                { label: "All-Time Earning", value: `${stats.allTimeEarning} 🥜` },
                { label: "Tipped Today", value: `${stats.tippedToday} 🥜` },
                { label: "Rank", value: `#${stats.rank}` },
                { label: "Allowance", value: stats.allowance },
                { label: "Member Type", value: stats.memberType },
              ].map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: "#4a3a2a",
                    borderRadius: "12px",
                    padding: "16px",
                    textAlign: "center",
                    boxShadow: "0 4px 16px rgba(245, 197, 66, 0.2)",
                    width: "49%",
                    boxSizing: "border-box",
                  }}
                >
                  <p style={{ fontSize: "20px", color: "#f5c542", margin: "0 0 8px 0" }}>{item.label}</p>
                  <p style={{ fontSize: "28px", color: "#ffffff", margin: "0" }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: "20px", color: "#f5c542", marginTop: "16px" }}>
            Frame by: @arsalang.eth & @jeyloo.eth
          </p>
        </div>
      ),
      {
        ...size,
        fonts: [
          {
            name: "Poetsen One",
            data: fontData,
            style: "normal",
            weight: 400,
          },
        ],
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error("[Image] Error generating ImageResponse:", error);
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#ffffff",
            color: "#000000",
            fontFamily: "sans-serif",
            fontSize: "24px",
          }}
        >
          Error loading image
        </div>
      ),
      { ...size }
    );
  }
}