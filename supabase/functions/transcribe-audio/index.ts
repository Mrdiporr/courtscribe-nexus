import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key',
  'Access-Control-Max-Age': '86400',
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;        // 25 MB decoded audio
const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 64;
const MAX_REQUEST_BYTES = MAX_BASE64_CHARS + 1024;
const ALLOWED_LANGUAGES = new Set(['en', 'fr', 'es', 'pt', 'ar', 'auto']);

// In-memory token bucket per user. Resets when the function cold-starts; deliberately
// conservative so concurrent abuse is throttled even between cold starts.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6; // max requests per minute per user
const rateBuckets = new Map<string, number[]>();

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isRateLimited(userId: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const window = (rateBuckets.get(userId) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (window.length >= RATE_LIMIT) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - window[0])) / 1000);
    rateBuckets.set(userId, window);
    return { limited: true, retryAfter: Math.max(retryAfter, 1) };
  }
  window.push(now);
  rateBuckets.set(userId, window);
  return { limited: false, retryAfter: 0 };
}

const BodySchema = z.object({
  audio: z.string()
    .min(64, 'audio too short')
    .max(MAX_BASE64_CHARS, 'audio too large'),
  language: z.string().max(8).optional(),
  mimeType: z.string().max(64).optional(),
});

function decodeBase64(base64: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  const chunkSize = 32768;
  for (let i = 0; i < base64.length; i += chunkSize) {
    const slice = base64.slice(i, i + chunkSize);
    const bin = atob(slice);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
    chunks.push(bytes);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function processSegmentsWithSpeakers(segments: any[]) {
  const out: any[] = [];
  let currentSpeakerId = 'speaker_1';
  let count = 1;
  let lastEnd = 0;
  const PAUSE = 2.0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i > 0 && seg.start - lastEnd > PAUSE) {
      count++;
      currentSpeakerId = `speaker_${count}`;
    }
    out.push({
      id: `seg_${i}`,
      speakerId: currentSpeakerId,
      speakerLabel: `Speaker ${count}`,
      segmentIndex: i,
      text: (seg.text ?? '').trim(),
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(seg.end * 1000),
    });
    lastEnd = seg.end;
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ---------- Auth ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  // ---------- Rate limit ----------
  const rl = isRateLimited(userId);
  if (rl.limited) {
    return new Response(JSON.stringify({ error: 'Too many requests', retryAfter: rl.retryAfter }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) },
    });
  }

  // ---------- Content-Length guard (cheap reject before reading body) ----------
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'Payload too large' }, 413);
  }

  // ---------- Parse body ----------
  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { audio, language } = parsed.data;
  if (language && !ALLOWED_LANGUAGES.has(language)) {
    return jsonResponse({ error: 'Unsupported language' }, 400);
  }

  // ---------- Decode + size guard ----------
  let binary: Uint8Array;
  try { binary = decodeBase64(audio); } catch { return jsonResponse({ error: 'Invalid base64 audio' }, 400); }
  if (binary.length > MAX_AUDIO_BYTES) return jsonResponse({ error: 'Audio file too large (max 25MB)' }, 413);
  if (binary.length < 1024) return jsonResponse({ error: 'Audio too short' }, 400);

  const audioHash = await sha256Hex(binary);

  // ---------- Idempotency ----------
  // Client may pass x-idempotency-key; we always also key by audio sha256 so accidental
  // duplicate submissions of the same file are coalesced even without an explicit key.
  const headerKey = req.headers.get('x-idempotency-key')?.slice(0, 128) ?? null;
  const idempotencyKey = (headerKey || audioHash);

  const { data: existing } = await supabase
    .from('transcribe_requests')
    .select('id, status, response, error, created_at')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'completed' && existing.response) {
      return jsonResponse({ ...existing.response, idempotent: true }, 200);
    }
    if (existing.status === 'pending') {
      // Another in-flight request for the same payload; ask client to retry.
      return new Response(JSON.stringify({ error: 'Request already in progress', retryAfter: 5 }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '5' },
      });
    }
    if (existing.status === 'failed') {
      // Allow retry by reusing the row.
      await supabase.from('transcribe_requests')
        .update({ status: 'pending', error: null, response: null })
        .eq('id', existing.id);
    }
  } else {
    const { error: insErr } = await supabase.from('transcribe_requests').insert({
      user_id: userId,
      idempotency_key: idempotencyKey,
      audio_sha256: audioHash,
      status: 'pending',
    });
    if (insErr) {
      console.error('idempotency insert failed', insErr);
      // Soft-fail: continue without dedupe rather than blocking the user.
    }
  }

  // ---------- Call OpenAI ----------
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured');
    await supabase.from('transcribe_requests')
      .update({ status: 'failed', error: 'service unavailable' })
      .eq('user_id', userId).eq('idempotency_key', idempotencyKey);
    return jsonResponse({ error: 'Transcription service unavailable.' }, 503);
  }

  const formData = new FormData();
  formData.append('file', new Blob([binary], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');
  if (language && language !== 'auto') formData.append('language', language);

  let openaiResp: Response;
  try {
    openaiResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
  } catch (e) {
    console.error('OpenAI network error', e);
    await supabase.from('transcribe_requests')
      .update({ status: 'failed', error: 'upstream network error' })
      .eq('user_id', userId).eq('idempotency_key', idempotencyKey);
    return jsonResponse({ error: 'Transcription service temporarily unavailable.' }, 502);
  }

  if (!openaiResp.ok) {
    const errText = await openaiResp.text().catch(() => '');
    console.error('OpenAI API error', { status: openaiResp.status, error: errText, user: userId });
    await supabase.from('transcribe_requests')
      .update({ status: 'failed', error: `upstream ${openaiResp.status}` })
      .eq('user_id', userId).eq('idempotency_key', idempotencyKey);
    return jsonResponse({ error: 'Transcription service temporarily unavailable. Please try again later.' }, 502);
  }

  const result = await openaiResp.json();
  const speakerSegments = processSegmentsWithSpeakers(result.segments || []);
  const response = {
    text: result.text,
    segments: result.segments,
    words: result.words,
    speakerSegments,
    language: result.language,
    duration: result.duration,
  };

  await supabase.from('transcribe_requests').update({
    status: 'completed',
    response,
    error: null,
  }).eq('user_id', userId).eq('idempotency_key', idempotencyKey);

  return jsonResponse(response, 200);
});
