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
}

async function extractFramesFromVideo(videoUrl: string): Promise<string[]> {
  try {
    const response = await fetch(videoUrl, { method: "HEAD" });
    const contentLength = response.headers.get("content-length");

    if (!contentLength) {
      throw new Error("Could not determine video duration");
    }

    return [];
  } catch (error) {
    console.error("Frame extraction error:", error);
    return [];
  }
}

async function analyzeWithGemini(
  videoUrl: string,
  userPrompt: string
): Promise<Highlight[]> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const analysisPrompt = `You are a cricket analysis expert. Analyze the following cricket video and identify moments matching this criteria: "${userPrompt}"

For each moment found, provide:
1. Start time (in seconds)
2. End time (in seconds)
3. What happened (brief description)
4. Confidence score (0-1)

Look for:
- Ball trajectory and movement
- Umpire signals (arm up for wicket, pointing for boundary)
- Player reactions and positioning
- Ground markings and boundaries

Return a JSON array with this structure:
[
  {
    "startTime": number,
    "endTime": number,
    "description": string,
    "confidence": number
  }
]

Video URL: ${videoUrl}
Criteria to find: ${userPrompt}

Be precise with timings and only include confident matches.`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: analysisPrompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          maxOutputTokens: 2000,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json();
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error("No response from Gemini");
    }

    const jsonMatch = textContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("Could not extract JSON from Gemini response");
      return [];
    }

    const highlights = JSON.parse(jsonMatch[0]) as Highlight[];
    return highlights;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    throw error;
  }
}

async function updateAnalysisStatus(
  supabaseUrl: string,
  supabaseKey: string,
  videoUrl: string,
  userPrompt: string,
  status: string,
  highlights?: Highlight[],
  errorMessage?: string
) {
  const { createClient } = await import("npm:@supabase/supabase-js@2.38.4");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const updateData: Record<string, unknown> = { processing_status: status };
  if (highlights) {
    updateData.highlights = highlights;
  }
  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  await supabase
    .from("ai_analysis_results")
    .update(updateData)
    .eq("video_url", videoUrl)
    .eq("user_prompt", userPrompt);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { videoUrl, userPrompt } = (await req.json()) as AnalysisRequest;

    if (!videoUrl || !userPrompt) {
      return new Response(
        JSON.stringify({ error: "videoUrl and userPrompt are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    await updateAnalysisStatus(
      supabaseUrl,
      supabaseKey,
      videoUrl,
      userPrompt,
      "processing"
    );

    const highlights = await analyzeWithGemini(videoUrl, userPrompt);

    await updateAnalysisStatus(
      supabaseUrl,
      supabaseKey,
      videoUrl,
      userPrompt,
      "completed",
      highlights
    );

    return new Response(
      JSON.stringify({
        success: true,
        highlights,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: "Analysis failed",
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
