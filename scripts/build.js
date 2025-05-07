import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import dotenv from 'dotenv';
import crypto from 'crypto';

// ANSI color codes
const yellow = '\x1b[33m';
const italic = '\x1b[3m';
const reset = '\x1b[0m';

// Load environment variables in specific order
// First load .env for main config
dotenv.config({ path: '.env' });
// Then load .env.local to override
if (fs.existsSync('.env.local')) {
  const localEnv = dotenv.parse(fs.readFileSync('.env.local'));
  Object.entries(localEnv).forEach(([key, value]) => {
    process.env[key] = value;
  });
  console.log('✅ Loaded values from .env.local');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

async function validateDomain(domain) {
  // Remove http:// or https:// if present
  const cleanDomain = domain.replace(/^https?:\/\//, '');
  
  // Basic domain validation
  if (!cleanDomain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/)) {
    throw new Error('Invalid domain format');
  }

  return cleanDomain;
}

async function queryNeynarApp(apiKey) {
  if (!apiKey) {
    return null;
  }
  try {
    const response = await fetch(
      `https://api.neynar.com/portal/app_by_api_key`,
      {
        headers: {
          'x-api-key': apiKey
        }
      }
    );
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error querying Neynar app data:', error);
    return null;
  }
}

async function generateFarcasterMetadata(domain, fid, webhookUrl) {
  // Create a basic metadata object without signature
  return {
    frame: {
      version: "1",
      name: process.env.NEXT_PUBLIC_FRAME_NAME,
      iconUrl: `https://${domain}/icon.png`,
      homeUrl: `https://${domain}`,
      imageUrl: `https://${domain}/opengraph-image`,
      buttonTitle: process.env.NEXT_PUBLIC_FRAME_BUTTON_TEXT,
      splashImageUrl: `https://${domain}/splash.png`,
      splashBackgroundColor: "#f7f7f7",
      webhookUrl,
    },
  };
}

async function main() {
  try {
    console.log('\n📝 Checking environment variables...');
    
    // Get domain from user
    const { domain } = await inquirer.prompt([
      {
        type: 'input',
        name: 'domain',
        message: 'Enter the domain where your frame will be deployed (e.g., example.com):',
        default: process.env.NEXT_PUBLIC_URL?.replace(/^https?:\/\//, ''),
        validate: async (input) => {
          try {
            await validateDomain(input);
            return true;
          } catch (error) {
            return error.message;
          }
        }
      }
    ]);

    // Get frame name from user
    const { frameName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'frameName',
        message: 'Enter the name for your frame (e.g., My Cool Frame):',
        default: process.env.NEXT_PUBLIC_FRAME_NAME,
        validate: (input) => {
          if (input.trim() === '') {
            return 'Frame name cannot be empty';
          }
          return true;
        }
      }
    ]);

    // Get button text from user
    const { buttonText } = await inquirer.prompt([
      {
        type: 'input',
        name: 'buttonText',
        message: 'Enter the text for your frame button:',
        default: process.env.NEXT_PUBLIC_FRAME_BUTTON_TEXT || 'Launch Frame',
        validate: (input) => {
          if (input.trim() === '') {
            return 'Button text cannot be empty';
          }
          return true;
        }
      }
    ]);

    // Get Neynar configuration
    let neynarApiKey = process.env.NEYNAR_API_KEY;
    let neynarClientId = process.env.NEYNAR_CLIENT_ID;
    let useNeynar = true;

    while (useNeynar) {
      if (!neynarApiKey) {
        const { neynarApiKey: inputNeynarApiKey } = await inquirer.prompt([
          {
            type: 'password',
            name: 'neynarApiKey',
            message: 'Enter your Neynar API key (optional - leave blank to skip):',
            default: null
          }
        ]);
        neynarApiKey = inputNeynarApiKey;
      } else {
        console.log('Using existing Neynar API key from environment');
      }

      if (!neynarApiKey) {
        useNeynar = false;
        break;
      }

      // Try to get client ID from API
      const appInfo = await queryNeynarApp(neynarApiKey);
      if (appInfo) {
        neynarClientId = appInfo.app_uuid;
        console.log('✅ Fetched Neynar app client ID');
        break;
      }

      // If we get here, the API key was invalid
      console.log('\n⚠️  Could not find Neynar app information. The API key may be incorrect.');
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Would you like to try a different API key?',
          default: true
        }
      ]);

      // Reset for retry
      neynarApiKey = null;
      neynarClientId = null;

      if (!retry) {
        useNeynar = false;
        break;
      }
    }

    // Prompt for FID if not already set
    let fid = process.env.FID;
    if (!fid) {
      const { inputFid } = await inquirer.prompt([
        {
          type: 'input',
          name: 'inputFid',
          message: 'Enter your Farcaster ID (FID):',
          validate: (input) => {
            if (!input || isNaN(Number(input.trim()))) {
              return 'FID must be a valid number';
            }
            return true;
          }
        }
      ]);
      fid = inputFid;
    } else {
      console.log('Using existing FID from environment:', fid);
    }

    // Determine webhook URL based on environment variables
    const webhookUrl = neynarApiKey && neynarClientId 
      ? `https://api.neynar.com/f/app/${neynarClientId}/event`
      : `https://${domain}/api/webhook`;

    const metadata = await generateFarcasterMetadata(domain, fid, webhookUrl);
    console.log('\n✅ Frame manifest generated');

    // Read existing .env file or create new one
    const envPath = path.join(projectRoot, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    // Add or update environment variables
    const newEnvVars = [
      // Base URL
      `NEXT_PUBLIC_URL=https://${domain}`,

      // Frame metadata
      `NEXT_PUBLIC_FRAME_NAME="${frameName}"`,
      `NEXT_PUBLIC_FRAME_DESCRIPTION="${process.env.NEXT_PUBLIC_FRAME_DESCRIPTION || ''}"`,
      `NEXT_PUBLIC_FRAME_BUTTON_TEXT="${buttonText}"`,

      // Neynar configuration (if it exists in current env)
      ...(neynarApiKey ? 
        [`NEYNAR_API_KEY="${neynarApiKey}"`] : []),
      ...(neynarClientId ? 
        [`NEYNAR_CLIENT_ID="${neynarClientId}"`] : []),

      // FID
      `FID="${fid}"`,

      // NextAuth configuration
      `NEXTAUTH_SECRET="${process.env.NEXTAUTH_SECRET || crypto.randomBytes(32).toString('hex')}"`,
      `NEXTAUTH_URL="https://${domain}"`,

      // Frame manifest with metadata
      `FRAME_METADATA=${JSON.stringify(metadata)}`,
    ];

    // Filter out empty values and join with newlines
    const validEnvVars = newEnvVars.filter(line => {
      const [, value] = line.split('=');
      return value && value !== '""';
    });

    // Update or append each environment variable
    validEnvVars.forEach(varLine => {
      const [key] = varLine.split('=');
      if (envContent.includes(`${key}=`)) {
        envContent = envContent.replace(new RegExp(`${key}=.*`), varLine);
      } else {
        envContent += `\n${varLine}`;
      }
    });

    // Write updated .env file
    fs.writeFileSync(envPath, envContent);

    console.log('\n✅ Environment variables updated');

    // Run next build
    console.log('\nBuilding Next.js application...');
    execSync('next build', { cwd: projectRoot, stdio: 'inherit' });

    console.log('\n✨ Build complete! Your frame is ready for deployment. 🪐');
    console.log('📝 Make sure to configure the environment variables from .env in your hosting provider');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
