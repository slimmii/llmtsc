---
format: 1920x1080
duration: 60s
message: "Forgot how to code? llmtsc compiles your vibes — anything that remotely looks like a TypeScript/React project actually runs."
arc: Pain (grayscale) → "There's got to be a better way!" → Reveal → Demo → Testimonials → But wait (Angular) → Price → CALL NOW
audience: developers (insider humor)
mode: collaborative
---

## Decisions

- **Message:** Forgot how to code? llmtsc compiles your vibes.
- **Audience / arc:** developers who get the joke. Classic infomercial arc: black-and-white suffering → the line → full-color miracle → proof → "but wait" → price → call now.
- **Format:** 16:9, ~60s, VO yes (ElevenLabs announcer + a second voice for testimonials), music yes (cheesy 90s infomercial bed, carved under VO), SFX yes. No captions track (VO + on-screen type carry it); keep fine print in bottom 12%.
- **The spine:** one persistent **code editor window**. It suffers in grayscale (01–02), is the thing that bursts into color (04), shows the in-memory repair (05), and returns as the `npm i -D llmtsc` terminal in the CTA (10). Every joke happens to or around that window.
- **Brand:** no llmtsc brand exists → infomercial look. Palette: deep royal blue `#1B2FB8` field, infomercial yellow `#FFD400` (accent/starbursts), hot red `#E8202A` (price slashes, "BUT WAIT"), off-white `#FFF8E7`; editor panels in a real dark editor theme `#1E1E2E`. "Before" segment: same layouts fully desaturated + grain + VHS wobble. Type: heavy condensed display (Anton) for shouts, Inter for body, JetBrains Mono for code.
- **Bans:** no tasteful minimalism (this is an infomercial — be loud), but no gradient soup either: two-color discipline yellow/red on blue. No real Angular logo (text-only "ANGULAR"). No fake UI pretending to be the real CLI output — terminal lines come from the README's real commands. No slideshow: every beat keeps the editor or the starburst on stage. No screensaver motion.
- **Held frame:** 03 — "There's GOT to be a better way!" — grayscale freeze, nothing moves for ~1s after the line.
- **Truthfulness:** code examples, commands, flags (`--no-llm`, `--show-fixes`), "source files never modified", caching, MIT license and the fine print are taken from the real README. Testimonials are obviously fake and labeled "Dramatization."

## Frame 1 — Former Vibe Coder

- scene: Grayscale editor, empty `App.tsx`, cursor blinks… types `fucntion App() {` — red squiggle
- duration: 7s
- poster: 5s
- transition_in: cut
- status: animated
- src: compositions/01-before.html
- blueprint: typewriter-reveal (rules: discrete-text-sequence)
- voiceover: "Are YOU a former vibe coder? Haven't typed a single line of code since twenty twenty-four?"
- audio: VHS tape hum; sad keyboard clicks
- why: Hook in the viewer's language — the shame of a blank editor.

Lower-left chyron in grayscale: "ACTUAL FOOTAGE OF A DEVELOPER, 2026". Constraint: no color at all.

## Frame 2 — Where Does The Semicolon Go

- scene: Grayscale editor fills with disasters: `improt Reakt from "reakt"`, `conole.log(users.lenght)`, `const const = cosnt`; error counter ticks 3 → 847; record scratch
- duration: 8s
- poster: 6s
- transition_in: cut
- status: animated
- src: compositions/02-pain.html
- blueprint: kinetic-type-beats (rules: discrete-text-sequence, counting-dynamic-scale)
- voiceover: "You dream of real development again. Just you and a keyboard. But you forgot. Where does the semicolon go? What is a const?"
- audio: record scratch at "But you forgot"
- why: Escalate the pain with real-looking broken code.

## Frame 3 — There's Got To Be A Better Way

- scene: Freeze, grayscale; giant "THERE'S GOT TO BE A BETTER WAY!" slams over the dimmed editor; held
- duration: 3s
- poster: 2s
- transition_in: cut
- status: animated
- src: compositions/03-better-way.html
- blueprint: kinetic-type-beats (held frame)
- voiceover: "There's got to be a better way!"
- why: The genre's turning point; held frame.

## Frame 4 — Introducing llmtsc

