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

async function uploadVideoToGemini(videoUrl: string, geminiKey: string): Promise<string> {
  try {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const contentType = videoResponse.headers.get("content-type") || "video/mp4";
    const fileSize = videoBuffer.byteLength;

    console.log(`Uploading video (${fileSize} bytes) to Gemini Files API...`);

    const initResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(fileSize),
          "X-Goog-Upload-Header-Content-Type": contentType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { display_name: "cricket_video" } }),
      }
    );

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`Failed to initiate upload: ${errText.substring(0, 200)}`);
    }

    const uploadUrl = initResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("No upload URL returned from Gemini Files API");
    }

    console.log("Uploading video data...");

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(fileSize),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: videoBuffer,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload video: ${errText.substring(0, 200)}`);
    }

    let fileData;
    try {
      fileData = await uploadResponse.json();
    } catch {
      throw new Error("Invalid JSON response from upload finalize");
    }

    const fileUri = fileData.file?.uri;
    if (!fileUri) {
      throw new Error("No file URI returned after upload");
    }

    console.log(`File uploaded: ${fileUri}`);
    console.log("Waiting for video processing...");

    // Poll until file is ACTIVE
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileData.file.name}?key=${geminiKey}`
      );

      if (statusRes.ok) {
        const status = await statusRes.json();
        console.log(`File status: ${status.state}`);

        if (status.state === "ACTIVE") {
          console.log("Video ready for analysis");
          return fileUri;
        }
        if (status.state === "FAILED") {
          throw new Error("Video processing failed in Gemini Files API");
        }
      }
    }

    throw new Error("Timed out waiting for video to be ready in Gemini");
  } catch (error) {
    console.error("Video upload error:", error);
    throw error;
  }
}

async function analyzeWithGemini(
  videoUrl: string,
  userPrompt: string
): Promise<Highlight[]> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

  const defaultTag = inferTagFromPrompt(userPrompt);

  const fileUri = await uploadVideoToGemini(videoUrl, geminiKey);

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

  console.log("Calling Gemini API for analysis...");

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
                file_data: {
                  mime_type: "video/mp4",
                  file_uri: fileUri,
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
    console.error("Gemini API error response:", errText.substring(0, 500));
    throw new Error(`Gemini API error: ${errText.substring(0, 200)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON");
    throw new Error("Invalid JSON response from Gemini API");
  }

  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    console.warn("No text content in Gemini response");
    return [];
  }

  console.log("Gemini response received, parsing JSON...");

  const jsonMatch = textContent.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn("Could not extract JSON array from response:", textContent.substring(0, 200));
    return [];
  }

  let highlights;
  try {
    highlights = JSON.parse(jsonMatch[0]) as Highlight[];
  } catch (e) {
    console.error("Failed to parse extracted JSON:", e);
    return [];
  }

  // Ensure every highlight has a tag
  return highlights.map((h) => ({
    ...h,
    tag: h.tag || defaultTag,
  }));
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

    console.log(`Starting analysis for prompt: "${userPrompt}"`);

    const highlights = await analyzeWithGemini(videoUrl, userPrompt);

    console.log(`Analysis complete: found ${highlights.length} highlights`);

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
