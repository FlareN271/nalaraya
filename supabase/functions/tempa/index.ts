// Nalaraya: Edge Function "tempa"
// Mengubah materi menjadi kartu hafalan memakai API AI milikmu.
// API key hanya disimpan di Supabase secrets, tidak pernah dikirim ke browser.
//
// Secrets yang dibaca (atur dengan `supabase secrets set NAMA=nilai`):
//   OWNER_EMAIL        wajib: hanya email ini yang boleh menempa
//   ANTHROPIC_API_KEY  pilih salah satu penyedia AI
//   ANTHROPIC_MODEL    opsional, bawaan: claude-haiku-5-5
//   GEMINI_API_KEY     alternatif jika tidak memakai Anthropic
//   GEMINI_MODEL       wajib jika memakai Gemini (cek nama model terbaru di Google AI Studio)
//   ALLOWED_ORIGIN     opsional, mis. https://username.github.io
// SUPABASE_URL dan SUPABASE_ANON_KEY sudah disediakan otomatis oleh Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Gunakan POST." }, 405);

  try {
    // 1. Pastikan yang memanggil adalah pemilik yang sudah masuk.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: "Masuk dulu sebagai pemilik." }, 401);
    const owner = (Deno.env.get("OWNER_EMAIL") ?? "").toLowerCase();
    if (!owner) return json({ error: "Secret OWNER_EMAIL belum diatur." }, 500);
    if ((user.email ?? "").toLowerCase() !== owner) {
      return json({ error: "Meja Tempa hanya untuk pemilik." }, 403);
    }

    // 2. Periksa bahan.
    const body = await req.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (prompt.length < 50 || prompt.length > 60000) {
      return json({ error: "Bahan terlalu pendek atau terlalu panjang." }, 400);
    }

    // 3. Minta AI menempa kartu.
    let text = "";
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (anthropicKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: "AI menolak permintaan: " + (d?.error?.message ?? r.status) }, 502);
      text = (d.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");
    } else if (geminiKey) {
      const model = Deno.env.get("GEMINI_MODEL");
      if (!model) return json({ error: "Secret GEMINI_MODEL belum diatur." }, 500);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
      const d = await r.json();
      if (!r.ok) return json({ error: "AI menolak permintaan: " + (d?.error?.message ?? r.status) }, 502);
      text = (d.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("");
    } else {
      return json({ error: "Belum ada API key AI di Supabase secrets." }, 500);
    }

    // 4. Ambil daftar kartu dari jawaban.
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return json({ error: "Jawaban AI tidak berisi daftar kartu. Coba lagi." }, 502);
    const cards = JSON.parse(match[0]);
    if (!Array.isArray(cards)) return json({ error: "Format kartu tidak dikenali." }, 502);
    return json({ cards });
  } catch (e) {
    return json({ error: "Penempaan gagal: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