- scene: Color EXPLODES: blue field, rotating yellow starburst, chrome "llmtsc" lockup, sub "The TypeScript compiler for people who forgot TypeScript."
- duration: 6s
- poster: 4s
- transition_in: flash-to-white
- status: animated
- src: compositions/04-reveal.html
- blueprint: logo-assemble-lockup
- voiceover: "Introducing llmtsc! The TypeScript compiler for people who forgot TypeScript!"
- audio: whoosh + choir "aaah" + music bed starts
- why: Value claim lands by beat 4 — the product is the answer.

## Frame 5 — It Actually Runs

- scene: Split: left "WHAT YOU WROTE" (broken lines from README), right "WHAT GETS COMPILED" (repaired); diffs highlight in yellow; below, terminal `npx llmtsc` → `✓ 5 errors repaired in memory` → app renders "Hello, Turing"
- duration: 9s
- poster: 7s
- transition_in: push-left
- status: animated
- src: compositions/05-demo.html
- blueprint: comparison-split (rules: discrete-text-sequence)
- voiceover: "Just write anything that remotely looks like a React project. llmtsc sends your mistakes to an AI, fixes them in memory, and compiles the result. And it actually runs!"
- audio: ding on each repaired line; crowd "ooooh" at "actually runs"
- why: Evidence for the claim — the real mechanism, from the README example.

## Frame 6 — Your Shame Stays On Disk

- scene: Editor still shows the broken code on disk; stamped badge "SOURCE FILES NEVER MODIFIED!" + sub "Your shame stays exactly where you left it."
- duration: 4s
- poster: 3s
- transition_in: cut
- status: animated
- src: compositions/06-shame.html
- blueprint: titlecard-reveal
- voiceover: "Your source files are never modified. Your shame stays exactly where you left it."
- audio: rubber-stamp thunk
- why: Turns a real feature into the joke.

## Frame 7 — Testimonials

- scene: Two quote cards w/ 5 stars and "Dramatization" tag: "I wrote improt Reakt and it shipped to production!" — Dave, Senior Prompt Engineer; "My code has 400 type errors. My build has zero." — Priya, 10x Vibe Architect
- duration: 7s
- poster: 5s
- transition_in: push-left
- status: animated
- src: compositions/07-testimonials.html
- blueprint: grid-card-assemble (rules: stat-bars-and-fills star wipe)
- voiceover: (testimonial voice) "I wrote 'improt Reakt'… and it shipped to production!" / (second) "My code has four hundred type errors. My build has zero."
- why: Social proof, absurd.

## Frame 8 — But Wait, There's More

- scene: Red "BUT WAIT… THERE'S MORE!" slam → card "IT WORKS WITH ANGULAR TOO!" → card deflates/droops, sub "(nobody uses Angular)" → "…anyway."
- duration: 6s
- poster: 4.5s
- transition_in: cut
- status: animated
- src: compositions/08-angular.html
- blueprint: kinetic-type-beats
- voiceover: "But wait, there's more! It works with Angular too! … Anyway."
- audio: sad trombone under the deflate
- why: The user's own joke; the genre's "but wait".

## Frame 9 — How Much Would You Pay

- scene: Price stack: "$999" slashed, "$99" slashed, "$9.99" slashed → "FREE! (MIT)" in a starburst; small "*bring your own API key. Answers are cached, so you only pay for files that changed."
- duration: 5s
- poster: 4s
- transition_in: push-left
- status: animated
- src: compositions/09-price.html
- blueprint: kinetic-type-beats (rules: counting-dynamic-scale)
- voiceover: "How much would you pay? Don't answer. It's free! Just bring your own API key."
- audio: cha-ching on FREE
- why: Genre price beat, true facts (MIT, caching).

## Frame 10 — Call Now

- scene: Giant terminal panel `$ npm i -D llmtsc` (the spine editor returns as a terminal), flashing "CALL NOW" starburst, "Operators are hallucinating standing by"; fine-print crawl along the bottom from the README caveats
- duration: 5s
- poster: 3.5s
- transition_in: zoom-through
- status: animated
- src: compositions/10-cta.html
- blueprint: prompt-type-submit-generate (install-command CTA end card)
- voiceover: "Install now! Operators are hallucinating standing by!"
- audio: music sting to end
- why: The ask — real install command.

Fine print: "llmtsc does not teach you to code. An LLM's repair is a guess about what you meant. Your source code is sent to the configured LLM provider. Fix the real source when you get the chance (you won't). Side effects may include confidence, production incidents, and typing --no-llm in moments of weakness."
