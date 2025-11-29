/**
 * Cloudflare Worker + Durable Object
 * Handles API requests and manages the AI Trading Agent state.
 */

// HTML Template for a simple embedded response if visited directly
const HTML_UI = `
<!DOCTYPE html>
<html>
<head><title>AI Agent Backend</title></head>
<body><h1>CF AI Financial Agent is Running</h1><p>Use the frontend interface to interact.</p></body>
</html>
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS for local development/frontend access
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Route: Root
    if (url.pathname === "/") {
      return new Response(HTML_UI, { headers: { "Content-Type": "text/html" } });
    }

    // Route: API Interaction
    if (url.pathname.startsWith("/api")) {
      // derive a unique ID for the agent (Singleton pattern for this demo)
      const id = env.STOCK_AGENT.idFromName("global-market-agent");
      const stub = env.STOCK_AGENT.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

/**
 * Durable Object: StockAgent
 * Maintains portfolio state and processes logic.
 */
export class StockAgent {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Default initial state
    this.portfolio = { cash: 100000, holdings: {} };
    this.history = [];
    
    // Load state from storage if it exists
    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("portfolio");
      let history = await this.state.storage.get("history");
      if (stored) this.portfolio = stored;
      if (history) this.history = history;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    if (url.pathname === "/api/reset") {
      this.portfolio = { cash: 100000, holdings: {} };
      this.history = [];
      await this.save();
      return new Response(JSON.stringify({ message: "Agent Reset" }), { headers: corsHeaders });
    }

    if (url.pathname === "/api/state") {
      return new Response(JSON.stringify({ 
        portfolio: this.portfolio, 
        history: this.history 
      }), { headers: corsHeaders });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await request.json();
      const userMessage = body.message;

      // AI Decision Logic
      const decision = await this.consultAI(userMessage);
      
      // Execute Trade based on AI Decision
      const executionResult = await this.executeTrade(decision);

      return new Response(JSON.stringify(executionResult), { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  async save() {
    await this.state.storage.put("portfolio", this.portfolio);
    await this.state.storage.put("history", this.history);
  }

  /**
   * Calls Workers AI (Llama 3.3) to analyze news.
   */
  async consultAI(newsText) {
    const systemPrompt = `
      You are an aggressive high-frequency trading AI agent with direct access to a brokerage account.
      Your goal is to maximize profit based on financial news.
      
      Current Portfolio Holdings: ${JSON.stringify(this.portfolio.holdings)}
      Current Cash: $${this.portfolio.cash}
      
      Instructions:
      1. Analyze the news headline.
      2. Extract Ticker (e.g. AAPL, TSLA). Use "NONE" if unclear.
      3. Decide: BUY, SELL, or HOLD.
      4. Determine quantity. Max 20% of cash for BUY. Check holdings for SELL.
      5. IMPORTANT: You must return ONLY raw JSON. No markdown formatting.
      
      JSON Format:
      {
        "ticker": "SYMBOL",
        "action": "BUY/SELL/HOLD",
        "quantity": 10,
        "price_estimate": 100,
        "reason": "Analysis here"
      }
    `;

    try {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `News Headline: "${newsText}"` }
      ];

      // Using Llama 3.3 (or 3.1 fallback depending on availability in region)
      // Note: Model IDs change, using a reliable recent Llama model
      const model = "@cf/meta/llama-3.1-70b-instruct"; 

      const response = await this.env.AI.run(model, {
        messages,
        max_tokens: 256,
        temperature: 0.1, // Low temperature for deterministic JSON
      });

      // Simple cleanup to ensure we get pure JSON if the model is chatty
      let cleanText = response.response.trim();
      // Remove markdown code blocks if present
      if (cleanText.startsWith("```json")) cleanText = cleanText.replace("```json", "").replace("```", "");
      else if (cleanText.startsWith("```")) cleanText = cleanText.replace("```", "").replace("```", "");

      return JSON.parse(cleanText);

    } catch (e) {
      console.error("AI Error", e);
      return { 
        action: "HOLD", 
        ticker: "ERROR", 
        reason: "Failed to parse AI response or AI error." 
      };
    }
  }

  /**
   * Updates the portfolio state based on the AI's decision.
   */
  async executeTrade(decision) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...decision,
      status: "EXECUTED"
    };

    if (decision.action === "BUY" && decision.ticker !== "NONE") {
      const cost = decision.quantity * decision.price_estimate;
      if (this.portfolio.cash >= cost) {
        this.portfolio.cash -= cost;
        this.portfolio.holdings[decision.ticker] = (this.portfolio.holdings[decision.ticker] || 0) + decision.quantity;
      } else {
        logEntry.status = "FAILED - INSUFFICIENT FUNDS";
      }
    } else if (decision.action === "SELL" && decision.ticker !== "NONE") {
      const currentQty = this.portfolio.holdings[decision.ticker] || 0;
      if (currentQty >= decision.quantity) {
        const gain = decision.quantity * decision.price_estimate;
        this.portfolio.cash += gain;
        this.portfolio.holdings[decision.ticker] -= decision.quantity;
        // Clean up zero holdings
        if (this.portfolio.holdings[decision.ticker] === 0) delete this.portfolio.holdings[decision.ticker];
      } else {
        logEntry.status = "FAILED - INSUFFICIENT HOLDINGS";
      }
    }

    this.history.unshift(logEntry);
    if (this.history.length > 50) this.history.pop(); // Keep log size manageable
    
    await this.save();
    
    return {
      agent_reply: decision.reason,
      trade_details: logEntry,
      new_portfolio: this.portfolio
    };
  }
}