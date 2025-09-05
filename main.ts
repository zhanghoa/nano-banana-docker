// --- START OF FILE main.ts ---

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// --- 辅助函数：生成错误 JSON 响应 ---
function createJsonErrorResponse(message: string, statusCode = 500) { 
    return new Response(JSON.stringify({ error: { message, code: statusCode } }), { 
        status: statusCode, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
}

// --- 核心业务逻辑：调用 OpenRouter ---
async function callOpenRouter(
    messages: any[], 
    apiKey: string, 
    model = "google/gemini-2.5-flash-image-preview" // 设置默认模型
): Promise<{ type: 'image' | 'text'; content: string }> {
    if (!apiKey) { throw new Error("callOpenRouter received an empty apiKey."); }
    
    const openrouterPayload = { model: model, messages };
    console.log("Sending payload to OpenRouter:", JSON.stringify(openrouterPayload, null, 2));
    
    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(openrouterPayload)
    });
    
    if (!apiResponse.ok) {
        const errorBody = await apiResponse.text();
        throw new Error(`OpenRouter API error: ${apiResponse.status} - ${errorBody}`);
    }
    
    const responseData = await apiResponse.json();
    console.log("OpenRouter Response:", JSON.stringify(responseData, null, 2));
    
    const message = responseData.choices?.[0]?.message;
    if (message?.images?.[0]?.image_url?.url) { return { type: 'image', content: message.images[0].image_url.url }; }
    if (typeof message?.content === 'string' && message.content.startsWith('data:image/')) { return { type: 'image', content: message.content }; }
    if (typeof message?.content === 'string' && message.content.trim() !== '') { return { type: 'text', content: message.content }; }
    
    return { type: 'text', content: "[模型没有返回有效内容]" };
}

// --- 主服务逻辑 ---
serve(async (req) => {
    const pathname = new URL(req.url).pathname;
    
    if (req.method === 'OPTIONS') { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key" } }); }

    if (pathname === "/api/key-status") {
        const isSet = !!Deno.env.get("OPENROUTER_API_KEY");
        return new Response(JSON.stringify({ isSet }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }

    // --- (此处可以保留或删除 Gemini Studio 兼容路由，为了完整性，暂时保留) ---
    if (pathname.includes(":streamGenerateContent") || pathname.includes(":generateContent")) {
        return createJsonErrorResponse("Gemini Studio compatible endpoints are not fully implemented in this version.", 501);
    }
    
    if (pathname === "/generate") {
        try {
            const { prompt, images, apikey, model } = await req.json();
            const openrouterApiKey = apikey || Deno.env.get("OPENROUTER_API_KEY");
            if (!openrouterApiKey) { return createJsonErrorResponse("OpenRouter API key is not set.", 500) }
            if (!prompt || !images || !images.length) { return createJsonErrorResponse("Prompt and images are required.", 400); }
            
            const webUiMessages = [ { role: "user", content: [ {type: "text", text: prompt}, ...images.map((img:string) => ({type: "image_url", image_url: {url: img}})) ] } ];
            
            const result = await callOpenRouter(webUiMessages, openrouterApiKey, model);
    
            if (result.type === 'image') {
                return new Response(JSON.stringify({ imageUrl: result.content }), { headers: { "Content-Type": "application/json" } });
            } else {
                console.log(`Model returned text, signaling retry. Content: "${result.content}"`);
                return new Response(JSON.stringify({ retry: true, message: `模型返回了文本: ${result.content}` }), { status: 200, headers: { "Content-Type": "application/json" } });
            }
            
        } catch (error) {
            console.error("Error handling /generate request:", error);
            return createJsonErrorResponse(error.message, 500);
        }
    }

    return serveDir(req, { fsRoot: "static", urlRoot: "", showDirListing: true, enableCors: true });
});

// --- END OF FILE main.ts ---
