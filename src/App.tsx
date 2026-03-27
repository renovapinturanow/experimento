import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, Download, Wand2, Play, Pause, Film, Image as ImageIcon, XCircle, Settings2, Zap, Clock, Droplets, Monitor, Repeat, ChevronLeft, ChevronRight, Waves } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import ParticleBackground from './components/ParticleBackground';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PRESETS = [
  {
    id: 'exploded',
    name: 'Desglose Técnico',
    duration: '3.0s',
    icon: <Zap className="w-4 h-4" />,
    description: 'Ideal para ingeniería y diseño industrial. Expansión simétrica y clara.',
    template: 'High-precision technical exploded view of [OBJECT]. Cinematic product showcase. All internal components, micro-gears, and circuitry flying apart in a controlled, symmetrical expansion. No overlapping components, clear separation, technical blueprint aesthetic. Cinematic studio lighting, ray-traced reflections, 8k resolution, industrial design, clean neutral background.',
    frames: 72,
    fps: 24
  },
  {
    id: 'cascade',
    name: 'Cascada de Piezas',
    duration: '3.0s',
    icon: <Wand2 className="w-4 h-4" />,
    description: 'Efecto de caída en cascada de componentes. Dinámico y fluido.',
    template: 'Cascading disassembly of [OBJECT]. Components falling and separating in a fluid, sequential waterfall motion. Gravity-defying physics, elegant mechanical flow. Cinematic lighting with motion blur, high-speed photography style, 8k, photorealistic, premium studio setting.',
    frames: 72,
    fps: 24
  },
  {
    id: 'blueprint',
    name: 'Plano Holográfico',
    duration: '2.5s',
    icon: <Monitor className="w-4 h-4" />,
    description: 'Estilo esquemático con líneas de luz y datos. Estética sci-fi.',
    template: 'Holographic blueprint projection of [OBJECT]. Glowing cyan wireframe lines, digital data streams, floating UI elements. Translucent surfaces, flickering light effects. Dark void background with grid floor. Sci-fi high-tech aesthetic, 8k, vector style, sharp lines.',
    frames: 60,
    fps: 24
  },
  {
    id: 'organic',
    name: 'Crecimiento Orgánico',
    duration: '3.0s',
    icon: <Droplets className="w-4 h-4" />,
    description: 'El objeto se forma a partir de partículas líquidas o raíces.',
    template: 'Organic growth of [OBJECT]. Form emerging from swirling liquid metal and bioluminescent roots. Fluid transformation, cellular division aesthetic. Soft natural lighting, macro textures, 8k, surreal masterpiece, highly detailed surfaces.',
    frames: 72,
    fps: 24
  },
  {
    id: 'orbit',
    name: 'Órbita de Producto',
    duration: '4.0s',
    icon: <Clock className="w-4 h-4" />,
    description: 'Movimiento de cámara fluido en 360°. Calidad comercial.',
    template: 'Professional 360-degree gimbal orbit around [OBJECT]. Smooth, steady-cam movement. High-end commercial aesthetic, perfect spatial depth, parallax effect. Natural dramatic lighting, 8k, commercial-grade rendering, premium materials.',
    frames: 96,
    fps: 24
  },
  {
    id: 'action',
    name: 'Acción Cinemática',
    duration: '3.0s',
    icon: <Waves className="w-4 h-4" />,
    description: 'Movimiento dinámico y fluido en entornos naturales. Ideal para vida silvestre.',
    template: 'Cinematic action sequence of [OBJECT]. High-speed dynamic movement, splashing water, natural environment. Photorealistic, hyper-detailed, 8k, National Geographic style photography. Dramatic natural lighting, motion blur, water droplets, bubbles, intense energy, high-speed shutter.',
    frames: 72,
    fps: 24
  }
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [engine, setEngine] = useState<'gemini' | 'pollinations' | 'gemini-image' | 'mcp-free'>('gemini');
  const [mcpModel, setMcpModel] = useState('flux');
  const [pollModel, setPollModel] = useState('flux');
  const [useGroqPlanning, setUseGroqPlanning] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Configurable settings
  const [targetFrames, setTargetFrames] = useState(72);
  const [targetFps, setTargetFps] = useState(24);
  const [showSettings, setShowSettings] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [keysStatus, setKeysStatus] = useState({ gemini: false, groq: false });

  useEffect(() => {
    const checkKeys = async () => {
      try {
        const res = await fetch('/api/health/keys');
        if (res.ok) {
          const data = await res.json();
          setKeysStatus(data);
        } else {
          // Fallback to client-side check if server fails
          const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (window as any).GROQ_API_KEY;
          const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
          setKeysStatus({ gemini: !!geminiKey, groq: !!groqKey });
        }
      } catch (e) {
        // Fallback to client-side check
        const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (window as any).GROQ_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
        setKeysStatus({ gemini: !!geminiKey, groq: !!groqKey });
      }
    };
    checkKeys();
    
    // Check every 10 seconds to detect updates in Settings
    const interval = setInterval(checkKeys, 10000);
    return () => clearInterval(interval);
  }, []);
  
  // Active settings during generation
  const [activeTotalFrames, setActiveTotalFrames] = useState(72);
  const [activeFps, setActiveFps] = useState(24);

  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelled = useRef(false);

  const calculatedDuration = (targetFrames / targetFps).toFixed(1);

  // Quality indicator logic
  const getQualityLabel = () => {
    if (targetFps >= 60) return { label: 'Ultra-Smooth', color: 'text-cyan-400 bg-cyan-400/10' };
    if (targetFps >= 30) return { label: 'Video Pro', color: 'text-blue-400 bg-blue-400/10' };
    if (targetFps >= 24) return { label: 'Cinematic', color: 'text-purple-400 bg-purple-400/10' };
    return { label: 'Standard', color: 'text-white/40 bg-white/5' };
  };

  const quality = getQualityLabel();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Playback logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (frames.length === 0) return;
      
      // Don't trigger shortcuts if user is typing in the prompt input
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayback();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setIsPlaying(false);
          setCurrentFrameIndex(prev => (prev > 0 ? prev - 1 : frames.length - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setIsPlaying(false);
          setCurrentFrameIndex(prev => (prev < frames.length - 1 ? prev + 1 : 0));
          break;
        case 'KeyL':
          e.preventDefault();
          setIsLooping(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [frames.length, isPlaying]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && frames.length > 0) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          if (prev < frames.length - 1) {
            return prev + 1;
          } else {
            if (isLooping) return 0;
            setIsPlaying(false);
            return prev;
          }
        });
      }, 1000 / activeFps);
    }
    return () => clearInterval(interval);
  }, [isPlaying, frames.length, activeFps, isLooping]);

  const handleCancel = () => {
    isCancelled.current = true;
    setIsGenerating(false);
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setSelectedPresetId(preset.id);
    setTargetFrames(preset.frames);
    setTargetFps(preset.fps);
    inputRef.current?.focus();
  };

  const handleExampleClick = (exampleObj: string, presetId: string) => {
    setPrompt(exampleObj);
    const preset = PRESETS.find(p => p.id === presetId);
    if (preset) {
      applyPreset(preset);
    }
  };

  const handleRandomize = () => {
    const objects = ['un motor de jet', 'un reloj suizo', 'un teclado mecánico', 'un setup de gaming', 'un robot futurista', 'un zapato deportivo', 'una cámara vintage', 'un dron', 'un sintetizador', 'un telescopio'];
    const randomObject = objects[Math.floor(Math.random() * objects.length)];
    setPrompt(randomObject);
    
    const randomPreset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    setSelectedPresetId(randomPreset.id);
    setTargetFrames(randomPreset.frames);
    setTargetFps(randomPreset.fps);
  };

  const handleClear = () => {
    setPrompt('');
    setSelectedPresetId(null);
    setFrames([]);
    setCurrentFrameIndex(0);
    setError(null);
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setProgress(0);
    isCancelled.current = false;
    
    setActiveTotalFrames(targetFrames);
    setActiveFps(targetFps);

    // Construct final prompt based on preset
    let finalPrompt = prompt;
    const selectedPreset = PRESETS.find(p => p.id === selectedPresetId);

    if (selectedPreset) {
      finalPrompt = selectedPreset.template.replace('[OBJECT]', prompt);
    }

    const generatedFrames: string[] = [];

    const callApiWithRetry = async (parts: any[], frameIndex: number) => {
      // Dynamic initialization with multi-source key detection
      const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
      
      const seed = 42 + frameIndex;

      // Helper to process image data through canvas for normalization and validation
      const processImageData = async (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(blob);
          
          img.onload = () => {
            URL.revokeObjectURL(url);
            if (img.width === 0 || img.height === 0) {
              return reject(new Error("Invalid image dimensions (0x0)"));
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Canvas error"));
            
            // Fill with white first to avoid black transparency issues
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.drawImage(img, 0, 0);
            
            try {
              // Check if image is mostly black (common failure mode for some models)
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              let darkPixels = 0;
              const totalPixels = canvas.width * canvas.height;
              const sampleStep = 10; // Sample every 10th pixel for performance
              
              for (let i = 0; i < imageData.length; i += 4 * sampleStep) {
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                // If pixel is very dark
                if (r < 15 && g < 15 && b < 15) {
                  darkPixels++;
                }
              }
              
              const darkRatio = darkPixels / (totalPixels / sampleStep);
              if (darkRatio > 0.98) {
                return reject(new Error("Generated image is almost entirely black"));
              }

              const data = canvas.toDataURL('image/png').split(',')[1];
              // Check if image data is too small (likely blank/error)
              // Lowered threshold to 3000 to match proxy
              if (data.length < 3000) {
                reject(new Error("Generated image data is too small or invalid"));
              } else {
                resolve(data);
              }
            } catch (err) {
              reject(new Error("Tainted canvas or processing error"));
            }
          };
          
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image decoding error - the data received was not a valid image"));
          };
          
          img.src = url;
        });
      };

      // Look for Groq key in all possible locations
      const groqKey = 
        (import.meta as any).env?.VITE_GROQ_API_KEY || 
        process.env.VITE_GROQ_API_KEY || 
        process.env.GROQ_API_KEY || 
        (window as any).GROQ_API_KEY;

      // Gemini Image Generation (High Reliability Fallback)
      if (engine === 'gemini-image') {
        if (!geminiKey) {
          throw new Error("Error: No se encontró la llave de Gemini (GEMINI_API_KEY).");
        }
        
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        let retries = 0;
        const maxRetries = 5;
        const baseDelay = 3000;

        while (retries < maxRetries) {
          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: {
                parts: [{ text: finalPrompt }]
              },
              config: {
                imageConfig: {
                  aspectRatio: "1:1"
                }
              }
            });

            let base64Data = "";
            for (const part of response.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                base64Data = part.inlineData.data;
                break;
              }
            }

            if (!base64Data) throw new Error("Gemini no devolvió ninguna imagen.");

            return {
              candidates: [{
                content: {
                  parts: [{
                    inlineData: {
                      data: base64Data,
                      mimeType: 'image/png'
                    }
                  }]
                }
              }]
            };
          } catch (err: any) {
            const isRateLimit = err.message?.includes('429') || err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.toLowerCase().includes('quota');
            if (isRateLimit && retries < maxRetries - 1) {
              retries++;
              const delay = baseDelay * Math.pow(2, retries - 1);
              setError(`Límite de cuota Gemini alcanzado. Reintentando en ${Math.round(delay/1000)}s... (${retries}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              setError(null);
            } else {
              if (isRateLimit) {
                setEngine('pollinations');
                throw new Error("Cuota de Gemini (Imagen) agotada. Cambiando automáticamente a Pollinations.ai para continuar sin esperas.");
              }
              throw err;
            }
          }
        }
      }

      // Pollinations.ai & MCP Free Logic (Unified & Robust)
      if (engine === 'pollinations' || engine === 'mcp-free') {
        let framePrompt = finalPrompt;
        
        if (useGroqPlanning) {
          try {
            // Use server-side proxy for Groq
            const groqResponse = await fetch('/api/proxy/groq', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                  {
                    role: "system",
                    content: "You are a specialized animation prompt engineer. Describe a single frame. Be concise."
                  },
                  {
                    role: "user",
                    content: `Concept: ${finalPrompt}. Frame: ${frameIndex}/${targetFrames}. Describe position/motion in 30 words.`
                  }
                ],
                temperature: 0.3
              })
            });
            
            if (groqResponse.ok) {
              const groqData = await groqResponse.json();
              const content = groqData.choices[0].message.content;
              // Validate that Groq didn't return an error message as a prompt
              if (content && !content.toLowerCase().includes("error") && !content.toLowerCase().includes("api key")) {
                framePrompt = content;
              } else {
                console.warn("Groq returned a suspicious prompt, using fallback:", content);
              }
            } else {
              const errorData = await groqResponse.json().catch(() => ({}));
              const errorMessage = errorData.error?.message || errorData.error || groqResponse.statusText;
              console.error(`Groq API Error (${groqResponse.status}):`, errorMessage);
              
              if (groqResponse.status === 500 && errorMessage.includes("not configured")) {
                // If key is missing on server, we can try client-side if available, or just fallback
                if (groqKey) {
                  console.log("Server proxy key missing, trying client-side Groq call...");
                  // Fallback to direct call if key is in client env
                  const directRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${groqKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      model: "llama-3.3-70b-versatile",
                      messages: [
                        { role: "system", content: "You are a specialized animation prompt engineer." },
                        { role: "user", content: `Concept: ${finalPrompt}. Frame: ${frameIndex}/${targetFrames}. Describe position/motion in 30 words.` }
                      ],
                      temperature: 0.3
                    })
                  });
                  if (directRes.ok) {
                    const directData = await directRes.json();
                    framePrompt = directData.choices[0].message.content;
                  }
                } else {
                  console.warn("Groq key not found anywhere, using fallback to original prompt");
                }
              }
            }
          } catch (e: any) {
            console.warn("Groq connection failed", e);
          }
        }

        if (engine === 'mcp-free') {
          const fetchMcp = async (promptText: string, seed: number, attempt = 0): Promise<string> => {
            const maxAttempts = 3;
            const proxyUrl = `/api/proxy/mcp?prompt=${encodeURIComponent(promptText)}&model=${mcpModel}&width=1024&height=1024&seed=${seed}`;
            
            try {
              const res = await fetch(proxyUrl, { cache: 'no-cache' });
              if (!res.ok) {
                const errorText = await res.text().catch(() => "Unknown MCP error");
                throw new Error(errorText);
              }
              const blob = await res.blob();
              return await processImageData(blob);
            } catch (e: any) {
              if (attempt < maxAttempts - 1) {
                console.warn(`MCP attempt ${attempt + 1} failed: ${e.message}. Retrying...`);
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                return fetchMcp(promptText, seed, attempt + 1);
              }
              throw e;
            }
          };

          const base64Data = await fetchMcp(framePrompt, seed);
          return {
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    data: base64Data,
                    mimeType: 'image/png'
                  }
                }]
              }
            }]
          };
        }

        // Robust Image Fetching Strategy with Retries and Prompt Shortening
        const fetchWithRetry = async (promptText: string, seed: number, attempt = 0): Promise<string> => {
          const maxAttempts = 4;
          // More aggressive prompt shortening: keep it very simple for Pollinations
          const words = promptText.split(/\s+/);
          const shortenedPrompt = words.slice(0, Math.max(3, 20 - (attempt * 7))).join(' ');
          const cleanPrompt = shortenedPrompt.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
          
          // Use 'flux' model which is more stable on Pollinations
          const currentModel = engine === 'pollinations' ? pollModel : 'flux';
          const commonParams = `width=1024&height=1024&seed=${seed}&nologo=true&model=${currentModel}`;
          const urls = [
            `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?${commonParams}&t=${Date.now()}`,
            `https://pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?${commonParams}`
          ];
          
          const proxyUrl = `/api/proxy/pollinations?prompt=${encodeURIComponent(cleanPrompt)}&width=1024&height=1024&seed=${seed}&nologo=true&model=${currentModel}`;

          try {
            // Strategy 1: Fetch API via Proxy
            const res = await fetch(proxyUrl, { cache: 'no-cache' });
            if (!res.ok) {
              const errorText = await res.text().catch(() => "Unknown proxy error");
              throw new Error(errorText);
            }
            const blob = await res.blob();
            return await processImageData(blob);
          } catch (e: any) {
            console.warn(`Proxy fetch attempt ${attempt + 1} failed: ${e.message}, trying direct fallback...`);
            
            const directUrl = urls[attempt % urls.length];
            try {
              const res = await fetch(directUrl, { mode: 'cors', cache: 'no-cache' });
              if (!res.ok) throw new Error(`Direct HTTP ${res.status}`);
              const blob = await res.blob();
              return await processImageData(blob);
            } catch (fallbackErr: any) {
              if (attempt < maxAttempts - 1) {
                console.warn(`Attempt ${attempt + 1} failed completely (${fallbackErr.message}). Retrying...`);
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                return fetchWithRetry(promptText, seed, attempt + 1);
              }
              throw new Error(e.message.toLowerCase().includes("html") ? 
                "El servidor de imágenes devolvió una página de error. Esto suele ocurrir por saturación o por un concepto bloqueado. Prueba con algo más simple." : 
                "Error de conexión persistente. El servidor de imágenes podría estar saturado. Intenta con un concepto más simple.");
            }
          }
        };

        const base64Data = await fetchWithRetry(framePrompt, seed);
        return {
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/png'
                }
              }]
            }
          }]
        };
      }

      // Gemini Logic
      if (!geminiKey) {
        throw new Error("Error: No se encontró la llave de Gemini (GEMINI_API_KEY).");
      }

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      let retries = 0;
      const maxRetries = 7;
      const baseDelay = 5000;

      while (retries < maxRetries) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
          });
          return response;
        } catch (err: any) {
          if (err.status === 401 || err.message?.includes('401')) {
            throw new Error("Error 401 (Gemini): Tu llave de API no es válida o no tiene permisos para generación de imágenes.");
          }
          const isRateLimit = err.message?.includes('429') || err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED') || err.message?.toLowerCase().includes('quota');
          if (isRateLimit && retries < maxRetries - 1) {
            retries++;
            const delay = baseDelay * Math.pow(2, retries - 1);
            setError(`Límite de cuota alcanzado (Frame ${frameIndex}). Reintentando en ${Math.round(delay/1000)}s... (${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            setError(null);
          } else {
            if (isRateLimit) {
              setEngine('pollinations');
              throw new Error("Cuota de Gemini agotada. Cambiando automáticamente a Pollinations.ai (Modo Emergencia) para evitar interrupciones.");
            }
            throw err;
          }
        }
      }
    };

    try {
      for (let i = 1; i <= targetFrames; i++) {
        if (isCancelled.current) {
          throw new Error("Generación cancelada por el usuario.");
        }

        const parts: any[] = [];

        if (i === 1) {
          // Frame 1: Generate from scratch - The Master Keyframe
          parts.push({
            text: `[MASTER KEYFRAME 1 OF ${targetFrames}] 
CONCEPT: "${finalPrompt}". 
TECHNICAL SPECIFICATIONS: 8k UHD, photorealistic, cinematic lighting, ray-tracing, global illumination, high dynamic range, masterpiece quality, professional product photography.
ANIMATION START: This is the absolute source of truth for the entire sequence. 
1. GEOMETRY: Establish the exact 3D structure, proportions, and mechanical details of the [OBJECT].
2. MATERIALS: Define specific textures (brushed metal, glass, carbon fiber, etc.) and their surface properties with extreme precision.
3. LIGHTING: Set a fixed 3-point studio lighting setup with clear highlights and soft shadows.
4. ENVIRONMENT: Use a clean, neutral, high-end studio background.
5. COMPOSITION: Center the object perfectly. If it's an "exploded view", start with a fully assembled state or the very first millimeter of separation.`
          });
        } else {
          // Frame 2+: Use the previous frame as an image input (Image-to-Image chaining)
          parts.push({
            inlineData: {
              data: generatedFrames[i - 2].split(',')[1], // Extract base64 without prefix
              mimeType: 'image/png'
            }
          });
          parts.push({
            text: `[FRAME ${i} OF ${targetFrames}] 
ROLE: You are a high-precision temporal interpolation engine. Your goal is to generate the next frame with ABSOLUTE consistency.
PREVIOUS STATE: The attached image is your ONLY reference for the current state.
TASK: Advance the animation of "${finalPrompt}" by exactly 1/${targetFps} of a second.

STRICT COHERENCE PROTOCOL (FORBIDDEN CHANGES):
1. NO MORPHING: Objects must not change shape, size, or geometry. 
2. NO MATERIAL SHIFTS: Textures, colors, and reflectivity must remain 100% identical to the previous frame.
3. NO LIGHTING FLICKER: The light sources, intensity, and shadow positions must be perfectly stable.
4. NO BACKGROUND CHANGES: The background must not shift, change color, or add new elements.
5. NO NEW OBJECTS: Do not introduce any elements not present in the previous frame.

MOTION LOGIC:
- If "exploded view" or "cascade": Move each component along its established linear vector by a microscopic distance. The movement must be so subtle it feels like a high-end slow-motion capture.
- If "orbit": Rotate the camera around the object by exactly ${360 / targetFrames} degrees. Maintain the exact same distance and focus point.
- If "action": Advance the natural movement of the [OBJECT] by a fraction of a second. Maintain the exact same lighting, environment, and physical properties. If it's a salmon swimming, advance the body undulation and water splash slightly.
- Maintain pixel-perfect alignment with the previous frame's established style.`
          });
        }
        
        const response = await callApiWithRetry(parts, i) as any;
        if (!response) throw new Error(`No se pudo obtener respuesta para el frame ${i}`);

        let base64Image = '';
        const candidate = response.candidates?.[0];

        if (candidate?.finishReason === 'SAFETY') {
          throw new Error(`El frame ${i} fue bloqueado por filtros de seguridad. Intenta con otro concepto.`);
        }

        for (const part of candidate?.content?.parts || []) {
          if (part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            base64Image = `data:${mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }

        if (base64Image) {
          generatedFrames.push(base64Image);
          setFrames([...generatedFrames]);
          setProgress(i);
          setCurrentFrameIndex(generatedFrames.length - 1);
        } else {
          throw new Error(`No se pudo generar el frame ${i}.`);
        }

        // Dynamic delay to prevent rate limits on large frame counts
        // Increased delays to be more conservative with API quota
        const delay = targetFrames > 144 ? 3000 : (targetFrames > 72 ? 2000 : 1500);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      if (!isCancelled.current) {
        setIsPlaying(true);
      }

    } catch (err: any) {
      console.error(err);
      if (!isCancelled.current || err.message !== "Generación cancelada por el usuario.") {
        let displayError = err.message || "Ocurrió un error al generar la animación.";
        
        // Try to parse JSON error from Gemini/Google APIs
        try {
          if (typeof displayError === 'string' && (displayError.trim().startsWith('{') || displayError.trim().startsWith('['))) {
            const parsed = JSON.parse(displayError);
            const msg = parsed.error?.message || (Array.isArray(parsed) ? parsed[0]?.error?.message : null);
            if (msg) {
              displayError = msg;
              if (parsed.error?.code === 429 || parsed.error?.status === "RESOURCE_EXHAUSTED" || msg.includes("quota")) {
                displayError = "Límite de cuota de Gemini excedido. El sistema intentará cambiar de motor automáticamente o puedes esperar unos minutos.";
              }
            }
          }
        } catch (e) {
          // Not JSON or parse failed, keep original
        }
        
        setError(displayError);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayback = () => {
    if (frames.length > 0) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownloadAll = async () => {
    if (frames.length === 0) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      frames.forEach((frame, index) => {
        // Extract base64 data without the data URI prefix
        const base64Data = frame.split(',')[1];
        const fileName = `frame_${String(index + 1).padStart(3, '0')}.png`;
        zip.file(fileName, base64Data, { base64: true });
      });
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'animador_frames.zip');
    } catch (err) {
      console.error("Error al descargar:", err);
      setError("Ocurrió un error al empaquetar las imágenes para descargar.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center p-6">
      <div className="animated-bg" />
      <ParticleBackground />

      <div className="z-10 w-full max-w-5xl flex flex-col items-center justify-center h-full gap-8">
        
        <motion.div 
          layout
          className="text-center space-y-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.h1 
            layout="position"
            className="text-5xl md:text-7xl font-display font-bold tracking-tighter"
          >
            Animador <span className="text-gradient">Studio</span>
          </motion.h1>
          {frames.length === 0 && !isGenerating && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white/50 text-lg md:text-xl font-light max-w-xl mx-auto"
            >
              Generación de secuencias hiper-detalladas (tipo cine). Escalable hasta 300+ frames con fluidez de 24-60 FPS.
            </motion.p>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {(frames.length > 0 || isGenerating) && (
            <motion.div
              key="animation-display"
              initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
              transition={{ duration: 0.7, type: "spring", bounce: 0.3 }}
              className="w-full max-w-4xl flex flex-col gap-4"
            >
              {/* Main Player Screen */}
              <div className="w-full aspect-video relative rounded-3xl overflow-hidden glass-panel group shadow-2xl shadow-purple-500/10 bg-black/40 flex items-center justify-center">
                {frames.length > 0 ? (
                  <>
                    <img 
                      src={frames[currentFrameIndex]} 
                      alt={`Frame ${currentFrameIndex + 1}`}
                      className="w-full h-full object-contain transition-opacity duration-100"
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* Player Controls Overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 flex flex-col gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden cursor-pointer relative group/progress"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percent = x / rect.width;
                          const frame = Math.floor(percent * frames.length);
                          setCurrentFrameIndex(Math.min(frame, frames.length - 1));
                        }}
                      >
                        <div 
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-100"
                          style={{ width: `${((currentFrameIndex + 1) / frames.length) * 100}%` }}
                        />
                        <div 
                          className="absolute h-4 w-4 bg-white rounded-full -top-1.5 shadow-xl opacity-0 group-hover/progress:opacity-100 transition-opacity"
                          style={{ left: `${((currentFrameIndex + 1) / frames.length) * 100}%`, transform: 'translateX(-50%)' }}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setIsPlaying(false);
                                setCurrentFrameIndex(prev => (prev > 0 ? prev - 1 : frames.length - 1));
                              }}
                              className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white/60 hover:text-white"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={togglePlayback}
                              className="h-12 w-12 rounded-2xl bg-white text-black hover:scale-105 active:scale-95 flex items-center justify-center transition-all shadow-xl shadow-white/10"
                            >
                              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 ml-1 fill-current" />}
                            </button>
                            <button 
                              onClick={() => {
                                setIsPlaying(false);
                                setCurrentFrameIndex(prev => (prev < frames.length - 1 ? prev + 1 : 0));
                              }}
                              className="h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white/60 hover:text-white"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                          
                          <div className="w-px h-6 bg-white/10 mx-2" />

                          <button 
                            onClick={() => setIsLooping(!isLooping)}
                            className={`h-10 px-3 rounded-xl flex items-center gap-2 transition-all ${isLooping ? 'bg-purple-500/20 text-purple-400' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                            title="Bucle (L)"
                          >
                            <Repeat className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Loop</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="flex flex-col items-end">
                            <span className="text-white font-mono text-sm tracking-tighter">
                              {String(currentFrameIndex + 1).padStart(3, '0')} <span className="text-white/30">/</span> {String(frames.length).padStart(3, '0')}
                            </span>
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Frames</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-white font-mono text-sm tracking-tighter">
                              {activeFps} <span className="text-white/30">fps</span>
                            </span>
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Velocidad</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-purple-500 blur-3xl opacity-20 animate-pulse" />
                      <Loader2 className="w-12 h-12 text-purple-400 animate-spin relative z-10" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-white/60 font-medium tracking-wide animate-pulse">
                        Renderizando secuencia cinematográfica...
                      </p>
                      <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full">
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Motor de Coherencia Activo</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline / Filmstrip */}
              <div className="w-full glass-panel rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                    <Film className="w-4 h-4" /> Línea de tiempo ({frames.length}/{activeTotalFrames})
                  </h3>
                  <div className="flex items-center gap-3">
                    {isGenerating && (
                      <>
                        <span className="text-xs font-medium text-purple-400 bg-purple-400/10 px-2 py-1 rounded-md animate-pulse">
                          Renderizando {progress}/{activeTotalFrames}
                        </span>
                        <button 
                          onClick={handleCancel}
                          className="text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
                        >
                          <XCircle className="w-3 h-3" /> Cancelar
                        </button>
                      </>
                    )}
                    {!isGenerating && frames.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setFrames([]);
                            setPrompt('');
                            setSelectedPresetId(null);
                            setError(null);
                          }}
                          className="text-xs font-medium text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Nueva Animación
                        </button>
                        <button 
                          onClick={handleDownloadAll}
                          disabled={isDownloading}
                          className="text-xs font-medium text-blue-400 bg-blue-400/10 hover:bg-blue-400/20 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {isDownloading ? 'Empaquetando...' : 'Descargar ZIP'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 overflow-x-auto pb-4 snap-x hide-scrollbar px-2">
                  {Array.from({ length: activeTotalFrames }).map((_, i) => (
                    <div 
                      key={i}
                      onClick={() => {
                        if (frames[i]) {
                          setIsPlaying(false);
                          setCurrentFrameIndex(i);
                        }
                      }}
                      className={`relative shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-xl overflow-hidden snap-center cursor-pointer transition-all duration-500 group/thumb ${
                        i === currentFrameIndex 
                          ? 'ring-2 ring-purple-500 scale-110 shadow-2xl shadow-purple-500/40 z-20' 
                          : 'opacity-40 hover:opacity-100 grayscale hover:grayscale-0'
                      } ${!frames[i] ? 'bg-white/5 border border-white/10' : 'bg-black'}`}
                    >
                      {frames[i] ? (
                        <>
                          <img 
                            src={frames[i]} 
                            alt={`Thumbnail ${i + 1}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          <span className="absolute bottom-1 right-1.5 text-[8px] font-mono font-bold text-white/80 bg-black/40 px-1 rounded backdrop-blur-sm">
                            {i + 1}
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {isGenerating && i === progress ? (
                            <div className="flex flex-col items-center gap-1">
                              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                              <span className="text-[8px] font-bold text-purple-400/60 animate-pulse">REC</span>
                            </div>
                          ) : (
                            <ImageIcon className="w-4 h-4 text-white/10" />
                          )}
                        </div>
                      )}
                      
                      {/* Active Indicator Line */}
                      {i === currentFrameIndex && (
                        <motion.div 
                          layoutId="active-thumb-indicator"
                          className="absolute bottom-0 inset-x-0 h-1 bg-purple-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          layout
          className="w-full max-w-2xl flex flex-col gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
        >
          {/* Presets Panel - Core Animation Types */}
          {!isGenerating && frames.length === 0 && (
            <div className="flex flex-col gap-6 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className={`glass-panel p-4 rounded-2xl flex items-center gap-4 transition-all group border text-left ${
                      selectedPresetId === preset.id 
                        ? 'bg-purple-500/20 border-purple-500/50 ring-1 ring-purple-500/30' 
                        : 'hover:bg-white/10 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                      selectedPresetId === preset.id 
                        ? 'bg-purple-500/20 text-purple-400' 
                        : 'bg-white/5 text-white/60 group-hover:text-purple-400 group-hover:bg-purple-400/10'
                    }`}>
                      {preset.icon}
                    </div>
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                          selectedPresetId === preset.id ? 'text-white' : 'text-white/40 group-hover:text-white/80'
                        }`}>
                          {preset.name}
                        </span>
                        <span className="text-[10px] font-mono text-white/20 group-hover:text-purple-400/60 transition-colors">
                          {preset.duration}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/30 group-hover:text-white/50 leading-tight mt-1">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, height: 0, filter: "blur(10px)" }}
                animate={{ opacity: 1, height: "auto", filter: "blur(0px)" }}
                exit={{ opacity: 0, height: 0, filter: "blur(10px)" }}
                className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row gap-6 overflow-hidden"
              >
                <div className="flex-1 space-y-3">
                  <div className="flex gap-2">
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 ${keysStatus.gemini ? 'text-green-400' : 'text-red-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${keysStatus.gemini ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Gemini Key</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 ${keysStatus.groq ? 'text-green-400' : 'text-red-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${keysStatus.groq ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Groq Key</span>
                    </div>
                  </div>
                  {(!keysStatus.gemini || !keysStatus.groq) && (
                    <p className="text-[10px] text-white/40 italic">
                      * Configura tus llaves en el panel de <b>Settings</b> de AI Studio para habilitar todos los motores.
                    </p>
                  )}
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-white/80">Motor de Renderizado</label>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${
                      engine === 'gemini' ? 'bg-purple-500/20 text-purple-400' : 
                      engine === 'gemini-image' ? 'bg-blue-500/20 text-blue-400' :
                      engine === 'mcp-free' ? 'bg-cyan-500/20 text-cyan-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>
                      {engine === 'gemini' ? 'Gemini (Pro)' : 
                       engine === 'gemini-image' ? 'Gemini Image (Native)' :
                       engine === 'mcp-free' ? `MCP Free (${mcpModel})` :
                       `Pollinations (${pollModel})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setEngine('gemini')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${engine === 'gemini' ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      Gemini
                    </button>
                    <button
                      onClick={() => setEngine('gemini-image')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${engine === 'gemini-image' ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      Gemini Image
                    </button>
                    <button
                      onClick={() => setEngine('mcp-free')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${engine === 'mcp-free' ? 'bg-cyan-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      MCP Free
                    </button>
                    <button
                      onClick={() => setEngine('pollinations')}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${engine === 'pollinations' ? 'bg-amber-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                    >
                      Pollinations
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${useGroqPlanning ? 'bg-green-400' : 'bg-white/20'}`} />
                      <label className="text-xs font-medium text-white/80">Planificación Groq (Coherencia)</label>
                    </div>
                    <button
                      onClick={() => setUseGroqPlanning(!useGroqPlanning)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${useGroqPlanning ? 'bg-green-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${useGroqPlanning ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  {engine === 'mcp-free' && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Modelo MCP</label>
                        <span className="text-[9px] text-cyan-400/60 font-mono uppercase">{mcpModel}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {[
                          'flux', 'flux-schnell', 'turbo', 'magic', 'wan', 
                          'flux-kontext', 'nanobanana', 'nanobanana-2', 'nanobanana-pro',
                          'seedream-5.0-lite', 'gpt-image-1-mini', 'gpt-image-1.5',
                          'z-image-turbo', 'qwen-image-plus', 'grok-imagine', 'grok-imagine-pro',
                          'flux-klein-4b', 'pruna-p-image', 'pruna-p-image-edit', 'nova-canvas'
                        ].map(m => (
                          <button
                            key={m}
                            onClick={() => setMcpModel(m)}
                            className={`py-1.5 rounded-md text-[9px] font-bold uppercase transition-all truncate px-1 ${mcpModel === m ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'}`}
                            title={m}
                          >
                            <span className="scale-[0.85] origin-center">{m.length > 8 ? m.substring(0, 7) + '..' : m}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {engine === 'pollinations' && (
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Modelo Pollinations</label>
                        <span className="text-[9px] text-amber-400/60 font-mono uppercase">{pollModel}</span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {['flux', 'flux-schnell', 'flux-realism', 'flux-coke', 'flux-anime', 'flux-3d', 'flux-pro', 'any-dark', 'turbo'].map(m => (
                          <button
                            key={m}
                            onClick={() => setPollModel(m)}
                            className={`py-1.5 rounded-md text-[9px] font-bold uppercase transition-all truncate px-1 ${pollModel === m ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10'}`}
                            title={m}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-white/30 leading-tight">
                    {engine === 'gemini' 
                      ? 'Máxima coherencia temporal (Imagen-a-Imagen). Sujeto a cuotas.' 
                      : engine === 'gemini-image'
                      ? 'Generación nativa de alta calidad. Muy fiable.'
                      : engine === 'groq-pollinations'
                      ? 'Groq planifica el movimiento y Pollinations lo dibuja. Ilimitado y rápido.'
                      : 'Generación ilimitada y gratuita. Menos coherencia entre frames.'}
                  </p>
                </div>

                <div className="w-px bg-white/10 hidden md:block" />

                <div className="flex-1 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-white/80">Velocidad (FPS)</label>
                    <span className="text-xs font-mono text-pink-400 bg-pink-400/10 px-2 py-1 rounded">{targetFps} fps</span>
                  </div>
                  <input 
                    type="range" 
                    min="12" 
                    max="60" 
                    step="6"
                    value={targetFps} 
                    onChange={(e) => setTargetFps(parseInt(e.target.value))}
                    className="w-full accent-pink-500"
                    disabled={isGenerating}
                  />
                  <div className="flex justify-between text-[10px] text-white/40 font-mono">
                    <span>12</span>
                    <span>24</span>
                    <span>30</span>
                    <span>60</span>
                  </div>
                </div>

                <div className="w-full md:w-auto flex flex-col justify-center gap-2 pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-white/10 md:pl-6">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Estado de APIs</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                      <div className={`w-1.5 h-1.5 rounded-full ${process.env.GEMINI_API_KEY ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
                      <span className="text-[10px] font-mono text-white/60">GEMINI: {process.env.GEMINI_API_KEY ? 'CONECTADO' : 'SIN LLAVE'}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                      <div className={`w-1.5 h-1.5 rounded-full ${(import.meta.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || (window as any).GROQ_API_KEY) ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]'}`}></div>
                      <span className="text-[10px] font-mono text-white/60">GROQ: {(import.meta.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || (window as any).GROQ_API_KEY) ? 'CONECTADO' : 'APAGADO'}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
                        const groqKey = 
                          import.meta.env.VITE_GROQ_API_KEY || 
                          process.env.VITE_GROQ_API_KEY || 
                          process.env.GROQ_API_KEY || 
                          (window as any).GROQ_API_KEY;
                        
                        let status = "Resultados del Test:\n";
                        
                        if (geminiKey) {
                          try {
                            const ai = new GoogleGenAI({ apiKey: geminiKey });
                            await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'ping' });
                            status += "✅ Gemini: OK\n";
                          } catch (e: any) {
                            status += `❌ Gemini: ${e.message?.includes('401') ? '401 (Llave inválida)' : 'Error'}\n`;
                          }
                        } else {
                          status += "❌ Gemini: Sin llave\n";
                        }
                        
                        if (groqKey) {
                          try {
                            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: "ping" }], max_tokens: 1 })
                            });
                            status += res.ok ? "✅ Groq: OK\n" : `❌ Groq: ${res.status}\n`;
                          } catch (e) {
                            status += "❌ Groq: Error de red\n";
                          }
                        } else {
                          status += "ℹ️ Groq: No configurado\n";
                        }
                        
                        setTestStatus(status);
                        setTimeout(() => setTestStatus(null), 5000);
                      }}
                      className="text-[9px] font-bold uppercase tracking-tighter text-white/40 hover:text-white transition-colors mt-1"
                    >
                      [ Test APIs ]
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {testStatus && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-xl mb-4 text-[10px] font-mono whitespace-pre-line text-white/80"
            >
              {testStatus}
            </motion.div>
          )}

          <form onSubmit={handleGenerate} className="relative group w-full">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
            <div className="relative flex items-center bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-xl transition-colors ml-2 ${showSettings ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                title="Ajustes"
              >
                <Settings2 className="w-6 h-6" />
              </button>
              <div className="w-px h-8 bg-white/10 mx-2" />
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={selectedPresetId ? "Escribe el objeto (ej. 'un motor', 'un zapato')..." : "Describe el objeto o escena..."}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/30 text-base md:text-lg py-3 px-2 w-full"
                disabled={isGenerating}
              />
              <button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="bg-white text-black px-4 md:px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span className="hidden md:inline">Renderizar</span>
                  </>
                )}
              </button>
            </div>
            {error && (
              <div className="absolute -bottom-16 left-0 flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <p className="text-red-400 text-sm font-medium">
                    {error}
                  </p>
                  <button 
                    onClick={() => {
                      setError(null);
                      handleGenerate();
                    }}
                    className="text-[10px] uppercase tracking-widest font-bold text-white/40 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded border border-white/10"
                  >
                    Reintentar
                  </button>
                </div>
                <p className="text-[10px] text-white/20 italic">
                  Nota: Los errores de "WebSocket" en la consola son normales y no afectan la generación.
                </p>
              </div>
            )}
          </form>

          {/* Quick Examples */}
          {!isGenerating && frames.length === 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <span className="text-[10px] text-white/20 uppercase tracking-widest w-full text-center mb-1">Ejemplos Rápidos</span>
              {[
                { label: 'Motor de Jet', obj: 'un motor de turbina de jet', preset: 'exploded' },
                { label: 'Reloj Suizo', obj: 'un reloj mecánico de lujo', preset: 'exploded' },
                { label: 'Salmones', obj: 'salmones nadando en contracorriente en un río cristalino', preset: 'action' },
                { label: 'Dron Pro', obj: 'un dron de carreras futurista', preset: 'orbit' },
                { label: 'Robot Sci-Fi', obj: 'un brazo robótico industrial', preset: 'blueprint' },
                { label: 'Zapato Tech', obj: 'un zapato deportivo de alta tecnología', preset: 'cascade' },
              ].map((ex, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(ex.obj, ex.preset)}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-white/40 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
