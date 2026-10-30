# Demo post drafts for X

Record your screen following HACKATHON.md Part 1, steps 4 to 7 (about 45 seconds). Attach the video. Replace <repo-link>.

## Main post

Built Allowance for the @NEARProtocol AI and money hackathon.

An AI agent with a budget, not a blank check.

You write: "Pay my bills, keep it half USDC half NEAR, never spend over $30 a day, ask me over $8."

It pays across Ethereum, Arbitrum and Solana via NEAR Intents. Big bills wait for your tap. A hostile invoice tries to hijack it and gets blocked.

Try it in 2 min, no keys: <repo-link>

## Thread

2/ The trick: the AI only proposes. A ~100-line deterministic rulebook decides. The model never sees a payment address, only payee names from your allowlist. Approval can never lift a hard cap.

3/ Paying a bill is an EXACT_OUTPUT quote on the 1-Click API: "deliver exactly 7.00 USDC to this Arbitrum address." The treasury sells whatever it holds to make it happen. No bridges to babysit.

4/ Planning runs on NEAR AI Cloud (private, verifiable inference). Chain Signatures gives the agent one set of keys for many chains.

5/ Lesson learned: I wanted a function-call key to cap spending, but those keys can't attach deposits, and ft_transfer and MPC sign both need 1 yoctoNEAR. So the agent runs as a sub-account holding only its budget.

6/ Repo, tests, and "do X, see Y" steps: <repo-link>
