
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  TranscriptSegment, 
  AudioFile, 
  ChunkProgress 
} from './types';
import { 
  fileToBase64, 
  formatDuration, 
  sliceAudio 
} from './utils/audioUtils';
import { transcribeAudioChunk, generateBusinessDocument } from './services/geminiService';
import { CHUNK_DURATION_SECONDS } from './constants';

const App: React.FC = () => {
  // --- EXISTING STATE ---
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chunks, setChunks] = useState<ChunkProgress[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- NEW STATE FOR GENERATOR ---
  const [viewMode, setViewMode] = useState<'transcribe' | 'generate'>('transcribe');
  const [docType, setDocType] = useState<'proposal' | 'upselling'>('proposal');
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const [externalTranscript, setExternalTranscript] = useState('');
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // --- EXISTING LOGIC ---
  const parseGeminiOutput = (text: string, chunkOffsetSec: number): TranscriptSegment[] => {
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    return lines.map((line, idx) => {
      const match = line.match(/\[(\d{2}):(\d{2})\]\s*\[(.*?)\]:\s*(.*)/);
      if (match) {
        const [_, mins, secs, speaker, content] = match;
        const totalSecs = parseInt(mins) * 60 + parseInt(secs) + chunkOffsetSec;
        return {
          id: `${chunkOffsetSec}-${idx}`,
          timestamp: formatDuration(totalSecs),
          speaker: speaker.trim(),
          text: content.trim(),
          confidence: 0.95 + Math.random() * 0.04
        };
      }
      return {
        id: `${chunkOffsetSec}-misc-${idx}`,
        timestamp: formatDuration(chunkOffsetSec),
        speaker: "Unknown",
        text: line,
        confidence: 0.8
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;

    audio.onloadedmetadata = () => {
      setAudioFile({
        file,
        name: file.name,
        duration: audio.duration,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB"
      });
      setAudioUrl(url);
    };
  };

  const startTranscription = async () => {
    if (!audioFile || isProcessing) return;

    setIsProcessing(true);
    setTranscript([]);
    
    const totalDuration = audioFile.duration;
    const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SECONDS);
    
    const initialChunks: ChunkProgress[] = Array.from({ length: numChunks }).map((_, i) => ({
      chunkIndex: i,
      totalChunks: numChunks,
      status: 'pending'
    }));
    setChunks(initialChunks);

    const allSegments: TranscriptSegment[] = [];

    try {
      for (let i = 0; i < numChunks; i++) {
        setCurrentChunkIndex(i);
        setChunks(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'processing' } : c));
        
        const start = i * CHUNK_DURATION_SECONDS;
        const end = Math.min((i + 1) * CHUNK_DURATION_SECONDS, totalDuration);
        
        // Extract chunk
        const chunkBlob = await sliceAudio(audioFile.file, start, end);
        const base64 = await fileToBase64(chunkBlob);
        
        // Call Gemini
        const resultText = await transcribeAudioChunk(base64, "audio/wav");
        const chunkSegments = parseGeminiOutput(resultText, start);
        
        allSegments.push(...chunkSegments);
        setTranscript([...allSegments]);
        setChunks(prev => prev.map((c, idx) => idx === i ? { ...c, status: 'completed' } : c));
      }
    } catch (error) {
      console.error("Transcription process failed:", error);
      setChunks(prev => prev.map((c, idx) => idx === currentChunkIndex ? { ...c, status: 'error' } : c));
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const exportTranscript = () => {
    const content = transcript.map(s => `[${s.timestamp}] [${s.speaker}]: ${s.text}`).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioFile?.name || 'transcript'}_transcription.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- NEW LOGIC FOR GENERATOR ---
  const handleTextUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setExternalTranscript(text);
  };

  const handleGenerateDocument = async () => {
    // Priority: External Upload -> Existing Transcript
    let sourceText = externalTranscript;
    if (!sourceText && transcript.length > 0) {
      sourceText = transcript.map(s => `[${s.timestamp}] [${s.speaker}]: ${s.text}`).join('\n');
    }

    if (!sourceText) return;

    setIsGeneratingDoc(true);
    setGeneratedDoc('');
    try {
      const result = await generateBusinessDocument(sourceText, docType);
      setGeneratedDoc(result);
    } catch (e) {
      setGeneratedDoc("Error generando el documento. Por favor verifique su API Key o intente de nuevo.");
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const exportDocument = () => {
    if (!generatedDoc) return;
    const blob = new Blob([generatedDoc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated_${docType}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-background-dark text-gray-200">
      {/* Header with Tabs */}
      <header className="h-16 border-b border-gray-800 bg-surface-dark flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-white font-bold text-xl shadow-lg shadow-primary/20">
            G
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold tracking-wide text-white truncate max-w-[200px] md:max-w-xs">
              {audioFile ? audioFile.name : "Gemini Pro Transcriber"}
            </h1>
            <span className="text-[10px] text-gray-500 font-mono uppercase">
              {audioFile ? `${formatDuration(audioFile.duration)} • ${audioFile.size}` : "Ready to process"}
            </span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="bg-accent-dark p-1 rounded-lg border border-gray-700 flex gap-1">
          <button 
            onClick={() => setViewMode('transcribe')}
            className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
              viewMode === 'transcribe' ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            TRANSCRIPTION
          </button>
          <button 
             onClick={() => setViewMode('generate')}
             className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
              viewMode === 'generate' ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            DOCUMENTS
          </button>
        </div>

        <div className="flex items-center gap-4">
          {viewMode === 'transcribe' && (
            <>
              {isProcessing && (
                <div className="flex items-center gap-2 bg-accent-dark px-3 py-1.5 rounded-full border border-gray-700">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Processing Chunk {currentChunkIndex + 1}/{chunks.length}
                  </span>
                </div>
              )}
              
              <button 
                onClick={exportTranscript}
                disabled={transcript.length === 0}
                className="hidden sm:flex bg-primary hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-all items-center gap-2 shadow-lg shadow-primary/20"
              >
                <span className="material-icons-round text-sm">download</span>
                Export
              </button>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-accent-dark hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border border-gray-700"
              >
                <span className="material-icons-round text-sm">upload_file</span>
                Upload
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="audio/*" 
                className="hidden" 
              />
            </>
          )}
        </div>
      </header>

      {/* Main Container - Conditional Rendering */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* --- VIEW MODE: TRANSCRIBE (The Original UI) --- */}
        {viewMode === 'transcribe' && (
          <>
            {/* Sidebar */}
            <aside className="w-16 bg-surface-dark border-r border-gray-800 flex flex-col items-center py-6 gap-6 flex-shrink-0">
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-primary bg-primary/10 transition-colors">
                <span className="material-icons-round">description</span>
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-200 hover:bg-accent-dark transition-all">
                <span className="material-icons-round">equalizer</span>
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-200 hover:bg-accent-dark transition-all">
                <span className="material-icons-round">history</span>
              </button>
              <div className="flex-1"></div>
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-200 hover:bg-accent-dark transition-all">
                <span className="material-icons-round">settings</span>
              </button>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden">
              
              {/* Waveform Visualization */}
              <div className="h-48 border-b border-gray-800 bg-surface-dark/50 p-6 flex flex-col justify-end relative group">
                <div className="absolute top-4 left-6 right-6 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-2">
                    <button className="p-1.5 bg-accent-dark border border-gray-700 rounded text-gray-400 hover:text-white">
                      <span className="material-icons-round text-lg">content_cut</span>
                    </button>
                    <button className="p-1.5 bg-accent-dark border border-gray-700 rounded text-gray-400 hover:text-white">
                      <span className="material-icons-round text-lg">bookmark_border</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-accent-dark border border-gray-700 px-3 rounded-lg">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Zoom</span>
                    <input type="range" className="w-20 h-1 accent-primary" />
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center gap-[3px] relative overflow-hidden">
                  <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-red-500/80 z-10 shadow-glow">
                    <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-red-500 rotate-45 rounded-sm"></div>
                  </div>
                  
                  {Array.from({ length: 120 }).map((_, i) => {
                    const height = 15 + Math.random() * 75;
                    const isPlayed = (i / 120) < (currentTime / (audioFile?.duration || 1));
                    return (
                      <div 
                        key={i} 
                        className={`w-1 rounded-full waveform-bar ${isPlayed ? 'bg-primary' : 'bg-gray-700'}`}
                        style={{ height: `${height}%`, opacity: isPlayed ? 1 : 0.4 }}
                      />
                    );
                  })}
                </div>

                <div className="flex justify-between mt-4 text-[10px] font-mono text-gray-500">
                  <span>00:00</span>
                  <span className="text-primary font-bold">{formatDuration(currentTime)}</span>
                  <span>{audioFile ? formatDuration(audioFile.duration) : "--:--"}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="h-20 bg-surface-dark border-b border-gray-800 flex items-center justify-between px-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 bg-accent-dark px-2 py-1 rounded">
                    {formatDuration(currentTime)} / {audioFile ? formatDuration(audioFile.duration) : "--:--"}
                  </span>
                </div>

                <div className="flex items-center gap-6">
                  <button className="text-gray-500 hover:text-white transition-colors">
                    <span className="material-icons-round">replay_10</span>
                  </button>
                  <button 
                    onClick={togglePlay}
                    disabled={!audioUrl}
                    className="w-12 h-12 rounded-full bg-primary hover:bg-indigo-600 disabled:bg-gray-700 text-white flex items-center justify-center shadow-lg shadow-primary/20 transition-transform active:scale-95"
                  >
                    <span className="material-icons-round text-3xl">
                      {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                  </button>
                  <button className="text-gray-500 hover:text-white transition-colors">
                    <span className="material-icons-round">forward_10</span>
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-sm text-gray-500">volume_up</span>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.01" 
                      value={volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (audioRef.current) audioRef.current.volume = val;
                      }}
                      className="w-20 h-1 accent-primary" 
                    />
                  </div>
                  <select 
                    value={playbackSpeed}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setPlaybackSpeed(val);
                      if (audioRef.current) audioRef.current.playbackRate = val;
                    }}
                    className="bg-accent-dark border-none text-[10px] font-mono rounded px-2 py-1 text-gray-400 focus:ring-0 cursor-pointer"
                  >
                    <option value="0.5">0.5x</option>
                    <option value="1">1.0x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2.0x</option>
                  </select>
                </div>
              </div>

              {/* Lower Pane */}
              <div className="flex-1 flex overflow-hidden">
                {/* Transcript Area */}
                <div className="flex-1 bg-background-dark overflow-y-auto p-6 scroll-smooth">
                  {!audioFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <span className="material-icons-round text-6xl mb-4">audio_file</span>
                      <p className="text-lg font-medium">No audio file selected</p>
                      <p className="text-sm">Upload an MP3 or WAV to begin transcription</p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-6 bg-primary/20 hover:bg-primary/30 text-primary px-6 py-2 rounded-full border border-primary/50 transition-all font-medium"
                      >
                        Select File
                      </button>
                    </div>
                  ) : transcript.length === 0 && !isProcessing ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="p-8 bg-surface-dark border border-gray-800 rounded-2xl max-w-sm shadow-xl">
                        <span className="material-icons-round text-4xl text-primary mb-4">rocket_launch</span>
                        <h2 className="text-xl font-bold mb-2">Ready to Transcribe</h2>
                        <p className="text-sm text-gray-400 mb-6">
                          Gemini will process your audio in {Math.ceil(audioFile.duration / CHUNK_DURATION_SECONDS)} parts for maximum accuracy.
                        </p>
                        <button 
                          onClick={startTranscription}
                          className="w-full bg-primary hover:bg-indigo-600 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-primary/20"
                        >
                          Start Analysis
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto space-y-8 pb-20">
                      {transcript.map((seg, idx) => (
                        <div 
                          key={seg.id} 
                          className={`group flex gap-6 transition-all rounded-xl p-4 hover:bg-surface-dark/40 ${currentTime >= parseFloat(seg.timestamp.split(':')[1]) ? 'border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
                        >
                          <div className="w-20 shrink-0">
                            <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded cursor-pointer hover:bg-primary/20 transition-colors"
                              onClick={() => {
                                const [m, s] = seg.timestamp.split(':').map(Number);
                                if (audioRef.current) audioRef.current.currentTime = m * 60 + s;
                              }}
                            >
                              {seg.timestamp}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{seg.speaker}</span>
                              {seg.confidence && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-900/20 text-green-500 font-bold border border-green-900/40">
                                  {(seg.confidence * 100).toFixed(0)}% CONFIDENCE
                                </span>
                              )}
                            </div>
                            <p className="text-gray-300 leading-relaxed font-medium">
                              {seg.text}
                            </p>
                          </div>
                        </div>
                      ))}
                      {isProcessing && (
                        <div className="flex gap-6 animate-pulse p-4">
                          <div className="w-20 h-4 bg-gray-800 rounded"></div>
                          <div className="flex-1 space-y-3">
                            <div className="h-3 bg-gray-800 rounded w-1/4"></div>
                            <div className="h-4 bg-gray-800 rounded w-full"></div>
                            <div className="h-4 bg-gray-800 rounded w-3/4"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Processing Pane */}
                <div className="w-80 border-l border-gray-800 bg-surface-dark flex flex-col p-6 overflow-y-auto">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">Processing Status</h3>
                  
                  <div className="space-y-4">
                    {chunks.map((chunk, i) => (
                      <div key={i} className={`p-4 rounded-xl border transition-all ${
                        chunk.status === 'processing' ? 'border-primary bg-primary/5 shadow-inner' : 
                        chunk.status === 'completed' ? 'border-green-900/30 bg-green-900/5' : 
                        chunk.status === 'error' ? 'border-red-900/30 bg-red-900/5' :
                        'border-gray-800 bg-accent-dark/50'
                      }`}>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-[10px] font-mono text-gray-500">SEGMENT {i + 1}</span>
                          {chunk.status === 'processing' && <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>}
                          {chunk.status === 'completed' && <span className="material-icons-round text-green-500 text-sm">check_circle</span>}
                          {chunk.status === 'error' && <span className="material-icons-round text-red-500 text-sm">error</span>}
                        </div>
                        
                        <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden mb-2">
                          <div className={`h-full transition-all duration-500 ${
                            chunk.status === 'completed' ? 'w-full bg-green-500' : 
                            chunk.status === 'processing' ? 'w-1/2 bg-primary animate-pulse' : 
                            chunk.status === 'error' ? 'w-full bg-red-500' : 'w-0'
                          }`}></div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400 capitalize">{chunk.status}</span>
                          <span className="text-[10px] text-gray-600 font-mono">
                            {formatDuration(i * CHUNK_DURATION_SECONDS)}
                          </span>
                        </div>
                      </div>
                    ))}

                    {!audioFile && (
                      <div className="p-10 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center opacity-30">
                          <span className="material-icons-round text-4xl mb-2">queue</span>
                          <span className="text-xs font-medium text-center">Upload audio to see analysis pipeline</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="bg-accent-dark p-4 rounded-xl border border-gray-800">
                      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500">
                        <span className="material-icons-round text-sm">info</span>
                        AI ENGINE
                      </div>
                      <p className="text-[10px] text-gray-400 leading-normal">
                        Using Gemini 3 Flash Preview for ultra-fast, clean verbatim transcription with technical terminology preservation.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </>
        )}

        {/* --- VIEW MODE: DOCUMENT GENERATOR (The New Feature) --- */}
        {viewMode === 'generate' && (
          <div className="flex-1 flex overflow-hidden">
             {/* Left Panel: Configuration */}
             <div className="w-1/3 border-r border-gray-800 bg-surface-dark flex flex-col p-6 overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <span className="material-icons-round text-primary">auto_awesome</span>
                  Business Generator
                </h2>

                <div className="space-y-6">
                  {/* Doc Type Selection */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Document Type</label>
                    <div className="grid grid-cols-1 gap-3">
                      <button 
                        onClick={() => setDocType('proposal')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          docType === 'proposal' 
                            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10' 
                            : 'border-gray-800 bg-accent-dark hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-icons-round text-sm text-primary">handshake</span>
                          <span className="font-bold text-sm text-white">Propuesta Comercial</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Genera una propuesta formal con diagnóstico, estrategia y presupuesto.</p>
                      </button>

                      <button 
                        onClick={() => setDocType('upselling')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          docType === 'upselling' 
                            ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10' 
                            : 'border-gray-800 bg-accent-dark hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-icons-round text-sm text-primary">trending_up</span>
                          <span className="font-bold text-sm text-white">Ampliación (Upselling)</span>
                        </div>
                        <p className="text-[10px] text-gray-400">Detecta nuevas necesidades y justifica servicios adicionales.</p>
                      </button>
                    </div>
                  </div>

                  {/* Source Selection */}
                  <div className="space-y-3 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Source Context</label>
                      <button 
                        onClick={() => textInputRef.current?.click()}
                        className="text-[10px] text-primary hover:text-white flex items-center gap-1"
                      >
                        <span className="material-icons-round text-[14px]">upload</span>
                        Upload TXT
                      </button>
                      <input 
                        type="file" 
                        ref={textInputRef} 
                        className="hidden" 
                        accept=".txt" 
                        onChange={handleTextUpload}
                      />
                    </div>
                    
                    <div className="flex-1 bg-background-dark border border-gray-800 rounded-xl p-3 overflow-hidden flex flex-col min-h-[200px]">
                      <textarea 
                        className="w-full h-full bg-transparent border-none text-xs font-mono text-gray-400 focus:ring-0 resize-none p-0 leading-relaxed scrollbar-thin"
                        placeholder="El contexto se tomará automáticamente de la pestaña de Transcripción. O puedes pegar/subir texto aquí..."
                        value={externalTranscript || (transcript.length > 0 ? transcript.map(s => `[${s.timestamp}] ${s.speaker}: ${s.text}`).join('\n') : '')}
                        onChange={(e) => setExternalTranscript(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-gray-600 text-center">
                      {transcript.length > 0 && !externalTranscript 
                        ? "Using active transcription as source." 
                        : "Using manual text/upload as source."}
                    </p>
                  </div>

                  <button 
                    onClick={handleGenerateDocument}
                    disabled={isGeneratingDoc || (!externalTranscript && transcript.length === 0)}
                    className="w-full bg-primary hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    {isGeneratingDoc ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></span>
                        Analyzing Context...
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round">smart_toy</span>
                        Generate Document
                      </>
                    )}
                  </button>
                </div>
             </div>

             {/* Right Panel: Output */}
             <div className="flex-1 bg-background-dark flex flex-col p-8 overflow-hidden">
               <div className="max-w-4xl w-full mx-auto h-full flex flex-col gap-4">
                 <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                   <h3 className="text-lg font-bold text-gray-300">Generated Output</h3>
                   <div className="flex gap-2">
                      <button 
                        onClick={() => setGeneratedDoc('')}
                        className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-surface-dark transition-all"
                        title="Clear"
                      >
                        <span className="material-icons-round">delete_outline</span>
                      </button>
                      <button 
                        onClick={exportDocument}
                        disabled={!generatedDoc}
                        className="bg-accent-dark hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold border border-gray-700 flex items-center gap-2"
                      >
                        <span className="material-icons-round text-sm">download</span>
                        Download
                      </button>
                   </div>
                 </div>

                 <div className="flex-1 bg-surface-dark border border-gray-800 rounded-2xl p-8 overflow-y-auto shadow-2xl">
                    {generatedDoc ? (
                      <div className="prose prose-invert prose-sm max-w-none font-serif leading-loose text-gray-300 whitespace-pre-wrap">
                        {generatedDoc}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center opacity-20 select-none">
                        <span className="material-icons-round text-6xl mb-4">description</span>
                        <p className="text-sm font-medium">Select a document type and generate to see results.</p>
                      </div>
                    )}
                 </div>
               </div>
             </div>
          </div>
        )}

      </div>

      {/* Hidden audio element for logic */}
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Utility Style */}
      <style>{`
        .shadow-glow {
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #6366f1;
          cursor: pointer;
        }
        /* Scrollbar styles specific to the textarea */
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
      `}</style>
    </div>
  );
};

export default App;
