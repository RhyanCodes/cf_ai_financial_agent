AI Prompts Documentation

This document outlines the prompt engineering strategies used in this project. It is divided into two sections:

System Prompts: The internal instructions that drive the Llama 3 AI agent.

Development Prompts: The high-level engineering directives used to scaffold and refine the application architecture.

1. Application System Prompts (The "Brain")

These are the instruction sets embedded within src/worker.js that define the agent's behavior and input/output constraints.

Context:
Passed to @cf/meta/llama-3.3-70b-instruct-fp8-fast within the StockAgent Durable Object.

The Financial Trader Persona:

"You are an aggressive high-frequency trading AI agent with direct access to a brokerage account. Your goal is to maximize profit based on financial news.

Current Portfolio Holdings: ${JSON.stringify(this.portfolio.holdings)}
Current Cash: $${this.portfolio.cash}

Instructions:

Analyze the news headline.

Extract Ticker (e.g. AAPL, TSLA). Use "NONE" if unclear.

Decide: BUY, SELL, or HOLD.

Determine quantity. Max 20% of cash for BUY. Check holdings for SELL.

IMPORTANT: You must return ONLY raw JSON. No markdown formatting.

JSON Format:
{
"ticker": "SYMBOL",
"action": "BUY/SELL/HOLD",
"quantity": 10,
"price_estimate": 100,
"reason": "Analysis here"
}"

2. Development Prompts (The Engineering Process)

These prompts reflect the architectural directives and debugging steps used to construct the application. 

"Scaffold a serverless financial trading application on the Cloudflare Developer Platform.
Requirements:

Compute: Cloudflare Workers for the API gateway.

State Management: Durable Objects to enforce strong consistency and prevent race conditions on the transactional ledger (cash/portfolio).

AI Inference: Workers AI (Llama 3 series) to analyze unstructured text (news) and output structured JSON decisions.

Frontend: A single-file, responsive HTML dashboard that interfaces with the Worker.

Constraint: The repository name must be cf_ai_financial_agent and include comprehensive documentation."

Phase 2: Environment-Agnostic Networking

"The frontend is encountering CORS and URL resolution errors when running in a local preview environment (blob/localhost) versus production. Implement a dynamic API_BASE resolution strategy in index.html that detects the window protocol and hostname to correctly target port 8787 locally or the relative path in production. Add a fallback 'Demo Mode' that simulates backend responses if the API is unreachable."

Phase 3: UI/UX Refinement

"The chat interface suffers from layout thrashing where the scroll position does not update immediately after a new message is appended. Refactor the addChatBubble function to use requestAnimationFrame. This will ensure the scrollTop calculation occurs after the browser's paint cycle, guaranteeing the view snaps to the latest message."
