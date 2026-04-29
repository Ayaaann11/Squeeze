/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { PDFDocument } from 'pdf-lib';
import { Upload, Download, Image as ImageIcon, X, Loader2, CheckCircle2, Sliders, AlertTriangle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FileStats {
  name: string;
  size: number;
  type: string;
  url: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

export default function App() {
  const [originalFile, setOriginalFile] = useState<FileStats | null>(null);
  const [originalRawFile, setOriginalRawFile] = useState<File | null>(null);
  const [compressedFile, setCompressedFile] = useState<FileStats | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState(0.8);
  const [autoDownload, setAutoDownload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState<'auto' | '1mb' | '2mb'>('auto');
  
  // PDF specific options
  const [optimizePdfImages, setOptimizePdfImages] = useState(true);
  const [removeMetadata, setRemoveMetadata] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0.00MB';
    return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
  };

  const compressPdf = useCallback(async (file: File) => {
    setIsCompressing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      if (removeMetadata) {
        pdfDoc.setTitle('');
        pdfDoc.setAuthor('');
        pdfDoc.setSubject('');
        pdfDoc.setKeywords([]);
        pdfDoc.setProducer('');
        pdfDoc.setCreator('');
      }

      const compressedBytes = await pdfDoc.save({ 
        useObjectStreams: true,
        addDefaultPage: false,
      });

      const blob = new Blob([compressedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const compressedStats = {
        name: file.name.replace(/\.[^/.]+$/, "") + "_compressed.pdf",
        size: blob.size,
        type: 'application/pdf',
        url: url,
      };
      
      setCompressedFile(compressedStats);

      if (autoDownload) {
        const link = document.createElement('a');
        link.href = url;
        link.download = compressedStats.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('PDF optimization failed:', error);
      setError('Failed to optimize PDF. The file might be protected or corrupted.');
    } finally {
      setIsCompressing(false);
    }
  }, [autoDownload, removeMetadata]);

  const compressFile = useCallback(async (file: File, targetQuality: number) => {
    if (file.type === 'application/pdf') {
       return compressPdf(file);
    }
    
    setIsCompressing(true);
    
    // Map target size selections to maxSizeMB
    let maxSizeMB = 2; // Default
    if (targetSize === '1mb') maxSizeMB = 1;
    if (targetSize === '2mb') maxSizeMB = 2;

    const options = {
      maxSizeMB: targetSize === 'auto' ? 2 : maxSizeMB,
      maxWidthOrHeight: 4096,
      useWebWorker: true,
      initialQuality: targetQuality,
      fileType: 'image/png' as const,
      alwaysKeepResolution: true,
    };

    try {
      const compressedBlob = await imageCompression(file, options);
      const url = URL.createObjectURL(compressedBlob);
      
      const compressedStats = {
        name: file.name.replace(/\.[^/.]+$/, "") + "_compressed.png",
        size: compressedBlob.size,
        type: 'image/png',
        url: url,
      };
      
      setCompressedFile(compressedStats);

      if (autoDownload) {
        const link = document.createElement('a');
        link.href = url;
        link.download = compressedStats.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Compression failed:', error);
      setError('Failed to compress file. Please try another one.');
    } finally {
      setIsCompressing(false);
    }
  }, [autoDownload, compressPdf]);

  // Reactive compression whenever config changes
  React.useEffect(() => {
    if (originalRawFile) {
      compressFile(originalRawFile, quality);
    }
  }, [originalRawFile, quality, targetSize, compressFile, removeMetadata, optimizePdfImages]);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Global Drag and Drop & PWA logic
  React.useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    const handleGlobalDrag = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setIsDragging(true);
      } else if (e.type === 'dragleave') {
        if (e.relatedTarget === null) setIsDragging(false);
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) processFile(file);
    };

    window.addEventListener('dragenter', handleGlobalDrag);
    window.addEventListener('dragover', handleGlobalDrag);
    window.addEventListener('dragleave', handleGlobalDrag);
    window.addEventListener('drop', handleGlobalDrop);

    return () => {
      window.removeEventListener('dragenter', handleGlobalDrag);
      window.removeEventListener('dragover', handleGlobalDrag);
      window.removeEventListener('dragleave', handleGlobalDrag);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Invalid file type (${file.type}). Please upload an image or PDF file.`);
      return;
    }

    const url = URL.createObjectURL(file);
    setOriginalFile({
      name: file.name,
      size: file.size,
      type: file.type,
      url: url,
    });
    setOriginalRawFile(file);
    setCompressedFile(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const reset = () => {
    setOriginalFile(null);
    setOriginalRawFile(null);
    setCompressedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadImage = () => {
    if (!compressedFile) return;
    const link = document.createElement('a');
    link.href = compressedFile.url;
    link.download = compressedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const reduction = originalFile && compressedFile 
    ? ((originalFile.size - compressedFile.size) / originalFile.size * 100).toFixed(1)
    : 0;

  const downloadProject = () => {
    window.location.href = '/api/download-project';
  };

  return (
    <div className={`min-h-screen bg-[#0A0A0A] text-[#F0F0F0] font-sans flex flex-col items-center justify-between p-8 sm:p-16 overflow-hidden relative transition-colors duration-300 ${isDragging ? 'bg-[#001a05]' : 'bg-[#0A0A0A]'}`}>
      {/* Background Decorative Text */}
      <div className={`absolute top-[-40px] left-[-20px] text-[20rem] sm:text-[32rem] font-black leading-none select-none pointer-events-none z-0 transition-colors duration-300 ${isDragging ? 'text-[#005511]' : 'text-[#151515]'}`}>
        {originalFile?.type === 'application/pdf' ? 'PDF' : 'PNG'}
      </div>

      <nav className="w-full flex justify-between items-center relative z-10">
        <div className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-50">Squeeze / V1.6</div>
        <div className="flex gap-6 sm:gap-8 items-center">
          {deferredPrompt && (
            <button 
              onClick={installApp}
              className="text-[10px] font-bold tracking-[0.3em] uppercase text-[#00FF41] animate-pulse cursor-pointer"
            >
              [ Install App ]
            </button>
          )}
          <button 
            onClick={downloadProject}
            className="flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] uppercase text-[#00FF41] hover:text-white transition-colors cursor-pointer group"
          >
            <Download size={14} className="group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">[ Download Project ]</span>
          </button>
          <button 
            onClick={() => setShowHelp(true)}
            className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            How to Download?
          </button>
          <span className="hidden sm:inline text-[10px] font-bold tracking-[0.3em] uppercase opacity-50">Mode: {originalFile?.type === 'application/pdf' ? 'PDF' : 'Image'}</span>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl relative z-10 py-12">
        <div className="text-center mb-12">
          <h1 className="text-[60px] sm:text-[120px] font-black tracking-tighter leading-[0.8] uppercase">
            {isDragging ? 'DROP NOW' : 'SQUEEZE'}<span className="text-[#00FF41]">.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg font-medium tracking-tight text-[#888] max-w-md mx-auto">
            Lossless-feel compression for images & PDFs. <br className="hidden sm:block" />Drop file anywhere to begin.
          </p>
        </div>

        <div className="w-full max-w-2xl group relative">
          <AnimatePresence mode="wait">
            {!originalFile ? (
              <motion.div
                key="upload-zone"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-3xl p-12 sm:p-20 flex flex-col items-center justify-center 
                  bg-[#111] transition-all cursor-pointer relative overflow-hidden
                  ${isDragging ? 'border-[#00FF41] bg-[#1A1A1A] scale-[1.02]' : 'border-[#333] hover:border-[#444]'}
                `}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />
                <div className="w-20 h-20 mb-8 rounded-full bg-[#1A1A1A] flex items-center justify-center transition-transform group-hover:scale-110">
                  <Upload size={32} className={error ? "text-red-500" : (isDragging ? "text-white" : "text-[#00FF41]")} strokeWidth={2.5} />
                </div>
                <span className={`text-xs font-black tracking-[0.2em] uppercase ${error ? "text-red-500" : (isDragging ? "text-white" : "text-[#555]")}`}>
                  {isDragging ? "Drop your file" : (error ? "Invalid File" : "Select Source File")}
                </span>
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-500/10 px-4 py-2 rounded-full border border-red-500/20"
                  >
                    {error}
                  </motion.p>
                )}
                {isDragging && (
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.1, opacity: 1 }}
                    className="absolute inset-0 bg-[#00FF41]/5 pointer-events-none"
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="active-state"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-[#111] border border-[#222] rounded-[32px] p-8 sm:p-12"
              >
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1A1A1A] flex items-center justify-center">
                      {originalFile.type === 'application/pdf' ? (
                        <FileText size={20} className="text-red-500" />
                      ) : (
                        <ImageIcon size={20} className="text-[#888]" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#F0F0F0] truncate max-w-[150px] sm:max-w-xs">{originalFile.name}</h3>
                      <p className="text-[10px] font-bold text-[#555] uppercase tracking-wider">{originalFile.type}</p>
                    </div>
                  </div>
                  <button onClick={reset} className="p-3 hover:bg-[#1A1A1A] rounded-full text-[#555] hover:text-[#F0F0F0] transition-colors">
                    <X size={20} />
                  </button>
                </div>

                {/* Previews */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-[#555]">Original Input</span>
                      <span className="text-[9px] font-mono text-[#888]">{formatFileSize(originalFile.size)}</span>
                    </div>
                    <div className="aspect-video bg-[#050505] rounded-2xl border border-[#222] overflow-hidden flex items-center justify-center group/preview">
                      {originalFile.type === 'application/pdf' ? (
                        <div className="flex flex-col items-center gap-2 opacity-50 group-hover/preview:opacity-100 transition-opacity">
                          <FileText size={48} className="text-[#333]" />
                          <span className="text-[10px] font-bold text-[#333] uppercase tracking-widest">PDF Source</span>
                        </div>
                      ) : (
                        <img src={originalFile.url} alt="Original" className="w-full h-full object-contain opacity-50 group-hover/preview:opacity-100 transition-opacity duration-500" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-[#555]">Optimized Output</span>
                      <span className="text-[9px] font-mono text-[#00FF41]">
                        {isCompressing ? "Processing..." : (compressedFile ? formatFileSize(compressedFile.size) : "...")}
                      </span>
                    </div>
                    <div className="aspect-video bg-[#050505] rounded-2xl border border-[#222] overflow-hidden flex items-center justify-center relative">
                      {isCompressing ? (
                        <Loader2 size={24} className="animate-spin text-[#222]" />
                      ) : compressedFile ? (
                        compressedFile.type === 'application/pdf' ? (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center gap-2"
                          >
                            <FileText size={48} className="text-[#00FF41] shadow-2xl" />
                            <span className="text-[10px] font-bold text-[#00FF41] uppercase tracking-widest">Optimized PDF</span>
                          </motion.div>
                        ) : (
                          <motion.img 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            src={compressedFile.url} 
                            alt="Compressed" 
                            className="w-full h-full object-contain shadow-2xl" 
                          />
                        )
                      ) : (
                        <span className="text-[10px] font-bold tracking-widest uppercase text-[#222]">Waiting...</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quality & Target Size Selector */}
                <div className="mb-12 space-y-8 px-2">
                  {originalFile.type !== 'application/pdf' ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-2">
                          <Sliders size={14} className="text-[#00FF41]" />
                          <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Compression Power</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#00FF41]">{Math.round(quality * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={quality}
                        onChange={(e) => setQuality(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-[#222] rounded-full appearance-none cursor-pointer accent-[#00FF41] hover:accent-[#00FF41]/80"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setRemoveMetadata(!removeMetadata)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${removeMetadata ? 'bg-[#00FF41]/10 border-[#00FF41]/30 text-[#00FF41]' : 'bg-[#1A1A1A] border-[#333] text-[#555]'}`}
                      >
                        <CheckCircle2 size={16} className={removeMetadata ? 'opacity-100' : 'opacity-20'} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Strip Metadata</span>
                      </button>
                      <button 
                        onClick={() => setOptimizePdfImages(!optimizePdfImages)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${optimizePdfImages ? 'bg-[#00FF41]/10 border-[#00FF41]/30 text-[#00FF41]' : 'bg-[#1A1A1A] border-[#333] text-[#555]'}`}
                      >
                        <CheckCircle2 size={16} className={optimizePdfImages ? 'opacity-100' : 'opacity-20'} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Optim. Streams</span>
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                       <Download size={14} className="text-[#00FF41]" />
                       <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Target File Size</span>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { id: 'auto', label: 'Automatic' },
                        { id: '1mb', label: '0-1000 KB' },
                        { id: '2mb', label: '1000-2000 KB' },
                      ].map((range) => (
                        <button
                          key={range.id}
                          onClick={() => setTargetSize(range.id as any)}
                          className={`
                            flex-1 py-3 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all
                            ${targetSize === range.id 
                              ? 'bg-[#00FF41] text-black shadow-lg shadow-[#00FF41]/20' 
                              : 'bg-[#1A1A1A] text-[#555] hover:text-[#888] hover:bg-[#222]'}
                          `}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className={autoDownload ? "text-[#00FF41]" : "text-[#333]"} />
                      <span className="text-[10px] font-bold tracking-widest uppercase text-[#555]">Auto-Download on Finish</span>
                    </div>
                    <button 
                      onClick={() => setAutoDownload(!autoDownload)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${autoDownload ? 'bg-[#00FF41]' : 'bg-[#222]'}`}
                    >
                      <motion.div 
                        animate={{ x: autoDownload ? 20 : 2 }}
                        className="absolute top-1 left-0 w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[#555] mb-2">Original</span>
                    <span className="text-lg sm:text-2xl font-mono text-[#888]">{formatFileSize(originalFile.size)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[#555] mb-2">Compressed</span>
                    <span className="text-lg sm:text-2xl font-mono text-[#00FF41]">
                      {isCompressing ? "..." : (compressedFile ? formatFileSize(compressedFile.size) : "...")}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[#555] mb-2">Savings</span>
                    <span className="text-lg sm:text-2xl font-mono">
                      {isCompressing ? "--" : `${reduction}%`}
                    </span>
                  </div>
                </div>

                {isCompressing && (
                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-[#00FF41] animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> Processing Buffer...
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="w-full flex flex-col sm:flex-row justify-between items-center sm:items-end gap-8 relative z-10">
        <div className="max-w-xs text-center sm:text-left">
          <p className="text-[10px] leading-relaxed text-[#444] font-bold uppercase tracking-wider">
            Zero data leaves your browser. All processing is done locally via client-side buffers for maximum privacy and speed.
          </p>
        </div>
        
        <button
          disabled={!compressedFile || isCompressing}
          onClick={downloadImage}
          className={`
            bg-white text-black px-12 py-5 rounded-full font-black text-xs tracking-[0.2em] uppercase transition-all
            ${!compressedFile || isCompressing 
              ? 'opacity-20 cursor-not-allowed' 
              : 'hover:bg-[#00FF41] hover:scale-105 active:scale-95 cursor-pointer shadow-2xl shadow-[#00FF41]/20'}
          `}
        >
          {isCompressing ? 'Processing...' : 'Download Output'}
        </button>
      </footer>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-[#111] border border-[#222] rounded-[32px] p-8 sm:p-12 max-w-xl w-full relative"
            >
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-8 right-8 p-2 hover:bg-[#222] rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <h2 className="text-2xl font-black tracking-tight mb-8 uppercase">How to Download & Install</h2>
              
              <div className="space-y-8">
                <section>
                  <h3 className="text-[#00FF41] text-[10px] font-black uppercase tracking-[0.2em] mb-4">Option 1: Export as Standalone ZIP (Single HTML)</h3>
                  <p className="text-sm text-[#888] leading-relaxed">
                    To download the full application source code, click the <span className="text-white font-bold">Settings (Gear Icon)</span> in the top-right corner, then select <span className="text-white font-bold">Export to ZIP</span>. The project is pre-configured to build as a <span className="text-white font-bold">single HTML file</span> that you can open anywhere.
                  </p>
                </section>

                <section>
                  <h3 className="text-[#00FF41] text-[10px] font-black uppercase tracking-[0.2em] mb-4">Option 2: Install as Native App (PWA)</h3>
                  <p className="text-sm text-[#888] leading-relaxed">
                    You can install Squeeze directly onto your desktop or phone for offline use. Look for the <span className="text-white font-bold">"Install"</span> icon in your browser's address bar, or click the <span className="text-white font-bold">"Install App"</span> button in the top navigation of this page.
                  </p>
                </section>

                <section>
                  <h3 className="text-[#00FF41] text-[10px] font-black uppercase tracking-[0.2em] mb-4">Option 3: Download Compressed Result</h3>
                  <p className="text-sm text-[#888] leading-relaxed">
                    Once you upload a file, the processed version will appear on the right. Simply click the large <span className="text-white font-bold">"Download Output"</span> button at the bottom to save the optimized file.
                  </p>
                </section>
              </div>

              <button 
                onClick={() => setShowHelp(false)}
                className="mt-12 w-full py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-[#00FF41] transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
