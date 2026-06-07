import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalysisRequest {
  videoUrl: string;
  userPrompt: string;
}

interface Highlight {
  startTime: number;
  endTime: number;
  description: string;
  confidence: number;
  tag: string;
}

function inferTagFromPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("six") || lower.includes("sixes")) return "Six";
  if (lower.includes("wicket") || lower.includes("wickets") || lower.includes("out") || lower.includes("bowled") || lower.includes("lbw")) return "Wicket";
  if (lower.includes("catch") || lower.includes("caught")) return "Catch";
  if (lower.includes("four") || lower.includes("boundary") || lower.includes("boundaries")) return "Four";
  return "Custom";
}

async function analyzeWithGemini(
  videoUrl: string,
  userPrompt: string
): Promise<Highlight[]> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

  const defaultTag = inferTagFromPrompt(userPrompt);

  const analysisPrompt = `You are a cricket analysis expert. Watch this cricket video and identify all moments matching: "${userPrompt}"

For each matching moment return a JSON object with:
- startTime: number (seconds, when the moment begins)
- endTime: number (seconds, when the moment ends, at least 3 seconds after startTime)
- description: string (brief description of what happened)
- confidence: number (0-1, how confident you are this matches)
- tag: string (one of: "Six", "Wicket", "Catch", "Four", "Custom")

Return ONLY a raw JSON array — no markdown, no explanation, just the array:
[
  { "startTime": 12.5, "endTime": 17.0, "description": "...", "confidence": 0.95, "tag": "Six" }
]

If no matching moments are found, return an empty array: []

Criteria: ${userPrompt}`;

  console.log("Calling Gemini API for video analysis...");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "video/mp4",
                  data: await fetchVideoAsBase64(videoUrl),
                },
              },
              { text: analysisPrompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 4000,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini API error:", errText.substring(0, 500));
    throw new Error(`Gemini API error: ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error("Failed to parse Gemini response");
    throw new Error("Invalid response from Gemini API");
  }

  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    console.warn("No text response from Gemini");
    return [];
  }

  console.log("Parsing response...");

  const jsonMatch = textContent.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn("Could not find JSON in response");
    return [];
  }

  let highlights;
  try {
    highlights = JSON.parse(jsonMatch[0]) as Highlight[];
  } catch (e) {
    console.error("Failed to parse JSON from response");
    return [];
  }

  return highlights.map((h) => ({
    ...h,
    tag: h.tag || defaultTag,
  }));
}

async function fetchVideoAsBase64(url: string): Promise<string> {
  console.log("Downloading video...");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { videoUrl, userPrompt } = (await req.json()) as AnalysisRequest;

    if (!videoUrl || !userPrompt) {
      return new Response(
        JSON.stringify({ error: "videoUrl and userPrompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing: "${userPrompt}"`);

    const highlights = await analyzeWithGemini(videoUrl, userPrompt);

    console.log(`Found ${highlights.length} highlights`);

    return new Response(
      JSON.stringify({ success: true, highlights }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Analysis failed", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
