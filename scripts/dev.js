import localtunnel from "localtunnel";
import { spawn } from "child_process";
import { createServer } from "net";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

let tunnel;
let nextDev;
let isCleaningUp = false;

async function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(true)); // Port is in use
    server.once("listening", () => {
      server.close();
      resolve(false); // Port is free
    });

    server.listen(port);
  });
}

async function killProcessOnPort(port) {
  try {
    if (process.platform === "win32") {
      const netstat = spawn("netstat", ["-ano", "|", "findstr", `:${port}`]);
      netstat.stdout.on("data", (data) => {
        const match = data.toString().match(/\s+(\d+)$/);
        if (match) {
          const pid = match[1];
          spawn("taskkill", ["/F", "/PID", pid]);
        }
      });
      await new Promise((resolve) => netstat.on("close", resolve));
    } else {
      const lsof = spawn("lsof", ["-ti", `:${port}`]);
      lsof.stdout.on("data", (data) => {
        data
          .toString()
          .split("\n")
          .forEach((pid) => {
            if (pid) process.kill(parseInt(pid), "SIGKILL");
          });
      });
      await new Promise((resolve) => lsof.on("close", resolve));
    }
  } catch {
    // Ignore errors if no process found
  }
}

async function startDev() {
  const isPortInUse = await checkPort(3000);
  if (isPortInUse) {
    console.error(
      "Port 3000 is already in use. To find and kill the process using this port:\n\n" +
        (process.platform === "win32"
          ? "1. Run: netstat -ano | findstr :3000\n" +
            "2. Note the PID (Process ID) from the output\n" +
            "3. Run: taskkill /PID <PID> /F\n"
          : "1. On macOS/Linux, run: lsof -i :3000\n" +
            "2. Note the PID (Process ID) from the output\n" +
            "3. Run: kill -9 <PID>\n") +
        "\nThen try running this command again."
    );
    process.exit(1);
  }

  const useTunnel = process.env.USE_TUNNEL === "true";
  let frameUrl;

  if (useTunnel) {
    tunnel = await localtunnel({ port: 3000 });
    let ip;
    try {
      ip = await fetch("https://ipv4.icanhazip.com")
        .then((res) => res.text())
        .then((ip) => ip.trim());
    } catch (error) {
      console.error("Error getting IP address:", error);
    }

    frameUrl = tunnel.url;
    console.log(`
🌐 Local tunnel URL: ${tunnel.url}

💻 To test on desktop:
   1. Open the localtunnel URL in your browser: ${tunnel.url}
   2. Enter your IP address in the password field${
     ip ? `: ${ip}` : ""
   } (note that this IP may be incorrect if you are using a VPN)
   3. Click "Click to Submit" -- your frame should now load in the browser
   4. Navigate to the Warpcast Frame Developer Tools: https://warpcast.com/~/developers/frames
   5. Enter your frame URL: ${tunnel.url}
   6. Click "Preview" to launch your frame within Warpcast (note that it may take ~10 seconds to load)

❗️ You will not be able to load your frame in Warpcast until    ❗️
❗️ you submit your IP address in the localtunnel password field ❗️

📱 To test in Warpcast mobile app:
   1. Open Warpcast on your phone
   2. Go to Settings > Developer > Frames
   4. Enter this URL: ${tunnel.url}
   5. Click "Preview" (note that it may take ~10 seconds to load)
`);
  } else {
    frameUrl = "https://specialt.work.gd";
    console.log(`
💻 To test your frame:
   1. Open the Warpcast Frame Developer Tools: https://warpcast.com/~/developers/frames
   2. Scroll down to the "Preview Frame" tool
   3. Enter this URL: ${frameUrl}
   4. Click "Preview" to test your frame

Note: For validation to pass, ensure your .env contains:
- FID="395478"
- NEXT_PUBLIC_URL="${frameUrl}"
- NEXTAUTH_URL="${frameUrl}"

And make sure /.well-known/farcaster.json is accessible at ${frameUrl}/.well-known/farcaster.json
`);

    // Create a temporary .env.development if it doesn't exist
    try {
      const fs = await import('fs');
      const envPath = path.join(projectRoot, '.env.development');
      
      // Check if .env.development exists, if not create it with essential values
      if (!fs.existsSync(envPath)) {
        const envContent = `
NEXT_PUBLIC_URL=${frameUrl}
NEXTAUTH_URL=${frameUrl}
FID=${process.env.FID || '395478'}
        `;
        fs.writeFileSync(envPath, envContent.trim());
        console.log('Created temporary .env.development with correct URLs for development');
      }
    } catch (error) {
      console.warn('Failed to create development environment file:', error);
    }
  }

  const nextBin =
    process.platform === "win32"
      ? path.join(projectRoot, "node_modules", ".bin", "next.cmd")
      : path.join(projectRoot, "node_modules", ".bin", "next");

  console.log("Starting Next.js with binary:", nextBin);

  nextDev = spawn(
    process.platform === "win32" ? "cmd.exe" : nextBin,
    process.platform === "win32"
      ? ["/c", nextBin, "dev", ...(useTunnel ? [] : ["--experimental-https"])]
      : ["dev", ...(useTunnel ? [] : ["--experimental-https"])],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NEXT_PUBLIC_URL: frameUrl,
        NEXTAUTH_URL: frameUrl,
      },
      cwd: projectRoot,
    }
  );

  const cleanup = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;

    console.log("\n\nShutting down...");

    try {
      if (nextDev) {
        nextDev.kill("SIGKILL");
        if (nextDev?.pid) process.kill(-nextDev.pid);
        console.log("🛑 Next.js dev server stopped");
      }

      if (tunnel) {
        await tunnel.close();
        console.log("🌐 Tunnel closed");
      }

      await killProcessOnPort(3000);
    } catch (error) {
      console.error("Error during cleanup:", error);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);
  if (tunnel) tunnel.on("close", cleanup);
}

startDev().catch(console.error);
