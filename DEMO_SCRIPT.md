# Mandate Mirror — 5-Minute Pitch & Live Demo Script
**Track 02: AI Risk Manager • Razorpay AI Buildathon 2026**

Total Duration: **5:00 minutes**  
Speaker Cadence: Deliberate, technical, confident. No fluff, no slides needed.

---

### Beat 1: The Problem (0:00 – 0:45)
*Stage direction: Keep your screen off or minimized on the terminal. Do NOT show the UI yet. Look directly at the judges.*

> "An AI purchasing agent is legitimate software, transacting through a real, authenticated API channel. Classic fraud detection asks: *'Is this really the account owner?'*
>
> In an agentic economy, that is the wrong question. The card is real. The credentials are real. The session is real.
>
> The right question is: **Is this specific transaction, in context, inside what was actually granted?**
>
> And that question requires memory of what the agent has already done across time — which a single-transaction gateway check structurally cannot have. If an agent has a ₹5,000 monthly limit and an ₹800 per-transaction cap, an adversary or a looping LLM can drain the entire wallet with eight ₹750 purchases. Every single transaction passes isolation checks. The violation only exists across the sequence."

---

### Beat 2: The Architecture & Authority Boundaries (0:45 – 1:15)
*Stage direction: Bring up the Architecture diagram or README on your screen.*

> "To solve this, we built **Mandate Mirror**. It maintains an atomic, concurrency-safe state machine per mandate, tracking cumulative spend trajectories against calendar-period buckets.
>
> Here is the architecture:
>
> 1. A **Buyer Agent** constructs purchase requests.
> 2. **Gate 1** executes deterministic bounds checks — HMAC signature, per-txn caps, allowed categories, and nonces. Tampered requests fast-fail with zero LLM overhead.
> 3. **Gate 2** is a read-only **Investigator Agent** powered by Gemini function-calling. It inspects historical trajectories and behavioral anomaly scores to advise on edge cases.
> 4. **Gate 3** is a deterministic **Guard Rechecker** enforcing zero-drift.
> 5. Finally, an **Atomic State Machine** commits spend through per-bucket async mutex locks before any downstream order can exist.
>
> Notice the authority boundary: **The LLM never touches money.** It gathers evidence and recommends. A deterministic function re-validates and executes."

---

### Beat 3: The Live Demo (1:15 – 4:15)
*Stage direction: Switch to the live browser dashboard at `http://localhost:5173`.*

#### Step 1: Autonomous Purchase & Live Reasoning Trace (1:15 – 2:00)
1. Navigate to the **Hero: Agent + Reasoning** tab. An active mandate is visible in the status bar.
2. In the Buyer Agent goal field, type:  
   `buy ₹2,000 of groceries from BigBasket`
3. Click **Shop with Mandate Mirror**.
4. *Stage direction: Say nothing. Fold your hands. Let the judges watch the Server-Sent Events stream live across the right panel tool-by-tool:*
   - `tool_call: get_state_snapshot`
   - `tool_call: check_category_conformance`
   - `recommendation: CLEAR`
   - `guard_rechecker: PASS`
   - `atomic_spend: COMMITTED`
5. Point at the green result banner and the order details:
   > "Notice this order ID: `order_test_...`. That is a real Razorpay test-mode order created post-CLEAR with the mandate and session IDs cryptographically bound into the metadata notes. Downstream rails are only touched after the state machine commits."

#### Step 2: Natural Language Mandate Issuance (2:00 – 2:40)
1. Switch to the **Issue Mandate** tab.
2. In the natural language intent prompt, enter:  
   `Allow GroqBot to spend up to ₹1,500 on groceries from Zepto this month, with a max of ₹500 per order.`
3. Click **Parse Mandate with AI**.
4. Point at the structured schema and yellow warning flags:
   > "The model extracts the structured schema: ₹500 per-txn cap, ₹1,500 cumulative cap, `grocery` category. Notice the warnings: the currency wasn't specified, so the parser defaulted to INR and flagged it for explicit human review.
   >
   > This confirmation step is not a UI nicety. The mandate cannot be HMAC-signed or registered into the engine without explicit principal confirmation."
5. Click **Confirm & Cryptographically Sign Mandate**.

#### Step 3: Concurrency Attack Demonstration (2:40 – 3:25)
1. Switch to the **Concurrency Attack** tab.
2. Point at the setup card:
   > "Here is the core engineering credibility beat. We have a mandate with a ₹5,000 cap. ₹4,800 has already been spent, leaving exactly ₹200.
   >
   > We are going to fire 20 simultaneous, asynchronous requests for ₹150 each across parallel threads. In a naive read-then-write system, all 20 see ₹200 remaining, double-spend, and drain ₹3,000. Watch what happens here."
3. Click **Launch 20-Thread Race Attack**.
4. Point at the result:
   > "Execution took 12 milliseconds: **Exactly 1 winner, 19 rejected.** The final account balance is ₹4,950 of ₹5,000. The cap is preserved mathematically through our per-bucket mutex."

#### Step 4: Tamper-Evident SHA-256 Hash Chain (3:25 – 4:15)
1. Switch to the **Hash Chain** tab.
2. Click **Verify Chain**.
   > "Every decision from Gate 1 to order creation is linked via SHA-256 parent hashes: `entry_hash = sha256(prev_hash + canonical_json)`. Notice: zero blockchain, pure cryptographic hash chain. Chain verification passes."
3. Click **Corrupt Entry (Demo Only)**.
4. Click **Verify Chain** again.
   > "An attacker tampered with a past record in memory. The verifier replays the chain from Genesis and instantly pinpoints: `tampered_at_index: 2` with `HASH_MISMATCH_DATA_TAMPERED`. The trail is tamper-evident."

---

### Beat 4: Evaluation & Honest Disclosure (4:15 – 5:00)
*Stage direction: Switch to the **Benchmarks** tab.*

> "Finally, evaluation. We report two separate claims and never conflate them.
>
> **Claim A is a correctness proof**: 100 adversarial sequences where every individual transaction was inside the per-transaction cap, but the sequence collectively breached the cumulative limit.
> - The stateless baseline caught **0%** of attacks.
> - Mandate Mirror caught **100%**. That is not a statistical claim; it's a deterministic proof of stateful sequence tracking.
>
> Now, let me address **Claim B** honestly before you ask:
> - Our behavioral anomaly layer scored **0.915 Precision, 0.860 Recall, and 0.887 F1**.
> - But Claim B is evaluated on synthetic session data we generated. The metrics look clean because synthetic patterns are more separable than messy real-world agent logs. At a 0.55 threshold, it introduces an estimated false-positive friction cost of ₹10,711 per 1,000 transactions.
> - We present Claim B as proof that our advisory scoring API and evaluation harness work end-to-end — not as a claim of production-grade anomaly accuracy, which would require real-world merchant session logs.
>
> Thank you."
