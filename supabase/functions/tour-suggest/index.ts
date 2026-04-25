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

    const start = waypoints[0] as [number, number];
    const destination = waypoints[waypoints.length - 1] as [number, number];
    const wpStr = waypoints
      .map((w: [number, number], i: number) => {
        const tag =
          i === 0 ? "START" : i === waypoints.length - 1 ? "DESTINATION" : `STOP ${i}`;
        return `${tag}: ${w[0].toFixed(5)}, ${w[1].toFixed(5)}`;
      })
      .join("\n");

    const systemPrompt = `You are an expert local travel guide with deep geographic knowledge. Given a planned tour route (start, optional stops, destination) as GPS coordinates, suggest 6-10 REAL, verifiable tourist places worth visiting near the route — strongly preferring places near the DESTINATION and then along the route corridor.

STRICT RULES:
- Suggest ONLY tourist-relevant places: temples, forts, palaces, museums, monuments, heritage sites, beaches, hills, viewpoints, lakes, waterfalls, parks, gardens, national parks, scenic spots, archaeological sites.
- DO NOT suggest restaurants, cafes, hotels, resorts, homestays, shops, malls, markets, bars, bakeries, pharmacies, offices, parking, transport stands, or generic businesses.
- Use REAL, well-known places that actually exist near those coordinates. Use accurate names.
- Prioritize places within 20 km of the DESTINATION first, then within 30 km of the route corridor.
- Provide accurate latitude/longitude (you must know the real coordinates of the place).
- Calculate distance_km from the DESTINATION coordinate, not from the start.
- The reason must be a short “why visit” reason focused on sightseeing value.
- If you are not confident a place is real and nearby, omit it.

For each suggestion include: name, category, reason (1 short sentence), lat, lon, distance_km from destination.`;

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
          {
            role: "user",
            content: `Planned route:\n${wpStr}\n\nDESTINATION: ${destination[0]}, ${destination[1]}\nSTART: ${start[0]}, ${start[1]}\n\nSearch your geographic knowledge for real tourist attractions near the destination and route points. Return only sightseeing places worth visiting, never food/cafes/hotels/shops.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_places",
              description: "Return tourist places near the planned route.",
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
                          enum: ["landmark", "nature", "culture", "heritage", "viewpoint"],
                        },
                        reason: { type: "string" },
                        lat: { type: "number" },
                        lon: { type: "number" },
                        distance_km: { type: "number" },
                      },
                      required: ["name", "category", "reason", "lat", "lon", "distance_km"],
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
