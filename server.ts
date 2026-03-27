import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Proxy for Groq to keep keys on server
  app.post("/api/proxy/groq", async (req, res) => {
    const groqKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;
    
    if (!groqKey) {
      console.error("Groq Proxy Error: Key not found in process.env. Available keys:", Object.keys(process.env).filter(k => k.includes('KEY') || k.includes('GROQ')));
      return res.status(500).json({ error: "Groq API key not configured on server. Please add VITE_GROQ_API_KEY to Settings." });
    }

    try {
      console.log(`Proxying request to Groq (Key found: ${groqKey.substring(0, 4)}...)...`);
      console.log("Request body:", JSON.stringify(req.body));
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Groq API Error (${response.status}):`, errorText);
        
        // Forward the specific error status
        return res.status(response.status).json({ error: errorText, status: response.status });
      }

      const data = await response.json();
      console.log("Groq API Response:", JSON.stringify(data));
      res.json(data);
    } catch (error: any) {
      console.error("Groq Proxy Exception:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/health/keys", (req, res) => {
    res.json({
      gemini: !!process.env.GEMINI_API_KEY,
      groq: !!(process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY)
    });
  });

  // Shared stability modifiers
  const getStablePrompt = (prompt: string) => `${prompt}, highly detailed, consistent style, stable composition, high quality, no extra limbs, sharp focus`;

  // Helper: Pollinations generation with retry
  async function generateImagePollinations(prompt: string, model: string, width: number, height: number, seed: number, retries = 2) {
    const cleanPrompt = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();
    const stablePrompt = getStablePrompt(cleanPrompt);
    // Restore correct endpoints
    const commonParams = `width=${width}&height=${height}&seed=${seed}&model=${model}&nologo=true`;
    const urls = [
      `https://image.pollinations.ai/prompt/${encodeURIComponent(stablePrompt)}?${commonParams}`
    ];

    for (let i = 0; i < retries; i++) {
      for (const url of urls) {
        try {
          console.log(`Trying Pollinations URL: ${url}`);
          const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
          if (process.env.POLLINATIONS_API_KEY) {
            headers["Authorization"] = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
          }
          const response = await fetch(url, {
            headers,
            timeout: 60000
          });

          if (!response.ok) throw new Error(`Pollinations error: ${response.status}`);

          const buffer = await response.buffer();
          const textSample = buffer.slice(0, 500).toString('utf8').toLowerCase();
          if (textSample.includes("<!doctype html") || textSample.includes("<html")) {
            console.error("Pollinations returned HTML error page. Content sample:", textSample.substring(0, 200));
            throw new Error("Pollinations returned an HTML error page.");
          }

          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
          const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
          const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

          if ((isPng || isJpg || isWebp) && buffer.length > 3000) {
            return { buffer, contentType: isPng ? "image/png" : isJpg ? "image/jpeg" : "image/webp" };
          }
          throw new Error(`Pollinations returned invalid data (${buffer.length} bytes).`);
        } catch (error: any) {
          console.warn(`Attempt ${i + 1} failed for Pollinations: ${error.message}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
    throw new Error("Max retries reached for Pollinations");
  }

  // Helper: MCP generation with retry
  async function generateImageMCP(prompt: string, model: string, seed: number, retries = 3) {
    const cleanPrompt = prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();
    const stablePrompt = getStablePrompt(cleanPrompt);
    const url = `https://t2i.mcpcore.xyz/generate`;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
          body: JSON.stringify({ prompt: stablePrompt, model, orientation: "square", seed, guidance_scale: 7.5, steps: 30 }),
          timeout: 60000
        });

        if (!response.ok) throw new Error(`MCP Free API error: ${response.status} ${response.statusText}`);

        const data = await response.json();
        if (!data.success || !data.imageUrl) throw new Error(`MCP Free API error: ${data.error || "No image URL returned"}`);

        const imageRes = await fetch(data.imageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 });
        if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.status}`);

        const contentType = imageRes.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) throw new Error("MCP Free returned HTML error page.");

        const buffer = await imageRes.buffer();
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
        const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

        if ((isPng || isJpg || isWebp) && buffer.length > 3000) {
          return { buffer, contentType: isPng ? "image/png" : isJpg ? "image/jpeg" : "image/webp" };
        }
        throw new Error(`MCP Free returned invalid image data (${buffer.length} bytes).`);
      } catch (error: any) {
        console.warn(`Attempt ${i + 1} failed for MCP (${model}): ${error.message}`);
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
    throw new Error("Max retries reached for MCP");
  }

  // API Proxy for Pollinations to bypass CORS and environment issues
  app.get("/api/proxy/pollinations", async (req, res) => {
    const { prompt, width, height, seed, model } = req.query;
    if (!prompt) return res.status(400).send("Prompt is required");

    console.log(`Pollinations Proxy: prompt=${prompt}, model=${model}`);

    try {
      const selectedModel = model as string || 'flux';
      let result;
      let lastError = "No models tried";

      try {
        console.log(`Trying Pollinations model: ${selectedModel}`);
        result = await generateImagePollinations(prompt as string, selectedModel, parseInt(width as string) || 1024, parseInt(height as string) || 1024, parseInt(seed as string) || 42, 2);
      } catch (error: any) {
        lastError = error.message;
        console.warn(`Pollinations model ${selectedModel} failed: ${lastError}`);
      }

      if (!result) throw new Error(lastError);

      res.set("Content-Type", result.contentType);
      res.set("Cache-Control", "public, max-age=31536000");
      res.set("Access-Control-Allow-Origin", "*");
      return res.send(result.buffer);
    } catch (error: any) {
      console.error("Pollinations Proxy Exception:", error.message);
      res.status(500).send(error.message);
    }
  });

  // API Proxy for MCP Free
  app.get("/api/proxy/mcp", async (req, res) => {
    const { prompt, model, seed } = req.query;
    if (!prompt) return res.status(400).send("Prompt is required");

    const selectedModel = model as string || 'flux';

    try {
      let result;
      try {
        result = await generateImageMCP(prompt as string, selectedModel, parseInt(seed as string) || 42, 3);
      } catch (error: any) {
        console.warn(`Primary model (${selectedModel}) failed, trying fallback (flux):`, error.message);
        if (selectedModel !== 'flux') {
          result = await generateImageMCP(prompt as string, 'flux', parseInt(seed as string) || 42, 3);
        } else {
          throw error;
        }
      }

      res.set("Content-Type", result.contentType);
      res.set("Cache-Control", "public, max-age=31536000");
      res.set("Access-Control-Allow-Origin", "*");
      return res.send(result.buffer);
    } catch (error: any) {
      console.error("MCP Proxy Exception:", error.message);
      res.status(500).send(error.message);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
