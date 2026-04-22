// AI-powered tour place suggestion via Lovable AI Gateway
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { waypoints } = await req.json();
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 waypoints" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const wpStr = waypoints
      .map((w: [number, number], i: number) => `Stop ${i + 1}: ${w[0]}, ${w[1]}`)
      .join("\n");

    const systemPrompt = `You are a knowledgeable travel assistant. Given a list of GPS waypoints (latitude, longitude) along a planned tour route, suggest 5-8 popular tourist places, landmarks, food/rest stops, or hidden gems within roughly 20-50 km of the route.

For each suggestion, include:
- name (string)
- category (one of: "landmark", "food", "nature", "culture", "rest_stop")
- reason (1-2 sentence explanation of why it's worth visiting)
- distance_km (approximate distance from the route, integer)

Use your geographic knowledge of the region the coordinates are in. Be specific and accurate. If the coordinates are in India, use real Indian destinations.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Tour waypoints:\n${wpStr}\n\nSuggest places worth visiting along this route.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_places",
              description: "Return a list of suggested tourist places along the route.",
              parameters: {
                type: "object",
                properties: {
                  places: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        category: {
                          type: "string",
                          enum: ["landmark", "food", "nature", "culture", "rest_stop"],
                        },
                        reason: { type: "string" },
                        distance_km: { type: "number" },
                      },
                      required: ["name", "category", "reason", "distance_km"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["places"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_places" } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error:", response.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ places: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ places: args.places ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("tour-suggest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
