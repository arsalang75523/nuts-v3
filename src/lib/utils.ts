import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function getFarcasterMetadata() {
  // Get environment variables
  const fid = process.env.FID;
  const appUrl = process.env.NEXT_PUBLIC_URL;
  const neynarApiKey = process.env.NEYNAR_API_KEY;
  const neynarClientId = process.env.NEYNAR_CLIENT_ID;
  const seedPhrase = process.env.SEED_PHRASE;
  
  // Get accountAssociation from environment variables if available
  const accountAssociationHeader = process.env.ACCOUNT_ASSOCIATION_HEADER;
  const accountAssociationPayload = process.env.ACCOUNT_ASSOCIATION_PAYLOAD;
  const accountAssociationSignature = process.env.ACCOUNT_ASSOCIATION_SIGNATURE;
  
  if (!fid) {
    throw new Error("FID is required in environment variables");
  }
  
  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_URL is required in environment variables");
  }
  
  // Determine webhook URL based on Neynar configuration
  const webhookUrl = neynarApiKey && neynarClientId 
    ? `https://api.neynar.com/f/app/${neynarClientId}/event`
    : `${appUrl}/api/webhook`;
  
  // Get frame metadata from environment if available
  if (process.env.FRAME_METADATA) {
    try {
      const metadata = JSON.parse(process.env.FRAME_METADATA);
      return metadata;
    } catch {
      console.warn("Failed to parse FRAME_METADATA, generating metadata instead");
    }
  }
  
  // Build frame object that's used in all scenarios
  const frame = {
    version: "1",
    name: process.env.NEXT_PUBLIC_FRAME_NAME || "Frame App",
    iconUrl: `${appUrl}/icon.png`,
    homeUrl: appUrl,
    imageUrl: `${appUrl}/opengraph-image`,
    buttonTitle: process.env.NEXT_PUBLIC_FRAME_BUTTON_TEXT || "Launch Frame",
    splashImageUrl: `${appUrl}/splash.png`,
    splashBackgroundColor: "#f7f7f7",
    webhookUrl,
  };
  
  // First priority: Check if accountAssociation is available in environment variables
  if (accountAssociationHeader && accountAssociationPayload && accountAssociationSignature) {
    console.log("Using accountAssociation from environment variables");
    return {
      accountAssociation: {
        header: accountAssociationHeader,
        payload: accountAssociationPayload,
        signature: accountAssociationSignature
      },
      frame,
    };
  }
  
  // Second priority: If we have a seed phrase, generate accountAssociation
  if (seedPhrase) {
    try {
      const { mnemonicToAccount } = await import('viem/accounts');
      
      const domain = new URL(appUrl).hostname;
      
      const account = mnemonicToAccount(seedPhrase);
      
      const header = {
        fid: parseInt(fid),
        type: 'custody',
        key: account.address,
      };
      const encodedHeader = Buffer.from(JSON.stringify(header), 'utf-8').toString('base64');
      
      const payload = { domain };
      const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
      
      const signature = await account.signMessage({ 
        message: `${encodedHeader}.${encodedPayload}`
      });
      const encodedSignature = Buffer.from(signature, 'utf-8').toString('base64url');
      
      return {
        accountAssociation: {
          header: encodedHeader,
          payload: encodedPayload,
          signature: encodedSignature
        },
        frame,
      };
    } catch (error) {
      console.error("Error generating signed manifest:", error);
    }
  }
  
  return { frame };
}
