---
name: marketing-skills
description: Router for the marketing skill library at https://github.com/coreyhaines31/marketingskills. Use whenever a task touches marketing, growth, or anything a user or customer will see — landing pages, homepage, pricing page, signup/onboarding flows, paywalls, popups, dashboards and product UI copy, emails, ads, SEO, analytics, launches, positioning, pricing, referrals, churn, social, video, or images. Also use when the user asks for copy, headlines, CTAs, page structure, conversion improvements, competitor research, or a marketing plan. Pick the relevant skills from the catalog below, install them with `npx skills add`, then follow their instructions.
---

# Marketing Skills

Specialized marketing skills live in an external library:
**https://github.com/coreyhaines31/marketingskills**

They are not vendored into this repo. Install the ones the current task needs,
then follow their instructions instead of improvising marketing work.

## Workflow

### 1. Decide which skills apply

Read the task, then pick from the catalog below. Take the 1–3 skills that
actually match — not the whole library. If nothing matches, say so and continue
with the normal workflow; do not install skills for a task that has no marketing
surface.

**`product-marketing` is the foundation.** Every other skill reads it first for
product, audience, and positioning context. Install it alongside the others
whenever `.agents/product-marketing.md` (or `.claude/product-marketing.md`) does
not already exist.

### 2. Install them

Non-interactive (preferred — no prompts, works unattended):

```bash
npx -y skills add "https://github.com/coreyhaines31/marketingskills" \
  -s product-marketing -s cro -s copywriting \
  --agent claude-code --yes --copy
```

Syntax that matters — getting these wrong silently fails:

- One `-s` flag **per skill**. A comma-separated list (`-s "cro,copywriting"`)
  matches nothing and the CLI just prints the catalog.
- The agent id is `claude-code`, not `claude`.
- Skills land in `./.claude/skills/<name>/`. Add `-g` / `--global` to install into
  `~/.claude/skills/` for every project instead of just this one.

Useful variants:

- List everything available without installing: `npx -y skills add "https://github.com/coreyhaines31/marketingskills" --list`
- Use one skill without installing it: `npx -y skills use "https://github.com/coreyhaines31/marketingskills@cro"`
- Interactive picker (only when a human is at the keyboard): `npx skills add "https://github.com/coreyhaines31/marketingskills"`

If `npx` is unavailable or the network is blocked, fall back to
`git clone --depth 1 https://github.com/coreyhaines31/marketingskills` into a temp
directory and read `skills/<name>/SKILL.md` directly.

### 3. Follow the installed skills

Read each installed `SKILL.md` in full — plus any `references/` files it points
at — and follow its instructions for the rest of the task. Skills cross-reference
each other; honor the "Related Skills" pointers when a skill hands off.

### 4. Report

Tell the user which skills were installed and applied, and where they landed
(`.claude/skills/`).

## Catalog

| Skill | Use when |
|-------|----------|
| `ab-testing` | Planning, designing, or implementing an A/B test, experiment, or experimentation program |
| `ad-creative` | Generating, iterating, or scaling ad creative — headlines, descriptions, primary text, ad variations |
| `ads` | Paid campaigns on Google Ads, Meta, LinkedIn, X, or other ad platforms |
| `ai-seo` | Optimizing content for AI search engines, getting cited by LLMs, appearing in AI answers |
| `analytics` | Setting up, improving, or auditing analytics tracking and measurement |
| `aso` | Auditing or optimizing an App Store / Google Play listing |
| `attribution` | Figuring out which marketing drives conversions and revenue; choosing an attribution model |
| `churn-prevention` | Reducing churn, cancellation flows, save offers, failed-payment recovery, retention |
| `co-marketing` | Finding co-marketing partners, joint campaigns, partnership opportunities |
| `cold-email` | B2B cold outreach emails and follow-up sequences |
| `community-marketing` | Building or leveraging an online community for growth and loyalty |
| `competitor-profiling` | Researching, profiling, or analyzing competitors from their URLs |
| `competitors` | Building competitor comparison / "alternative to" pages for SEO and sales |
| `content-strategy` | Planning a content strategy, deciding what content or topics to cover |
| `copy-editing` | Editing, reviewing, or refreshing existing marketing copy |
| `copywriting` | Writing or rewriting marketing copy for any page — homepage, landing, pricing, feature |
| `cro` | Improving conversions on any page or form; "this page isn't converting" |
| `customer-research` | Conducting, analyzing, or synthesizing customer research |
| `directory-submissions` | Submitting a product to startup / SaaS / AI directories for backlinks and traffic |
| `emails` | Email sequences, drip campaigns, automated flows, lifecycle email |
| `free-tools` | Planning, evaluating, or building a free tool for leads, SEO, or awareness |
| `image` | Creating or optimizing marketing images — blog heroes, social graphics, mockups |
| `influencer-marketing` | Influencer, creator, or ambassador partnerships |
| `launch` | Product launches, feature announcements, release strategy |
| `lead-magnets` | Creating or optimizing a lead magnet for email capture |
| `marketing-council` | Wanting multiple expert perspectives — a simulated board of marketing advisors |
| `marketing-ideas` | Needing marketing ideas, inspiration, or strategies for a SaaS product |
| `marketing-loops` | Setting up a recurring, self-running marketing workflow on a cadence |
| `marketing-plan` | Needing a comprehensive marketing plan |
| `marketing-psychology` | Applying psychological principles or behavioral science to marketing |
| `offers` | Designing or improving the offer itself — value framing, bonuses, guarantees |
| `onboarding` | Post-signup onboarding, activation, first-run experience, time-to-value |
| `paywalls` | In-app paywalls, upgrade screens, upsell modals, feature gates |
| `popups` | Popups, modals, overlays, slide-ins, banners for conversion |
| `pricing` | Pricing decisions, packaging, monetization strategy |
| `product-marketing` | Creating or updating the product marketing context doc — **read by all other skills first** |
| `programmatic-seo` | SEO pages at scale using templates and data |
| `prospecting` | Finding, qualifying, and building a prospect list |
| `public-relations` | Earned media, press coverage, journalist outreach (not pull requests) |
| `referrals` | Referral programs, affiliate programs, word-of-mouth strategy |
| `revops` | Revenue operations, lead lifecycle, marketing-to-sales handoff |
| `sales-enablement` | Sales collateral, pitch decks, one-pagers, objection handling, demo scripts |
| `schema` | Adding, fixing, or optimizing schema markup and structured data |
| `seo-audit` | Auditing, reviewing, or diagnosing SEO issues on a site |
| `signup` | Optimizing signup, registration, account creation, trial activation |
| `site-architecture` | Page hierarchy, navigation, URL structure, internal linking |
| `sms` | SMS/MMS marketing — welcome flows, abandoned cart, post-purchase |
| `social` | Creating, scheduling, or optimizing social content for any platform |
| `video` | Creating or producing video content with AI tools or programmatic frameworks |

## Common combinations

- New landing page or homepage → `product-marketing` + `copywriting` + `cro`
- Pricing page → `product-marketing` + `pricing` + `copywriting`
- Signup / onboarding flow → `product-marketing` + `signup` + `onboarding`
- Shipping a feature publicly → `product-marketing` + `launch` + `social`
- Traffic is flat → `seo-audit` + `content-strategy` + `ai-seo`
- Conversions are flat → `cro` + `ab-testing` + `analytics`

## Notes

- Installed skills are copied into `.claude/skills/` and are gitignored by
  default in some setups — check `git status` before committing them.
- Skills are engineering-grade instructions, not suggestions. Once installed,
  follow the skill's process rather than substituting your own approach.
