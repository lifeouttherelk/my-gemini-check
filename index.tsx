import React, { useState, useRef, FC } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

type Status = 'pass' | 'found' | null;

// Helper function to convert a File to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

// Helper function to convert base64 to ArrayBuffer
const base64ToArrayBuffer = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to convert PCM audio data to WAV format
const pcmToWav = (pcmData: Int16Array, sampleRate: number) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = numChannels * bitsPerSample / 8 * sampleRate;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44 + pcmData.length * 2);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, 36 + pcmData.length * 2, true); // file length
  view.setUint32(8, 0x57415645, false); // 'WAVE'
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true); // format chunk length
  view.setUint16(20, 1, true); // sample format (1 for PCM)
  view.setUint16(22, numChannels, true); // number of channels
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, byteRate, true); // byte rate
  view.setUint16(32, blockAlign, true); // block align
  view.setUint16(34, bitsPerSample, true); // bits per sample
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, pcmData.length * 2, true); // data chunk length

  let offset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(offset, pcmData[i], true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};


const App: FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copyrightStatus, setCopyrightStatus] = useState<Status>(null);
  const [copyrightDescription, setCopyrightDescription] = useState<string | null>(null);
  const [zedgeViolationStatus, setZedgeViolationStatus] = useState<Status>(null);
  const [zedgeViolationDescription, setZedgeViolationDescription] = useState<string | null>(null);
  const [womenPolicyStatus, setWomenPolicyStatus] = useState<Status>(null);
  const [womenPolicyDescription, setWomenPolicyDescription] = useState<string | null>(null);
  const [kidsViolationStatus, setKidsViolationStatus] = useState<Status>(null);
  const [kidsViolationDescription, setKidsViolationDescription] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState("");

  const showModal = (message: string) => {
    setModalContent(message);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalContent("");
  };

  const resetState = () => {
    setCopyrightStatus(null);
    setCopyrightDescription(null);
    setZedgeViolationStatus(null);
    setZedgeViolationDescription(null);
    setWomenPolicyStatus(null);
    setWomenPolicyDescription(null);
    setKidsViolationStatus(null);
    setKidsViolationDescription(null);
    setTitle(null);
    setImageDescription(null);
    setTags([]);
    setError(null);
  };
  
  const handleFileSelect = (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      resetState();
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    handleFileSelect(file || null);
    if(event.target) {
        event.target.value = "";
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    handleFileSelect(file || null);
  };

  const handleClear = () => {
    if(imageUrl && imageFile) {
        URL.revokeObjectURL(imageUrl);
    }
    setImageFile(null);
    setImageUrl(null);
    resetState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showModal("Copied to clipboard!");
    }).catch(() => {
      showModal("Failed to copy text.");
    });
  };

  const analyzeImageWithAI = async () => {
    if (!imageFile) {
      showModal("Please upload an image first.");
      return;
    }

    setLoading(true);
    resetState();

    try {
      const base64Data = await fileToBase64(imageFile);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

      const forbiddenWords = ["wallpaper", "holiday", "trending", "funny", "technology", "entertainment", "music", "nature", "drawings", "sports", "brands", "cars & vehicles", "other", "animals", "patterns", "bollywood", "anime", "games", "designs", "love", "news & politics", "people", "sayings", "spiritual", "space", "comics", "alternative", "children", "classical", "country", "dance", "electronica", "comedy", "hip hop", "jazz", "latin", "pop", "rnb soul", "reggae", "rock", "message tones", "sound effects", "world", "blues", "religious", "contact ringtones"];
      const fullPrompt = `
        Analyze the uploaded image for any visible watermarks, copyright symbols, or logos. If clear signs of copyright infringement are found, respond with 'found' for the 'status' key. If not, respond with 'pass'. Provide a brief explanation of the copyright findings in the 'copyrightDescription' key.

        Now, perform a separate validation for Zedge Content Policy. Check for specific violations as per Zedge's policy, including but not limited to:
        1. Explicit branded content or commercial logos.
        2. Sexually explicit, obscene, or pornographic content (e.g., nudity, visible breasts).
        3. Graphic or gratuitous violence, hate speech, or harassment.
        4. Depictions of illegal acts or content promoting them.
        5. Sensitive content, such as images of children.
        
        If any of these Zedge violations are found, respond with 'found' for the 'zedgeViolationStatus' key. Otherwise, respond with 'pass'. Provide a brief explanation of the Zedge findings in the 'zedgeViolationDescription' key.

        Now, perform a new validation rule called "Women policy". If a woman is in the image, check for the following violations:
        1. Is a bra visible?
        2. Are breasts or busts visible in a way that violates a nudity or sexuality policy? The images you were provided with (2cskE_vv-editing.jpg and 9f9bTpAe-editing.jpg) show examples of stylized, form-fitting outfits that accentuate the breast/bust area and should be considered a violation.
        
        If any of these "Women policy" violations are found, respond with 'found' for the 'womenPolicyStatus' key. Otherwise, respond with 'pass'. Provide a brief explanation of the Women policy findings in the 'womenPolicyDescription' key.

        Next, perform a new validation rule called "Kids Detection Policy". Check for the following rules:
        1. The image should not have any human kids or children's.
        
        If any of these "Kids Detection Policy" violations are found, respond with 'found' for the 'kidsViolationStatus' key. Otherwise, respond with 'pass'. Provide a brief explanation of the Kids Detection findings in the 'kidsViolationDescription' key.
        
        If all four statuses ('status', 'zedgeViolationStatus', 'womenPolicyStatus', and 'kidsViolationStatus') are 'pass', also provide a creative, and search-engine-optimized title (max 60 characters) for a stock image site like Shutterstock or iStock. The title must describe the figure in the image and include a specific figure's name or the animal's type if the figure is an animal. Do not include any words that describe the image's style, such as 'cinematic', 'photorealistic', 'painting', '3D', 'digital art', etc.
        
        Provide a creative and fantasized description of the image, focusing on the figure and the activity taking place within it. This description should be suitable for stock image sites like Shutterstock and iStock and must be limited to a maximum of 170 characters. This description should be in a new field called 'imageDescription'. Also provide exactly 8 tags.
        For the tags, ensure at least two tags describe the background (e.g., 'darker_tones', 'vibrant_colors'). If there is a figure in the image, provide at least two tags describing the type of figure (e.g., 'mythical_creature', 'ancient_guardian').
        All tags must have no spaces and use an underscore '_' to separate words. Each tag should be less than 25 characters.
        
        The title, description, and tags should NOT contain any of the following words or concepts: ${forbiddenWords.join(', ')} or any film names or TV season names.
        
        Respond with a JSON object containing the keys:
        'status' (with a value of 'pass' or 'found' for general copyright),
        'copyrightDescription' (a brief explanation of the copyright findings),
        'zedgeViolationStatus' (with a value of 'pass' or 'found' for the Zedge policy),
        'zedgeViolationDescription' (a brief explanation of the Zedge findings),
        'womenPolicyStatus' (with a value of 'pass' or 'found' for the Women policy),
        'womenPolicyDescription' (a brief explanation of the Women policy findings),
        'kidsViolationStatus' (with a value of 'pass' or 'found' for the Kids Detection),
        'kidsViolationDescription' (a brief explanation of the Kids Detection findings),
        'title' (a creative title if all statuses are 'pass'),
        'imageDescription' (the creative description if all statuses are 'pass'),
        and 'tags' (an array of 8 tags if all statuses are 'pass').
        `;
      
      const imagePart = { inlineData: { data: base64Data, mimeType: imageFile.type } };
      const textPart = { text: fullPrompt };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              "status": { type: Type.STRING, enum: ['pass', 'found'] },
              "copyrightDescription": { type: Type.STRING },
              "zedgeViolationStatus": { type: Type.STRING, enum: ['pass', 'found'] },
              "zedgeViolationDescription": { type: Type.STRING },
              "womenPolicyStatus": { type: Type.STRING, enum: ['pass', 'found'] },
              "womenPolicyDescription": { type: Type.STRING },
              "kidsViolationStatus": { type: Type.STRING, enum: ['pass', 'found'] },
              "kidsViolationDescription": { type: Type.STRING },
              "title": { type: Type.STRING },
              "imageDescription": { type: Type.STRING },
              "tags": { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });
      
      const jsonText = response.text;
      const parsedJson = JSON.parse(jsonText);

      setCopyrightStatus(parsedJson.status as Status);
      setCopyrightDescription(parsedJson.copyrightDescription);
      setZedgeViolationStatus(parsedJson.zedgeViolationStatus as Status);
      setZedgeViolationDescription(parsedJson.zedgeViolationDescription);
      setWomenPolicyStatus(parsedJson.womenPolicyStatus as Status);
      setWomenPolicyDescription(parsedJson.womenPolicyDescription);
      setKidsViolationStatus(parsedJson.kidsViolationStatus as Status);
      setKidsViolationDescription(parsedJson.kidsViolationDescription);
      
      if (parsedJson.status === 'pass' && parsedJson.zedgeViolationStatus === 'pass' && parsedJson.womenPolicyStatus === 'pass' && parsedJson.kidsViolationStatus === 'pass') {
        setTitle(parsedJson.title);
        setImageDescription(parsedJson.imageDescription);
        setTags(parsedJson.tags || []);
      }

    } catch (e: any) {
      setError(`An error occurred during AI analysis: ${e.message}`);
      showModal(`An error occurred during AI analysis: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTextToSpeech = async (text: string | null) => {
    if (!text || isSpeaking) return;

    setIsSpeaking(true);
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      showModal("API key is not configured.");
      setIsSpeaking(false);
      return;
    }

    // The official @google/genai SDK does not yet support Text-to-Speech models.
    // We use a direct REST API call to a preview model as a workaround.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const payload = {
        model: "models/gemini-2.5-flash-preview-tts",
        contents: [{
            parts: [{ text: `Say cheerfully: ${text}` }]
        }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Puck" }
                }
            }
        },
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API call failed with status: ${response.status}. Response: ${errorText}`);
      }
      
      const result = await response.json();
      const part = result?.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;

      if (audioData && mimeType?.startsWith("audio/")) {
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        if (!sampleRateMatch) throw new Error("Sample rate not found in MIME type");
        
        const sampleRate = parseInt(sampleRateMatch[1], 10);
        const pcmData = base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData);
        const wavBlob = pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        const audio = new Audio(audioUrl);
        
        audio.play().catch(e => {
          showModal(`Failed to play audio: ${(e as Error).message}`);
        });

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
      } else {
        throw new Error("Failed to get audio data from the model.");
      }
    } catch (e: any) {
      showModal(`An error occurred during TTS generation: ${e.message}`);
      setIsSpeaking(false);
    }
  };

  const PolicyIcon: FC<{ status: Status, icon: React.ReactNode, label: string }> = ({ status, icon, label }) => {
    const statusClass = status === 'found' ? 'status-found' : status === 'pass' ? 'status-pass' : 'status-idle';
    return (
      <div className={`policy-icon ${statusClass}`}>
        {icon}
        <p className="policy-icon-label">{label}</p>
      </div>
    );
  };

  const getStatusIcon = (status: Status) => {
    if (status === 'found') return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.25 15.69l-1.3-1.63a1 1 0 0 0-.82-.35H5.87a1 1 0 0 0-.82.35L3.75 15.69a1 1 0 0 0 .15 1.48L12 21.68l8.1-4.51a1 1 0 0 0 .15-1.48zM12 8v4"/><path d="M12 16h.01"/></svg>;
    if (status === 'pass') return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.25 15.69l-1.3-1.63a1 1 0 0 0-.82-.35H5.87a1 1 0 0 0-.82.35L3.75 15.69a1 1 0 0 0 .15 1.48L12 21.68l8.1-4.51a1 1 0 0 0 .15-1.48zM9 12l2 2 4-4"/></svg>;
    return null;
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-content">
          <div className="app-header-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>
          </div>
          <div>
            <h1>Image Copyright Assistant</h1>
            <p>Analyze images for copyright and policy compliance with AI.</p>
          </div>
        </div>
      </header>

      {copyrightStatus !== null && (
        <div className="policy-status-grid">
          <PolicyIcon status={copyrightStatus} label="Copyright" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9a3.5 3.5 0 1 0 0 6h1a2 2 0 0 0 0-4h-1"/></svg>} />
          <PolicyIcon status={zedgeViolationStatus} label="Zedge" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13V7a4 4 0 0 0-2-3.46l-6-3.46-6 3.46A4 4 0 0 0 4 7v6l8 4 8-4Z"/><path d="m9 12 2 2 4-4"/></svg>} />
          <PolicyIcon status={womenPolicyStatus} label="Women" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>} />
          <PolicyIcon status={kidsViolationStatus} label="Kids" icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M17 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M12 18v2"/><path d="M12 18c-3.6 0-6.75-1.02-9-2.76.7-.22 1.4-.3 2-.3 1 0 2-.2 3-.5a2.4 2.4 0 0 1 2-2 2.4 2.4 0 0 1 2 2c1 .3 2 .5 3 .5s1.3.08 2 .3c2.25 1.74 5.4 2.76 9 2.76h-2"/></svg>} />
        </div>
      )}

      <main className="main-content">
        <div className="upload-area" onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
          <input type="file" onChange={handleImageUpload} accept="image/*" className="hidden" ref={fileInputRef} style={{display: 'none'}} />
          {imageUrl ? (<img src={imageUrl} alt="Uploaded" />) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="placeholder-icon"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7.3"/><path d="M10 14l-6 6"/><path d="m16 19 3-3 3 3"/><path d="M19 16v6"/><circle cx="9" cy="9" r="2"/></svg>
              <p className="placeholder-text-lg">Drag & Drop or Click to Upload</p>
              <p className="placeholder-text-sm">Supports JPEG, PNG, etc.</p>
            </>
          )}
        </div>

        <div className="analysis-results">
          <div className="analysis-controls">
            <button onClick={analyzeImageWithAI} className="btn btn-primary" disabled={loading || !imageFile}>
              {loading ? (
                <><svg className="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Analyzing...</>
              ) : (
                <><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 14.2l-5.7 4.5 1.5-6.7-5.7-4.5h6.6L12 2l2.4 5.5h6.6l-5.7 4.5 1.5 6.7z"/><path d="M22 22 19.5 19.5"/><path d="M18.8 13.4 22 10"/><path d="M13.4 18.8 10 22"/></svg>Analysis</>
              )}
            </button>
            {imageUrl && <button onClick={handleClear} className="btn btn-secondary"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>Clear</button>}
          </div>
          
          {copyrightStatus === 'pass' && zedgeViolationStatus === 'pass' && womenPolicyStatus === 'pass' && kidsViolationStatus === 'pass' && title && (
            <div className="metadata-card">
              <h3>Content Metadata</h3>
              <div className="metadata-field">
                <span className="label">Title:</span>
                <p className="value">{title}</p>
                <div className="metadata-actions">
                  <button onClick={() => handleTextToSpeech(title)} disabled={isSpeaking} className="metadata-btn tts-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>
                  <button onClick={() => copyToClipboard(title)} className="metadata-btn copy-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1-1.2-2.1-3.6-2-6s1-4 2-5"/></svg></button>
                </div>
              </div>
              <div className="metadata-field">
                <span className="label">Desc:</span>
                <p className="value">{imageDescription}</p>
                <div className="metadata-actions">
                  <button onClick={() => handleTextToSpeech(imageDescription)} disabled={isSpeaking} className="metadata-btn tts-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></button>
                  <button onClick={() => copyToClipboard(imageDescription!)} className="metadata-btn copy-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1-1.2-2.1-3.6-2-6s1-4 2-5"/></svg></button>
                </div>
              </div>
              <div className="metadata-field">
                <div style={{width: '100%'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '0.5rem'}}>
                    <span className="label">Tags:</span>
                    <button onClick={() => copyToClipboard(tags.join(', '))} className="metadata-btn copy-btn"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1-1.2-2.1-3.6-2-6s1-4 2-5"/></svg></button>
                  </div>
                  <div className="tags-container">
                    {tags.map((tag, index) => <span key={index} className="tag">#{tag}</span>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {copyrightStatus && <div className={`notification-card ${copyrightStatus === 'pass' ? 'pass-card' : 'found-card'}`}><h3>{getStatusIcon(copyrightStatus)}Copyright Status: {copyrightStatus === 'pass' ? 'Pass' : 'Violation'}</h3><p>{copyrightDescription}</p></div>}
          {zedgeViolationStatus && <div className={`notification-card ${zedgeViolationStatus === 'pass' ? 'pass-card' : 'found-card'}`}><h3>{getStatusIcon(zedgeViolationStatus)}Zedge Policy: {zedgeViolationStatus === 'pass' ? 'Pass' : 'Violation'}</h3><p>{zedgeViolationDescription}</p></div>}
          {womenPolicyStatus && <div className={`notification-card ${womenPolicyStatus === 'pass' ? 'pass-card' : 'found-card'}`}><h3>{getStatusIcon(womenPolicyStatus)}Women Policy: {womenPolicyStatus === 'pass' ? 'Pass' : 'Violation'}</h3><p>{womenPolicyDescription}</p></div>}
          {kidsViolationStatus && <div className={`notification-card ${kidsViolationStatus === 'pass' ? 'pass-card' : 'found-card'}`}><h3>{getStatusIcon(kidsViolationStatus)}Kids Policy: {kidsViolationStatus === 'pass' ? 'Pass' : 'Violation'}</h3><p>{kidsViolationDescription}</p></div>}
          {error && <div className="error-card"><p>{error}</p></div>}
        </div>
      </main>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="modal-icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <p>{modalContent}</p>
            <button onClick={closeModal} className="modal-btn">Got It</button>
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
