import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, timestamp_granularities } = await req.json();
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    console.log('Processing audio for transcription...');

    // Process audio in chunks
    const binaryAudio = processBase64Chunks(audio);
    console.log(`Audio size: ${binaryAudio.length} bytes`);
    
    // Prepare form data for Whisper API
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Send to OpenAI Whisper
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Transcription complete:', { 
      textLength: result.text?.length,
      segmentsCount: result.segments?.length,
      wordsCount: result.words?.length 
    });

    // Process segments into speaker-aware chunks
    // Note: Whisper doesn't do diarization, but we'll create segments based on pauses
    // and let the frontend assign speakers
    const speakerSegments = processSegmentsWithSpeakers(result.segments || []);

    return new Response(
      JSON.stringify({ 
        text: result.text,
        segments: result.segments,
        words: result.words,
        speakerSegments,
        language: result.language,
        duration: result.duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in transcribe-audio function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Process segments and assign initial speaker IDs based on pause detection
function processSegmentsWithSpeakers(segments: any[]) {
  const speakerSegments: any[] = [];
  let currentSpeakerId = 'speaker_1';
  let speakerCount = 1;
  let lastEndTime = 0;
  
  // Threshold for detecting speaker change (2 seconds pause)
  const PAUSE_THRESHOLD = 2.0;
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const pauseDuration = segment.start - lastEndTime;
    
    // If there's a significant pause, might be a new speaker
    if (pauseDuration > PAUSE_THRESHOLD && i > 0) {
      speakerCount++;
      currentSpeakerId = `speaker_${speakerCount}`;
    }
    
    speakerSegments.push({
      id: `seg_${i}`,
      speakerId: currentSpeakerId,
      speakerLabel: `Speaker ${speakerCount}`,
      segmentIndex: i,
      text: segment.text.trim(),
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
    });
    
    lastEndTime = segment.end;
  }
  
  return speakerSegments;
}
