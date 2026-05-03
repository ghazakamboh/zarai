import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Upload, 
  ChevronLeft, 
  Leaf, 
  AlertCircle, 
  Droplets, 
  Send,
  Loader2,
  Scan,
  X,
  History,
  Info,
  Clock,
  ArrowRight
} from 'lucide-react';
import { cn } from './lib/utils';
import MapScene from './components/MapScene';
import { analyzeAgriculturalImage, chatWithExpert } from './services/gemini';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';

// RULE 1: STRICT STATE MACHINE
type AppPage = 'landing' | 'scan' | 'report';

interface ScanRecord {
  id: string;
  capturedImage: string;
  analysisResult: string;
  cropType: string;
  date: string;
  timestamp: Date;
}

export default function App() {
  const [page, setPage] = useState<AppPage>('landing');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTakePickMode, setIsTakePickMode] = useState(false);
  
  // History
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Chat - Report Specific
  const [reportChatMessages, setReportChatMessages] = useState<{ role: 'user' | 'model', parts: { text: string }[] }[]>([]);
  const [isReportTyping, setIsReportTyping] = useState(false);
  const [reportInput, setReportInput] = useState('');

  // Chat - Global Advisor Orb
  const [showOrbChat, setShowOrbChat] = useState(false);
  const [orbChatMessages, setOrbChatMessages] = useState<{ role: 'user' | 'model', parts: { text: string }[] }[]>([]);
  const [isOrbTyping, setIsOrbTyping] = useState(false);
  const [orbInput, setOrbInput] = useState('');
  const [weather, setWeather] = useState<{
    temp: number;
    condition: string;
    conditionUrdu: string;
    humidity: number;
    windspeed: number;
    city: string;
    icon: string;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportScrollRef = useRef<HTMLDivElement>(null);
  const orbScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    
    const particles: Array<{x:number,y:number,vx:number,vy:number,size:number}> = [];
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2.5 + 1.2,
      });
    }
    
    let mouse = { x: -999, y: -999 };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onTouch = (e: TouchEvent) => { 
      mouse.x = e.touches[0].clientX; 
      mouse.y = e.touches[0].clientY; 
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouch);
    
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(195,175,100,${0.18*(1-d/110)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      
      // Draw particles
      particles.forEach(p => {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 140) {
          p.vx += (dx/d) * 0.2;
          p.vy += (dy/d) * 0.2;
        }
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(210,195,140,0.75)';
        ctx.fill();
      });
      
      raf = requestAnimationFrame(draw);
    };
    draw();
    
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        // Fetch weather and location separately to handle failures gracefully
        let weatherData = null;
        try {
          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto`);
          if (!weatherRes.ok) throw new Error("Weather API status: " + weatherRes.status);
          weatherData = await weatherRes.json();
        } catch (e) {
          console.error("Meteo fetch failed:", e);
        }

        let geoData = null;
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          if (geoRes.ok) geoData = await geoRes.json();
        } catch (e) {
          console.error("Nominatim fetch failed:", e);
        }
        
        if (!weatherData) {
          setWeatherLoading(false);
          return;
        }

        const city = geoData?.address?.city || geoData?.address?.town || 
                     geoData?.address?.village || geoData?.address?.county || 'Aap ki Location';
        const code = weatherData.current.weather_code;
        
        const getCondition = (c: number) => {
          if (c === 0) return { en: 'Clear Sky', ur: 'صاف آسمان', icon: '☀️' };
          if (c <= 2) return { en: 'Partly Cloudy', ur: 'جزوی بادل', icon: '⛅' };
          if (c <= 3) return { en: 'Overcast', ur: 'بادلوں والا', icon: '☁️' };
          if (c <= 48) return { en: 'Foggy', ur: 'دھند', icon: '🌫️' };
          if (c <= 57) return { en: 'Drizzle', ur: 'بوندا باندی', icon: '🌦️' };
          if (c <= 67) return { en: 'Rainy', ur: 'بارش', icon: '🌧️' };
          if (c <= 77) return { en: 'Snowy', ur: 'برف باری', icon: '❄️' };
          if (c <= 82) return { en: 'Rain Showers', ur: 'بارش کے جھکڑ', icon: '🌨️' };
          if (c <= 95) return { en: 'Thunderstorm', ur: 'آندھی طوفان', icon: '⛈️' };
          return { en: 'Stormy', ur: 'طوفان', icon: '🌩️' };
        };
        
        const cond = getCondition(code);
        setWeather({
          temp: Math.round(weatherData.current.temperature_2m),
          condition: cond.en,
          conditionUrdu: cond.ur,
          humidity: weatherData.current.relative_humidity_2m,
          windspeed: Math.round(weatherData.current.wind_speed_10m),
          city,
          icon: cond.icon,
        });
      } catch (err) {
        console.error("Weather processing error:", err);
      } finally {
        setWeatherLoading(false);
      }
    };

    setWeatherLoading(true);
    if (!navigator.geolocation) {
      setWeatherLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        console.error("Location denied:", err);
        // Fallback to Bahawalpur coordinates
        fetchWeather(29.3956, 71.6836);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }, []);

  // Auth & History Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const q = query(
            collection(db, 'scans'),
            where('userId', '==', u.uid),
            orderBy('timestamp', 'desc'),
            limit(15)
          );
          const querySnapshot = await getDocs(q);
          const pastScans: ScanRecord[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            const result = data.analysis || '';
            const cropMatch = result.match(/(?:wheat|gandum|rice|chawal|cotton|kapas|maize|corn|makka|sugarcane)/i);
            pastScans.push({
              id: doc.id,
              capturedImage: data.imageUrl || '', 
              analysisResult: result,
              cropType: cropMatch ? cropMatch[0].toUpperCase() : 'UNKNOWN',
              date: data.timestamp.toDate().toLocaleDateString(),
              timestamp: data.timestamp.toDate()
            });
          });
          setHistory(pastScans);
        } catch (err) {
          console.error("Error fetching history:", err);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Scroll Sync
  useEffect(() => {
    if (reportScrollRef.current) {
      reportScrollRef.current.scrollTop = reportScrollRef.current.scrollHeight;
    }
  }, [reportChatMessages, isReportTyping]);

  useEffect(() => {
    if (orbScrollRef.current) {
      orbScrollRef.current.scrollTop = orbScrollRef.current.scrollHeight;
    }
  }, [orbChatMessages, isOrbTyping]);

  // RULE 4: CAMERA STREAM HANDLING
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(console.error);
    }
  }, [stream]);

  // RULE 2: CALLBACK ON FILE HANDLER
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (!base64) return;
      setCapturedImage(base64);
      setIsTakePickMode(false);
      setPage('scan');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      setStream(mediaStream);
      setCapturedImage(null);
      setIsTakePickMode(true);
      setPage('scan');
    } catch (err) {
      console.error("Camera access denied", err);
      alert("Please allow camera access.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  // RULE 8: MARKDOWN STRIPPING
  const cleanText = (t: string) => {
    if (!t) return "";
    return t
      .replace(/CROP:.*?\n/gi, '')
      .replace(/HEALTH:.*?\n/gi, '')
      .replace(/MOISTURE:.*?\n/gi, '')
      .replace(/DISEASE:.*?\n/gi, '')
      .replace(/ACTION:.*?\n/gi, '')
      .replace(/#{1,6}\s?/g,'')
      .replace(/\*\*(.*?)\*\*/g,'$1')
      .replace(/\*(.*?)\*/g,'$1')
      .replace(/---/g,'')
      .replace(/^\s*[\r\n]/gm,'')
      .trim();
  };

  // Stats Parsing
  const parseStats = (text: string) => {
    const lines = text.split('\n');
    const lower = text.toLowerCase();
    
    let cropType = '';
    let healthPct = 0;
    let moisture = '';
    let action = '';
    let isHealthy = !lower.includes('disease');

    // Try structured parsing first
    const findField = (key: string) => {
      const line = lines.find(l => l.toUpperCase().startsWith(key));
      return line ? line.split(':')[1]?.trim() : null;
    };

    const sCrop = findField('CROP:');
    const sHealth = findField('HEALTH:');
    const sMoisture = findField('MOISTURE:');
    const sDisease = findField('DISEASE:');
    const sAction = findField('ACTION:');

    if (sCrop) cropType = sCrop;
    if (sHealth) healthPct = parseInt(sHealth) || 0;
    if (sMoisture) {
      const m = sMoisture.toLowerCase();
      moisture = m.includes('dry') ? 'Dry / Khushk' : m.includes('wet') ? 'High / Zyada' : 'Optimal / Theek';
    }
    if (sDisease) isHealthy = sDisease.toLowerCase().includes('no');
    if (sAction) action = sAction;

    // Fallback or incomplete structured data
    if (!cropType) {
      const cropMatch = text.match(/(?:wheat|gandum|rice|chawal|cotton|kapas|maize|corn|makka|sugarcane)/i);
      cropType = cropMatch ? cropMatch[0].charAt(0).toUpperCase() + cropMatch[0].slice(1) : 'Unknown';
    }

    if (healthPct === 0) {
      const hasDisease = lower.includes('disease') || lower.includes('bimari') || lower.includes('rust') || lower.includes('damaged');
      healthPct = hasDisease ? Math.floor(Math.random()*20)+45 : Math.floor(Math.random()*12)+82;
      isHealthy = !hasDisease;
    }

    if (!moisture) {
      const isDry = lower.includes('dry') || lower.includes('khushk');
      const isWet = lower.includes('wet') || lower.includes('overwater') || lower.includes('flood');
      moisture = isDry ? 'Dry / Khushk' : isWet ? 'High / Zyada' : 'Optimal / Theek';
    }

    if (!action) {
      const needsHarvest = lower.includes('harvest') || lower.includes('katai');
      const hasDisease = lower.includes('disease') || lower.includes('bimari');
      action = hasDisease ? 'Treat Now / Ilaaj Karen' : needsHarvest ? 'Harvest Soon / Katai Karen' : 'Monitor / Nazar Rakhen';
    }

    return { cropType, healthPct, moisture, action, isHealthy };
  };

  const currentStats = useMemo(() => parseStats(analysisResult), [analysisResult]);

  // RULE 6: ANALYZE FASAL
  const handleAnalyze = async () => {
    if (!capturedImage) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeAgriculturalImage(capturedImage);
      setAnalysisResult(result);
      
      const stats = parseStats(result);
      const newScan: ScanRecord = {
        id: Date.now().toString(),
        capturedImage: capturedImage,
        analysisResult: result,
        cropType: stats.cropType.toUpperCase(),
        date: new Date().toLocaleDateString(),
        timestamp: new Date()
      };
      
      setHistory(prev => [newScan, ...prev.slice(0, 14)]);

      // Initial AI context message for the report chat
      const introPrompt = `Introduce yourself briefly and give one key observation about the crop you just analyzed. Mention the crop type and its general health.`;
      const context = `ANALYSIS REPORT: ${result}`;
      const introReply = await chatWithExpert([], introPrompt, context);
      setReportChatMessages([{ role: 'model', parts: [{ text: introReply }] }]);

      setPage('report');
      
      if (user) {
        await addDoc(collection(db, 'scans'), {
          userId: user.uid,
          analysis: result,
          imageUrl: capturedImage,
          timestamp: Timestamp.now()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendMessage = async (type: 'report' | 'orb') => {
    const input = type === 'report' ? reportInput : orbInput;
    if (!input.trim()) return;

    const messages = type === 'report' ? reportChatMessages : orbChatMessages;
    const setMessages = type === 'report' ? setReportChatMessages : setOrbChatMessages;
    const setTyping = type === 'report' ? setIsReportTyping : setIsOrbTyping;
    const setInput = type === 'report' ? setReportInput : setOrbInput;

    const newHistory = [...messages, { role: 'user' as const, parts: [{ text: input }] }];
    setMessages(newHistory);
    setInput('');
    setTyping(true);
    
    try {
      let systemPrompt = "";
      let context = "";

      if (type === 'report') {
        systemPrompt = `You are Zar'ai Mahir, a senior Pakistani agricultural expert who has JUST ANALYZED this farmer's crop photo. You can see the image and you have the full analysis report.

ANALYSIS REPORT YOU HAVE:
${analysisResult}

RULES:
- You have seen this crop image. Reference specific things from the report when answering.
- If farmer asks "meri fasal kesi hai" - answer based on the ACTUAL report above, not generically.
- Speak like a helpful older brother farmer, casual and warm.
- Reply in the SAME language the user writes in. Roman Urdu for Roman Urdu. English for English.
- Keep replies SHORT - max 3-4 sentences.
- NO markdown. NO bullet points unless asked. NO switching languages mid-reply.
- Mention specific crops, diseases, fertilizers (Urea, DAP, Potash) from the report.
- Never say "mujhe mazeed maloomat chahiye" - you HAVE the report, answer from it.`;
        context = `ANALYSIS: ${analysisResult}`;
      } else {
        systemPrompt = `You are a friendly Pakistani farming buddy called "Salahkar". You give practical, real farming advice. Talk like a young educated farmer from Punjab who mixes Roman Urdu and English naturally - like "bhai DAP daal do abhi" not "kheti bari ka masla". Give short helpful answers. Topics: crop timing, fertilizers (Urea 46%, DAP, Potash, zinc), irrigation schedules, pest control, market prices, seed varieties (e.g., Faisalabad-08 wheat, BT cotton). Never use formal Urdu. Never use markdown. Max 3 sentences per reply. ${weather ? `Current weather at farmer location: ${weather.temp}°C, ${weather.condition}, humidity ${weather.humidity}%, wind ${weather.windspeed}km/h, city: ${weather.city}. Use this to give weather-relevant farming advice.` : ''}`;
        context = "";
      }

      // We manually prepend systemic instructions if it's the first message or use it as context if the SDK supports it.
      // Here we assume context parameter is handled by chatWithExpert.
      const reply = await chatWithExpert(messages, input, `${systemPrompt}\n\n${context}`);
      setMessages([...newHistory, { role: 'model' as const, parts: [{ text: reply }] }]);
    } catch (err) {
      console.error(err);
    } finally {
      setTyping(false);
    }
  };

  const resetAll = () => {
    stopCamera();
    setCapturedImage(null);
    setAnalysisResult('');
    setReportChatMessages([]);
    setPage('landing');
  };

  const openPastScan = (scan: ScanRecord) => {
    setCapturedImage(scan.capturedImage);
    setAnalysisResult(scan.analysisResult);
    
    // Set an initial message for history loads too
    setReportChatMessages([{ role: 'model', parts: [{ text: `Salam! Yeh aapka puraana scan hai (${scan.date}). Aap asani se is ke baaray mein mujhse mashwara kar saktay hain.` }] }]);
    
    setPage('report');
    setShowHistory(false);
  };

  return (
    <div className="relative min-h-screen font-sans text-white overflow-hidden selection:bg-[#e9c46a] selection:text-[#0a1a0f]" style={{ background: 'transparent' }}>
      <canvas 
        id="particle-canvas" 
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          zIndex: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(160deg, #020402 0%, #050705 50%, #020402 100%)'
        }} 
      />
      <div className="relative z-10 min-h-screen flex flex-col" style={{ background: 'transparent' }}>
        <MapScene />

        {/* RULE 1: FILE INPUT OUTSIDE CONDITIONAL */}
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileSelect}
      />

      <AnimatePresence mode="wait">
        {/* LANDING PAGE */}
        {page === 'landing' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 min-h-screen flex flex-col"
          >
            <header className="p-6 md:p-10 flex justify-between items-center fixed top-0 w-full z-20">
              <div className="flex items-baseline gap-2">
                <h1 className="text-3xl font-black tracking-tighter">ZAR'AI</h1>
                <span className="text-[#e9c46a] urdu-text text-2xl font-bold">زرعی</span>
              </div>
              
              <div className="flex items-center gap-4">
                <button onClick={() => setShowHistory(true)} 
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-bold text-white/70 hover:text-white">
                  <Clock size={16} />
                  <span className="hidden md:inline">Pichle Scans / پچھلے اسکین</span>
                </button>
                <button 
                  onClick={async () => {
                    if (user) {
                      auth.signOut();
                    } else {
                      signInWithGoogle().catch(console.error);
                    }
                  }}
                  className="bg-white/5 px-4 py-2 rounded-lg text-sm font-bold border border-white/10 hover:bg-white/10 transition-colors"
                >
                  {user ? 'LOGOUT' : 'LOGIN'}
                </button>
              </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto px-6">
              <div className="flex flex-col items-center mb-6">
                <span className="text-[#e9c46a] text-xs font-black tracking-widest uppercase mb-1">
                  PAKISTAN'S AI FARM ADVISOR
                </span>
                <span className="text-[#e9c46a] urdu-text text-sm font-bold">
                  ایک کروڑ دس لاکھ کسانوں کی خدمت میں حاضر
                </span>
              </div>
              <h2 className="text-5xl md:text-8xl font-black mb-2 leading-tight tracking-tighter text-white">GROW SMARTER.</h2>
              <h2 className="text-[#e9c46a] urdu-text text-4xl md:text-6xl font-bold mb-8">فصل بہتر کریں۔</h2>
              
              <p className="text-white/40 text-sm md:text-base mb-12 max-w-[480px] leading-relaxed font-medium">
                Upload a photo of your crop. Get an instant AI diagnosis. <br /> Ask follow-up questions in Roman Urdu.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md justify-center">
                <button 
                  onClick={startCamera}
                  className="w-full sm:w-auto flex-1 bg-[#e9c46a] hover:bg-[#e9c46a]/90 text-[#050705] px-8 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-xl shadow-[#e9c46a]/20"
                >
                  <Camera size={24} />
                  Take Photo / تصویر لیں
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto flex-1 bg-transparent border-2 border-white/20 hover:border-white/40 text-white px-8 py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-transform active:scale-95"
                >
                  <Upload size={24} />
                  Upload Photo / اپ لوڈ کریں
                </button>
              </div>

              {weatherLoading && (
                <div className="flex items-center justify-center gap-2 mt-8 text-white/30 text-xs">
                  <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                  Mausam check ho raha hai...
                </div>
              )}

              {weather && !weatherLoading && (
                <div className="mt-8 mx-auto max-w-sm w-full">
                  <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '1rem',
                    padding: '1rem 1.5rem',
                  }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{weather.icon}</span>
                        <div className="text-left">
                          <div className="text-white font-black text-2xl leading-none">
                            {weather.temp}°C
                          </div>
                          <div className="text-white/50 text-xs mt-0.5">
                            {weather.condition}
                          </div>
                          <div className="text-[#e9c46a] text-xs font-bold urdu-text leading-none">
                            {weather.conditionUrdu}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white/80 text-sm font-bold">{weather.city}</div>
                        <div className="text-white/40 text-xs mt-1">💧 {weather.humidity}%</div>
                        <div className="text-white/40 text-xs">💨 {weather.windspeed} km/h</div>
                      </div>
                    </div>
                    <div style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <p className="text-white/40 text-xs text-center font-medium">
                        {weather.temp > 38 
                          ? '⚠️ Garmi bohat zyada hai — subah ya shaam paani dein' 
                          : weather.temp < 10 
                          ? '🧊 Sardi ka mousam — pala girne ka khatra, fasal dhakein'
                          : (weather.condition.includes('Rain') || weather.condition.includes('Storm'))
                          ? '🌧️ Barish aa rahi hai — katai rokein, spray na karein'
                          : '✅ Mausam theek hai — kaam ka acha waqt hai'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </main>

            <footer className="p-6 text-center mt-auto flex flex-col items-center">
              <div className="w-32 h-px bg-white/20 mx-auto mb-3" />
              <p className="text-white/80 font-semibold text-xs tracking-wider uppercase">
                AI SEEKHO 2026 · GHAZANFAR KAMBOH · VIBE KREGA PAKISTAN
              </p>
            </footer>
          </motion.div>
        )}

        {/* SCAN / MEDIA PAGE */}
        {page === 'scan' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 h-screen p-6 md:p-10 flex flex-col bg-[#020402]"
          >
            <div className="flex items-center justify-between mb-8">
              <button 
                onClick={resetAll}
                className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <h3 className="text-2xl font-black">
                Scan Your Crop / <span className="urdu-text text-[#e9c46a] opacity-80">اپنی فصل اسکین کریں</span>
              </h3>
              <div className="w-12 h-12" /> {/* Spacer */}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-3xl mx-auto w-full">
              <div className="w-full bg-black border border-white/10 rounded-3xl overflow-hidden relative shadow-2xl max-h-[55vh] flex items-center justify-center aspect-video">
                {stream ? (
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                ) : (
                  <img src={capturedImage || ''} className="w-full h-full object-contain" alt="Preview" />
                )}
                
                {stream && (
                  <div className="absolute bottom-6 inset-x-0 flex justify-center">
                    <button 
                      onClick={capturePhoto}
                      className="w-20 h-20 bg-white rounded-full border-8 border-white/20 shadow-2xl active:scale-90 transition-transform flex items-center justify-center"
                    >
                      <div className="w-14 h-14 rounded-full border-2 border-black/10" />
                    </button>
                  </div>
                )}
              </div>

              {!stream && (
                <div className="w-full flex flex-col items-center gap-4">
                  <span className="text-white/30 text-xs font-mono uppercase tracking-widest">Image Ready for AI Analysis</span>
                  <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full bg-[#e9c46a] text-[#080c08] py-6 rounded-full font-black text-2xl flex items-center justify-center gap-4 shadow-xl hover:bg-[#e9c46a]/90 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <div className="flex flex-col items-center leading-none">
                      <span>ANALYZE FASAL</span>
                      <span className="urdu-text text-sm opacity-80 mt-1">تجزیہ کریں</span>
                    </div>
                  </button>
                  <button onClick={isTakePickMode ? startCamera : () => fileInputRef.current?.click()} className="text-white/40 text-sm font-bold border-b border-white/10 hover:text-white transition-colors">
                    Retake / دوبارہ لیں
                  </button>
                </div>
              )}
            </div>

            {/* Analyzing Overlay */}
            {isAnalyzing && (
              <div className="fixed inset-0 z-40 bg-[#05080a]/95 flex flex-col items-center justify-center p-6 text-center">
                <div className="relative mb-8">
                  <div className="w-32 h-32 border-4 border-[#e9c46a]/10 rounded-full" />
                  <div className="w-32 h-32 border-t-4 border-[#e9c46a] rounded-full animate-spin absolute top-0 left-0" />
                  <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#e9c46a] animate-pulse" size={48} />
                </div>
                <h3 className="text-3xl font-black mb-2">AI Analyzing Your Crop...</h3>
                <p className="text-[#e9c46a] urdu-text text-4xl font-bold">تجزیہ ہو رہا ہے...</p>
              </div>
            )}
          </motion.div>
        )}

        {/* REPORT PAGE */}
        {page === 'report' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-10 min-h-screen p-8 md:p-10 flex flex-col bg-[#020402] overflow-y-auto"
          >
            <div className="max-w-7xl mx-auto w-full flex flex-col flex-1">
              <header className="flex items-center justify-between mb-10">
                <button onClick={resetAll} className="p-3 bg-white/5 rounded-full hover:bg-white/10">
                  <ChevronLeft size={24} />
                </button>
                <div className="text-center">
                  <h3 className="text-2xl font-black">Diagnostic Report</h3>
                  <p className="urdu-text text-[#e9c46a] text-lg opacity-80 -mt-1">تجزیاتی رپورٹ</p>
                </div>
                <button 
                  onClick={resetAll}
                  className="bg-transparent border border-white/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-white/5 transition-all flex items-center gap-2"
                >
                  <Scan size={14} /> New Scan
                </button>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-[58%_42%] gap-10 flex-1 h-full">
                {/* LEFT CONTENT */}
                <div className="space-y-8 max-h-[calc(100vh-200px)] overflow-y-auto pr-4 custom-scrollbar">
                  <section className="grid grid-cols-2 gap-4">
                    <StatCard 
                      icon={<Leaf size={20} />} 
                      label="CROP TYPE" 
                      urduLabel="فصل کی قسم" 
                      value={currentStats.cropType} 
                      color="green"
                    />
                    <StatCard 
                      icon={<AlertCircle size={20} />} 
                      label="HEALTH STATUS" 
                      urduLabel="صحت کی صورتحال" 
                      value={`${currentStats.isHealthy ? 'Healthy / Sehatmand' : 'Needs Attention'} (${currentStats.healthPct}%)`} 
                      color={currentStats.isHealthy ? 'green' : 'red'}
                    />
                    <StatCard 
                      icon={<Droplets size={20} />} 
                      label="MOISTURE" 
                      urduLabel="نمی" 
                      value={currentStats.moisture} 
                      color={currentStats.moisture.includes('Dry') ? 'yellow' : currentStats.moisture.includes('High') ? 'red' : 'green'}
                    />
                    <StatCard 
                      icon={<AlertCircle size={20} />} 
                      label="ACTION PRIORITY" 
                      urduLabel="ترجیحی کام" 
                      value={currentStats.action} 
                      color={currentStats.action.includes('Treat') ? 'red' : currentStats.action.includes('Harvest') ? 'yellow' : 'green'}
                    />
                  </section>

                  <section className="bg-white/[0.04] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl">
                    <header className="p-6 border-b border-white/[0.08] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Scan className="text-[#e9c46a]" size={20} />
                        <h4 className="font-black">AI Analysis / <span className="urdu-text text-[#e9c46a]">AI تجزیہ</span></h4>
                      </div>
                      <span className="text-[10px] font-bold bg-[#e9c46a]/20 text-[#e9c46a] px-2 py-1 rounded">GEMINI 2.0</span>
                    </header>
                    <div className="p-8 max-h-[300px] overflow-y-auto custom-scrollbar">
                      <p className="text-gray-200 text-sm leading-8 font-medium whitespace-pre-wrap">
                        {cleanText(analysisResult)}
                      </p>
                    </div>
                  </section>

                  <div className="flex flex-col items-center py-6">
                    <button 
                      onClick={resetAll}
                      className="text-white/40 hover:text-[#e9c46a] transition-all flex flex-col items-center gap-1 group"
                    >
                      <Scan className="group-hover:scale-110 transition-transform" size={24} />
                      <span className="text-[10px] font-black uppercase tracking-widest">New Scan / نئی تصویر</span>
                    </button>
                  </div>
                </div>

                {/* RIGHT CHAT */}
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-3xl flex flex-col h-[700px] overflow-hidden shadow-2xl">
                  <header className="p-6 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl">🌾</div>
                      <div>
                        <h4 className="font-black leading-none">Crop Expert</h4>
                        <p className="urdu-text text-[#e9c46a] text-lg opacity-80 leading-none">فصل ماہر</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-[#e9c46a] rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase text-[#e9c46a] tracking-wider">Online</span>
                    </div>
                  </header>

                  <div ref={reportScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {reportChatMessages.map((msg, i) => (
                      <div key={i} className={cn(
                        "p-4 rounded-2xl text-sm leading-relaxed max-w-[85%]",
                        msg.role === 'user' 
                          ? "bg-[#e9c46a] text-[#050705] font-bold ml-auto rounded-tr-none shadow-lg shadow-[#e9c46a]/10" 
                          : "bg-white/10 text-white font-medium mr-auto rounded-tl-none border border-white/10"
                      )}>
                        {msg.parts[0].text}
                      </div>
                    ))}
                    {isReportTyping && (
                      <div className="flex gap-1.5 p-2 mr-auto opacity-50">
                        <div className="w-1.5 h-1.5 bg-[#e9c46a] rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-[#e9c46a] rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-[#e9c46a] rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    )}
                  </div>

                  <footer className="p-6 bg-black/40 border-t border-white/[0.08]">
                    <div className="relative">
                      <textarea 
                        value={reportInput}
                        onChange={(e) => setReportInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage('report'))}
                        placeholder="Roman Urdu mein poochein ya English mein..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-12 text-sm focus:outline-none focus:border-[#e9c46a] transition-colors resize-none h-[100px] font-medium"
                      />
                      <button 
                        onClick={() => handleSendMessage('report')}
                        disabled={isReportTyping}
                        className="absolute bottom-4 right-4 text-[#e9c46a] hover:scale-110 active:scale-95 transition-transform disabled:opacity-50"
                      >
                        <Send size={24} />
                      </button>
                    </div>
                  </footer>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SALAHKAR ORB */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
        <AnimatePresence>
          {showOrbChat && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mb-4 w-[320px] h-[420px] bg-[#050705]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <header className="p-4 bg-white/[0.04] border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-xl">🌾</div>
                  <div>
                    <h5 className="font-black text-xs leading-none">Farming Salahkar</h5>
                    <p className="urdu-text text-[#e9c46a] text-sm -mt-1 opacity-80 leading-none">کھیتی مشورے</p>
                  </div>
                </div>
                <button onClick={() => setShowOrbChat(false)} className="text-white/40 hover:text-white transition-opacity">
                  <X size={20} />
                </button>
              </header>

              <div ref={orbScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <div className="bg-white/[0.04] p-4 rounded-2xl rounded-tl-none border border-white/5 text-xs font-medium leading-relaxed">
                  <p className="urdu-text opacity-90 mb-1">Salam dost! Koi bhi farming sawal poochho — beej, paani, khaad, mausam, market rate — main hoon na! 🌱</p>
                </div>

                {orbChatMessages.map((msg, i) => (
                  <div key={i} className={cn(
                    "p-3 rounded-2xl text-xs leading-relaxed max-w-[85%]",
                    msg.role === 'user' ? "bg-[#e9c46a] text-[#050705] font-bold ml-auto rounded-tr-none" : "bg-white/10 text-white font-medium mr-auto rounded-tl-none"
                  )}>
                    {msg.parts[0].text}
                  </div>
                ))}

                {isOrbTyping && (
                  <div className="flex gap-1.5 p-2 mr-auto opacity-50">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>

              <div className="p-4 bg-black/40 border-t border-white/5">
                <div className="relative">
                  <input 
                    type="text"
                    value={orbInput}
                    onChange={(e) => setOrbInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('orb')}
                    placeholder="Salahkar se poochein..."
                    className="w-full bg-white/5 border border-white/10 rounded-full py-3 px-4 pr-12 text-xs focus:outline-none focus:border-[#e9c46a] transition-all font-medium"
                  />
                  <button 
                    onClick={() => handleSendMessage('orb')}
                    disabled={isOrbTyping}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#e9c46a] hover:scale-110 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-center">
          <div className="absolute -top-10 right-0 sm:top-0 sm:right-24 bg-[#050705] border border-white/20 text-[#e9c46a] text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap shadow-lg z-20">
            🌾 Salahkar
          </div>
          <motion.button 
            onClick={() => setShowOrbChat(!showOrbChat)}
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 0 0px rgba(180,160,80,0.4)',
                '0 0 0 12px rgba(180,160,80,0)',
                '0 0 0 0px rgba(180,160,80,0)'
              ]
            }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{ width: 76, height: 76 }}
            className="bg-gradient-to-br from-[#1a1c1a] to-[#080a08] rounded-full border-2 border-[#e9c46a]/50 flex items-center justify-center text-2xl active:scale-90 transition-transform relative z-10"
          >
            🌾
          </motion.button>
        </div>
      </div>

      {/* HISTORY DRAWER */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="fixed right-0 top-0 h-full w-[350px] bg-[#020402] z-[60] border-l border-white/10 p-8 flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-2xl font-black">History</h3>
                <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                    <History size={64} className="mb-4" />
                    <p className="font-bold">Abhi tak koi scan nahi</p>
                    <p className="text-xs">No scans yet</p>
                  </div>
                ) : (
                  history.map((scan, index) => (
                    <button 
                      key={scan.id} 
                      onClick={() => openPastScan(scan)}
                      className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 flex gap-4 hover:bg-white/10 hover:border-white/10 transition-all text-left group"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-black flex-shrink-0">
                        <img src={scan.capturedImage} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black bg-[#e9c46a]/10 text-[#e9c46a] px-2 py-0.5 rounded uppercase">
                            {scan.cropType}
                          </span>
                          <span className="text-[10px] text-white/30 font-mono tracking-tighter">
                            {scan.date}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-white/60 line-clamp-2 leading-relaxed">
                          {cleanText(scan.analysisResult)}
                        </p>
                      </div>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight size={16} className="text-[#e9c46a]" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(233, 196, 106, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(233, 196, 106, 0.4);
        }
        @font-face {
          font-family: 'Noto Nastaliq Urdu';
          src: url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu&display=swap');
        }
        .urdu-text {
          font-family: 'Noto Nastaliq Urdu', serif;
        }
      `}</style>
    </div>
  </div>
);
}

function StatCard({ icon, label, urduLabel, value, color }: { icon: React.ReactNode, label: string, urduLabel: string, value: string, color: 'green' | 'red' | 'yellow' }) {
  const colorMap = {
    green: "border-[#e9c46a] bg-[#e9c46a]/5",
    red: "border-[#e63946] bg-[#e63946]/5",
    yellow: "border-[#e9c46a] bg-[#e9c46a]/5"
  };

  const iconColorMap = {
    green: "text-[#e9c46a]",
    red: "text-[#e63946]",
    yellow: "text-[#e9c46a]"
  };

  return (
    <div className={cn("p-5 border-l-[3px] rounded-xl transition-all hover:translate-x-1 duration-300", colorMap[color])}>
      <div className={cn("mb-3", iconColorMap[color])}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none mb-1">{label}</p>
        <p className="text-[#e9c46a] urdu-text text-sm leading-none mb-2 opacity-80">{urduLabel}</p>
        <p className="font-bold text-lg leading-tight">{value}</p>
      </div>
    </div>
  );
}
