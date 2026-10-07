# YouTube upload sheet

## 1. Main video — `llmtsc-infomercial-youtube.mp4`

1920×1080 · 1:23 · H.264/AAC · −14.7 LUFS (already at YouTube's target, no normalization needed)

**Title**

> Forgot How to Code? This Compiler Fixes Your Vibes (llmtsc Infomercial)

**Description**

```
Are YOU a former vibe coder? Haven't typed a single line of code since 2024?
There's GOT to be a better way!

Introducing llmtsc: the TypeScript compiler for people who forgot TypeScript.
Write anything that remotely looks like a React project. llmtsc sends your type errors and typos to an LLM, repairs them in memory, and compiles the result. Your source files are never modified. Your shame stays exactly where you left it.

Works with tsc, Vite, webpack, Next.js, Jest, ts-node… and Angular too (nobody uses Angular).

★ GitHub: https://github.com/slimmii/llmtsc
$ npm i -D llmtsc

0:00 Forgot how to code?
0:19 Introducing llmtsc
0:38 Real customers*
0:53 But wait, there's more
1:05 Call now

*Dramatization. Testimonials are not real. llmtsc does not teach you to code. An LLM's repair is a guess about what you meant. Your source code is sent to the configured LLM provider. Fix the real source when you get the chance (you won't).

#typescript #react #vibecoding #programming #webdev
```

**Tags**

`llmtsc, typescript, typescript compiler, react, vibe coding, ai coding, llm, infomercial, programming humor, developer humor, angular, vite, webpack, nextjs, javascript`

**Thumbnail:** `thumbnail.jpg` (1280×720, 223 KB). Source: `thumbnail.html`.

**Subtitles:** upload `llmtsc-infomercial.en.srt` under Subtitles → English → Upload file → With timing.

**End screen** (YouTube Studio → Editor → End screen, from 1:11.4 to 1:23.4). The last 12 seconds have two dashed slots for it:
- **Video element** ("Best for viewer" or the Short): place it over the dashed 16:9 box on the left, labeled ▶ WATCH NEXT.
- **Subscribe element:** place it over the dashed circle on the right, labeled SUBSCRIBE.

**Settings:** Category: Science & Technology · Altered or synthetic content: **Yes** (AI-generated voices) · Made for kids: No.

## 2. Short — `llmtsc-short.mp4`

1080×1920 · 0:51 · H.264/AAC · burned-in captions · −12.4 LUFS (YouTube turns it down slightly; no action needed)

**Title**

> I forgot how to code so I made the compiler fix it #shorts

**Description**

```
llmtsc: the TypeScript compiler for people who forgot TypeScript. 
Full infomercial on the channel.
★ https://github.com/slimmii/llmtsc
#typescript #vibecoding #programming #shorts
```

After the main video is live, set the Short's **Related video** to it (Shorts editor → Related video) so the "▶ FULL INFOMERCIAL ON THE CHANNEL" call-to-action links somewhere.

## Re-rendering

- Main: `cd promo && npx hyperframes render -o renders/llmtsc-infomercial-youtube.mp4`
- Short: `cd promo/short && npx hyperframes render -o renders/llmtsc-short.mp4`
