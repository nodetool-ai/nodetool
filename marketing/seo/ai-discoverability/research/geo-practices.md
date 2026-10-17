# What Influences AI-Assistant Retrieval and Citation (2025-2026 Evidence)

Research date: 2026-10-17. Each claim is labeled:

- **Official**: the platform's own documentation or a named employee.
- **Measured**: a third-party study with a stated dataset. Most are vendor
  studies and report correlation, not causation.
- **Speculation**: a reasonable inference not tested by any source found.

## 1. llms.txt

| Claim | Label | Source |
|---|---|---|
| Google: "You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in Google Search". Creating llms.txt "will neither harm nor help your site's visibility or rankings in Google Search". Page last updated 2026-07-10. | Official | [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) |
| Google AI features page: "You don't need to create new machine readable files, AI text files, or markup to appear in these features." | Official | [Google AI features](https://developers.google.com/search/docs/appearance/ai-features) |
| Gary Illyes (Google) on Bluesky: "it's very easy to draw a parallel between 1990's keywords meta tag and this" (Aug 1, 2025 report) | Official (employee) | [Search Engine Roundtable](https://www.seroundtable.com/google-parallel-meta-keywords-llmstxt-39862.html) |
| OpenAI's crawler docs do not mention llms.txt as a crawler input. The page links its own llms.txt as a documentation index. | Official (absence) | [OpenAI crawlers](https://developers.openai.com/docs/gptbot) |
| Anthropic's crawler help article does not mention llms.txt | Official (absence) | [Anthropic ClaudeBot article](https://support.claude.com/en/articles/8896518-what-is-claudebot) |
| Perplexity's crawler docs list PerplexityBot and Perplexity-User and do not mention llms.txt | Official (absence) | [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md) |
| Scalevise says Claude and Perplexity "use the file" but cites no Anthropic or Perplexity statement. Treat this as unsupported. | Unsupported claim | [Scalevise](https://scalevise.com/resources/llms-txt-google-perplexity-claude/) |
| Server logs, 83 sites, 12 weeks (Apr-Jul 2026): GPTBot fetched robots.txt 3,990 times and llms.txt 7 times. ClaudeBot: 3,120 vs 9. PerplexityBot: 775 vs 0. Googlebot: 5,125 vs 67. Meta-ExternalAgent was the only bot that fetched llms.txt more often (193 vs 172). The vendor sells AEO tools. | Measured | [EZY.ai](https://ezy.ai/research/do-ai-bots-read-llms-txt) |
| Ahrefs (May 2026, 137,000 domains, as summarized by Rework): 28% published llms.txt, and 97% of those received zero requests for it in the month studied | Measured (secondary summary) | [Rework summary](https://resources.rework.com/tools/aeo-ai-visibility/llms-txt-explained), citing [Ahrefs](https://ahrefs.com/blog/what-is-llms-txt/) |
| A 54-source review scored llms.txt 2 of 10 and found no credible evidence that it influences citations | Measured (meta-review) | [Zyppy Signal](https://signal.zyppy.com/ai-citation-ranking-factors/) |

Conclusion: no major assistant has said it reads third-party llms.txt files
at retrieval time, and log data shows their crawlers almost never fetch them.
An llms.txt costs little and may help coding agents that fetch documentation
directly. That last benefit is speculation.

## 2. Structured data (JSON-LD)

| Claim | Label | Source |
|---|---|---|
| Google: "There's also no special schema.org structured data that you need to add" for AI Overviews or AI Mode. Structured data should match visible text. | Official | [Google AI features](https://developers.google.com/search/docs/appearance/ai-features) |
| Google: structured data "isn't required for generative AI search" but "it's a good idea to continue using it as part of your overall SEO strategy" | Official | [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) |
| Ahrefs: 1,885 pages that added JSON-LD vs 4,000 controls (Aug 2025-Mar 2026). ChatGPT +2.2% and AI Mode +2.4%, neither significant. AI Overviews -4.6%. All pages already had 100+ AI Overview citations. | Measured (controlled before/after) | [Analyzify summary](https://analyzify.com/hub/schema-markup-ai-citations-research), citing [Ahrefs](https://ahrefs.com/blog/schema-ai-citations/) |
| AirOps and Kevin Indig: ChatGPT cited JSON-LD pages at 38.5% vs 32.0% without. FAQPage 45.6%, BreadcrumbList 46.2%. Correlation from UI scrapes. | Measured (correlational) | [AirOps](https://www.airops.com/report/the-fan-out-effect-what-happens-between-a-query-and-a-citation) |
| OtterlyAI sitewide schema rollout (April 2026): AI Overviews citations +1,500%, AI Mode +377%, while ChatGPT, Gemini, and Copilot citations dropped | Measured (single case) | [Analyzify summary](https://analyzify.com/hub/schema-markup-ai-citations-research) |
| The meta-review scores structured data 5.6 of 10: a small, consistent positive relationship | Measured (meta-review) | [Zyppy Signal](https://signal.zyppy.com/ai-citation-ranking-factors/) |

Conclusion: the evidence conflicts. The one controlled study found no
significant ChatGPT effect. Use `SoftwareApplication`, `Organization`,
`BreadcrumbList`, and `FAQPage` markup that mirrors visible text for ordinary
SEO reasons, and do not expect it to drive citations alone.

## 3. Which indexes the assistants use

| Assistant | What the evidence shows | Label | Source |
|---|---|---|---|
| ChatGPT search | OpenAI's OAI-SearchBot crawls for ChatGPT search. Sites must allow it in robots.txt and allow its IP ranges. Opted-out sites are excluded from answers. GPTBot (training) is controlled separately. OpenAI's page does not mention Bing. | Official | [OpenAI crawlers](https://developers.openai.com/docs/gptbot) |
| ChatGPT search | Profound sample: ChatGPT citation alignment with Google rose from 12% (Apr 2025) to 33% (Jul 2025), while alignment with Bing fell from 26% to 8%. "Alignment" is not defined, and the source is a vendor. | Measured | [Profound](https://www.tryprofound.com/blog/ai-search-shift) |
| ChatGPT | ChatGPT issues internal fan-out sub-searches, and 88.6% of queries produce exactly two. Retrieval position 1 is cited 58.4% of the time vs 14.2% at position 10. The search provider is unconfirmed. | Measured | [AirOps](https://www.airops.com/report/the-fan-out-effect-what-happens-between-a-query-and-a-citation) |
| ChatGPT | 1.4M prompts: cited titles were more semantically similar to the prompt (0.602 vs 0.484). Descriptive URL slugs were cited 89.78% vs 81.11%. Reddit has its own retrieval channel but is cited only 1.93% of the time. | Measured | [Ahrefs](https://ahrefs.com/blog/why-chatgpt-cites-pages/) |
| Claude | Anthropic's subprocessor list added Brave Search (Mar 2025). Simon Willison matched Claude citations to Brave results and found a `BraveSearchParams` parameter. | Official list plus measured | [TechCrunch](https://techcrunch.com/2025/03/21/anthropic-appears-to-be-using-brave-to-power-web-searches-for-its-claude-chatbot/), [Simon Willison](https://simonwillison.net/2025/Mar/21/anthropic-used-brave) |
| Claude | Xponent21 reports a second web-search subprocessor, turbopuffer, added May 6, 2026. Its role is not public. I did not verify this on Anthropic's Trust Center. | Secondary report | [Xponent21](https://xponent21.com/insights/claude-web-search-brave-turbopuffer/) |
| Claude | Anthropic runs ClaudeBot (training), Claude-User (user-requested fetches), and Claude-SearchBot (search quality). Blocking Claude-User or Claude-SearchBot "may reduce" visibility. All honor robots.txt. | Official | [Anthropic](https://support.claude.com/en/articles/8896518-what-is-claudebot) |
| Perplexity | PerplexityBot indexes for Perplexity search and honors robots.txt. Perplexity-User fetches on a user's request and "generally ignores robots.txt rules". | Official | [Perplexity](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md) |
| Perplexity, ChatGPT, Gemini, Copilot | Of AI-cited URLs, 28.6% (Perplexity), about 8% (ChatGPT, Gemini, Copilot) ranked in Google's top 10 for the original prompt. 15,000 long-tail prompts, Aug 2025. | Measured | [Ahrefs](https://ahrefs.com/blog/ai-search-overlap/) |
| Gemini, AI Overviews | Gemini uses Google's crawling infrastructure. A page must be indexed and snippet-eligible to be a supporting link. AI Overviews and AI Mode use query fan-out. Google-Extended controls training and grounding outside Search. | Official | [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler) |
| Copilot | Bing Webmaster Tools added an AI Performance report (public preview Feb 10, 2026). It shows citations in Copilot, Bing AI answers, and unnamed "select partner integrations", plus sampled grounding queries. | Official (via trade press) | [PPC Land](https://ppc.land/bing-gives-publishers-first-look-at-how-ai-systems-cite-their-content/) |

Practical reading: allow OAI-SearchBot, Claude-SearchBot, Claude-User,
PerplexityBot, and Googlebot, and keep the site indexed in Google, Bing, and
Brave. Brave matters specifically for Claude. Registering in Bing Webmaster
Tools gives the only first-party AI citation report found.

## 4. JavaScript and server-side rendering

| Claim | Label | Source |
|---|---|---|
| GPTBot, ClaudeBot, and PerplexityBot fetch JavaScript files but do not execute them, so client-rendered content is invisible to them. Gemini uses Googlebot rendering. Data from Vercel and MERJ, Dec 2024. | Measured | [Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler) |
| The meta-review rates "URL accessibility" the top citation factor (9.5 of 10) | Measured (meta-review) | [Zyppy Signal](https://signal.zyppy.com/ai-citation-ranking-factors/) |

Conclusion: comparison tables, FAQ answers, and feature lists must be in the
initial HTML. A client-rendered marketing page or docs site loses ChatGPT,
Claude, and Perplexity retrieval.

## 5. Third-party mentions

| Claim | Label | Source |
|---|---|---|
| Branded web mentions correlate 0.664 with AI Overview brand visibility (75K brands). Branded anchors 0.527, Domain Rating 0.326, backlinks 0.218. | Measured (correlational) | [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/) |
| Top cited domains (30M sources, Mar 2026). ChatGPT: Wikipedia, Reddit, Forbes, TechRadar, LinkedIn. Perplexity: Reddit, YouTube, LinkedIn, Wikipedia, G2. Gemini: Reddit, YouTube, Wikipedia, Medium. AI Overviews: YouTube, Reddit, Facebook, LinkedIn, Medium. | Measured | [Peec](https://docs.peec.ai/research/most-cited-domains-by-engine) |
| June 2025, 78.6M searches: Wikipedia is ChatGPT's top source (16.3%). YouTube leads Perplexity (16.1%) and AI Overviews (9.5%). | Measured | [Ahrefs](https://ahrefs.com/blog/top-10-most-cited-domains-ai-assistants) |
| ChatGPT retrieves Reddit heavily but cites it 1.93% of the time, so Reddit likely shapes answers without being credited | Measured plus inference | [Ahrefs](https://ahrefs.com/blog/why-chatgpt-cites-pages/) |
| AirOps found domain authority and backlinks showed no positive correlation with ChatGPT citation | Measured | [AirOps](https://www.airops.com/report/the-fan-out-effect-what-happens-between-a-query-and-a-citation) |
| Wikidata entries influencing assistant answers | Speculation. No study found. | n/a |
| GitHub READMEs feeding MCP directories (glama.ai, mcpservers.org, archestra.ai), which then rank for MCP queries | Observed in this research | [serp-competitors.md, F3](serp-competitors.md#patterns-across-the-39-queries) |

Conclusion: mentions on Reddit, YouTube, Wikipedia, G2, listicles, and MCP
directories matter more than links. For NodeTool the gap is concrete:
category listicles and MCP directories returned no NodeTool mention, and
directory descriptions are outdated.

## 6. Content shape: answer-first, headings, freshness

| Claim | Label | Source |
|---|---|---|
| Pages whose headings closely match the query were cited 41% vs 29% for weak matches. Articles with 4-10 H2-H4 subheadings did best. | Measured | [AirOps](https://www.airops.com/report/the-fan-out-effect-what-happens-between-a-query-and-a-citation) |
| Pages 30-89 days old had the highest citation rate (32.8%). Freshness helped only when query match was already strong. | Measured | [AirOps](https://www.airops.com/report/the-fan-out-effect-what-happens-between-a-query-and-a-citation) |
| Cited pages had a median age of about 500 days. Relevance mattered more than freshness. | Measured | [Ahrefs](https://ahrefs.com/blog/why-chatgpt-cites-pages/) |
| Answer placement near the top scored 8.8 of 10, and self-contained passages and factual specificity also scored high. Most factors overlap with classic SEO. | Measured (meta-review) | [Zyppy Signal](https://signal.zyppy.com/ai-citation-ranking-factors/) |
| Google: content that is "unique, compelling, and useful", with firsthand experience, will likely influence presence. Repeating what others say does not. | Official | [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) |
| GEO methods can raise visibility in generative engine responses "by up to 40%". This is a 2023 lab benchmark, not a production assistant. | Measured (academic) | [Aggarwal et al., arXiv 2311.09735](https://arxiv.org/abs/2311.09735) |

AirOps did not test answer-first layout directly. Its evidence for that layout
is indirect.

## 7. Implications for NodeTool (inference from the above)

1. D1. Make every comparison and category page server-rendered HTML, with H1
   and H2 text that matches corpus queries: "Open-source AI game engine",
   "ComfyUI alternative for video", "Higgsfield alternative with an editable
   timeline".
2. D2. Publish one honest comparison table per competitor cluster, covering
   open source, agent and MCP support, editable output, and platforms. Vendor
   listicles win with this format (serp-competitors F2), and a balanced table
   is more citable than a self-ranked one.
3. D3. Publish one integration landing page per agent client: "NodeTool in
   Claude Code", "in Codex", "in Cursor", "in Claude Desktop". Higgsfield,
   Ludo.ai, and Summer Engine win integration queries this way.
4. D4. Submit the MCP server to glama.ai, mcpservers.org, mcp.directory, and
   the official MCP registry. Add GitHub topics `game-engine`, `mcp-server`,
   `ai-agents`, `storyboard`.
5. D5. Correct directory descriptions (AlternativeTo app type and tags, Future
   Tools, G2, SaaSHub, OpenClaw skill text). Seed honest build stories on
   Reddit, YouTube, and Hacker News, which assistants retrieve.
6. D6. Allow OAI-SearchBot, Claude-SearchBot, Claude-User, and PerplexityBot,
   verify Bing and Brave indexing, and register Bing Webmaster Tools for its
   AI Performance report. Keep llms.txt as low-cost insurance, not a lever.
