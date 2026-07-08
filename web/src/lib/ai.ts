/**
 * Email content generation.
 *
 * Primary: Groq (LLaMA 3.3 70B) through its OpenAI-compatible REST API —
 * called with plain fetch, no SDK needed. Optional: if GROQ_API_KEY is not
 * set or the API fails, a built-in randomized template library takes over,
 * so the warm-up never stalls on a third-party outage.
 */

import { optionalEnv } from './env';
import type { EmailContent } from './types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// ---------------------------------------------------------------------------
// Groq
// ---------------------------------------------------------------------------

async function callGroq(systemPrompt: string, userPrompt: string): Promise<EmailContent | null> {
  const apiKey = optionalEnv('GROQ_API_KEY');
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: optionalEnv('GROQ_MODEL', DEFAULT_MODEL),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.warn(`[ai] Groq returned ${response.status}; using fallback templates`);
      return null;
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as Partial<EmailContent>;
    if (
      typeof parsed.subject !== 'string' ||
      typeof parsed.body !== 'string' ||
      !parsed.subject.trim() ||
      !parsed.body.trim()
    ) {
      return null;
    }
    return { subject: parsed.subject.trim().slice(0, 200), body: parsed.body.trim() };
  } catch (error) {
    console.warn('[ai] Groq call failed; using fallback templates:', (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fallback template library (no external dependency)
// ---------------------------------------------------------------------------

function fallbackIntro(senderName: string, recipientName: string, senderDomain: string): EmailContent {
  const firstRecipient = recipientName.split(' ')[0] || recipientName;
  const firstSender = senderName.split(' ')[0] || senderName;

  const subject = pick([
    `quick thought from the ${senderDomain} team`,
    `${firstRecipient}, a quick question`,
    `something we're building at ${senderDomain}`,
    `10 minutes this week?`,
    `an idea for handling calls`,
    `saw this and thought of you`,
    `call handling, minus the chaos`,
  ]);

  const opener = pick([
    `Hey ${firstRecipient},`,
    `Hi ${firstRecipient},`,
    `${firstRecipient}, hi —`,
    `Hello ${firstRecipient},`,
  ]);

  const intro = pick([
    `Hope your week is going well. I work over at ${senderDomain} and wanted to reach out directly rather than send something templated.`,
    `I'll keep this short since I know inboxes get loud. I'm with ${senderDomain} and we've been working on something I think is genuinely useful.`,
    `Quick note from ${senderDomain} — no pitch deck attached, promise.`,
    `Writing to you from ${senderDomain}. I usually hate cold emails too, so I'll get to the point.`,
  ]);

  const pitch = pick([
    `We've built an AI-powered virtual assistant that handles business calls — answering, routing, and following up so teams stop losing leads to missed calls.`,
    `Our team put together a virtual call assistant that picks up, qualifies, and books callers automatically. Businesses using it stopped missing after-hours calls entirely.`,
    `The short version: an AI assistant that answers your business line, has a natural conversation, and hands you a clean summary. No missed calls, no voicemail black hole.`,
  ]);

  const ask = pick([
    `Would you be open to a quick 10-minute Google Meet this week? I can show you how it works live — no slides.`,
    `If you're curious, I'd love 10 minutes on a Google Meet to walk you through it. Pick any slot that suits you.`,
    `Happy to show it in action over a short Google Meet — 10 minutes tops. Interested?`,
  ]);

  const closer = pick([
    `Cheers,\n${firstSender}`,
    `Talk soon,\n${firstSender}`,
    `Thanks,\n${firstSender}`,
    `Have a good one,\n${firstSender}`,
  ]);

  return { subject, body: `${opener}\n\n${intro} ${pitch}\n\n${ask}\n\n${closer}` };
}

function fallbackReply(replierName: string, originalSubject: string): EmailContent {
  const firstReplier = replierName.split(' ')[0] || replierName;

  const body = pick([
    `Hey — thanks for the note. This actually sounds relevant to what we've been dealing with lately. What times work for you this week?`,
    `Interesting timing, we were just talking about missed calls last week. Can you send over a couple of slots for a quick call?`,
    `Sounds intriguing. Before we book anything — does it integrate with existing phone numbers, or is it a separate line?`,
    `Not going to lie, I usually skip these, but this one caught my eye. Sure, let's do 10 minutes. Thursday afternoon any good?`,
    `Thanks for reaching out. I'd like to hear more — how long does setup usually take for a small team?`,
    `Okay, you have my attention. Send me a meet link for later this week and I'll make it work.`,
  ]);

  const cleanSubject = originalSubject.replace(/^(re:\s*)+/i, '').trim();
  return {
    subject: `Re: ${cleanSubject}`,
    body: `${body}\n\n${firstReplier}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateIntroEmail(
  senderName: string,
  recipientName: string,
  senderEmail: string,
): Promise<EmailContent> {
  const senderDomain = senderEmail.split('@')[1] || 'our company';
  const uniqueSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const systemPrompt = `You are an expert email copywriter specialized in B2B outreach.
Your task is to write a SHORT, natural, human-sounding email.

STRICT RULES:
- Length: 90-140 words ONLY
- Tone: Casual professional, like a real person writing quickly
- Purpose: Introduce an AI-powered virtual call assistant for businesses
- The sender works at ${senderDomain} — naturally reference their company/domain in the email
- Include a soft invite for a 10-minute Google Meet call
- MUST feel unique — vary sentence structure, opening, and closing every time
- The subject line MUST be completely unique and creative every time, under 8 words
- The subject MUST relate to the sender's domain (${senderDomain}) or their product
- NEVER reuse or repeat a previous subject line
- NO links, NO URLs, NO pricing, NO buzzwords like "revolutionary" or "game-changing"
- NO bullet points or numbered lists
- NO formal sign-offs like "Best regards" — use casual closings
- Write as if you're emailing a colleague, not selling
- Do NOT use the word "excited" or "thrilled"

UNIQUENESS SEED (use this for randomization): ${uniqueSeed}

RESPOND IN VALID JSON ONLY:
{
  "subject": "your unique subject line here",
  "body": "your email body here"
}`;

  const userPrompt = `Write a warm, unique outreach email from ${senderName} (${senderEmail}) at ${senderDomain} to ${recipientName}.
Introduce our AI call automation virtual assistant product from ${senderDomain}.
Suggest a quick 10-minute Google Meet to show how it works.
Make it feel like a personal note, not a template.
Randomize the structure — sometimes start with a question, sometimes a statement, sometimes a reference to their work.
The subject line must be creative, unique, and different from any generic subject. It should hint at ${senderDomain}'s offering.`;

  return (await callGroq(systemPrompt, userPrompt)) ?? fallbackIntro(senderName, recipientName, senderDomain);
}

export async function generateReplyEmail(
  replierName: string,
  originalSenderName: string,
  originalSubject: string,
  originalBody: string,
): Promise<EmailContent> {
  const systemPrompt = `You are writing a natural email reply as a busy professional.

STRICT RULES:
- Length: 40-80 words ONLY
- Tone: Friendly, professional, brief
- Purpose: Acknowledge the sender's email and express mild interest
- Show you actually read their email by referencing something specific
- Can agree to the meeting OR ask a clarifying question OR express general interest
- Vary the response type — don't always agree immediately
- NO formal language, NO corporate speak
- NO "Thank you for reaching out" or similar template phrases
- Keep it natural — like texting a work contact
- Subject should be "Re: [original subject]"

RESPOND IN VALID JSON ONLY:
{
  "subject": "Re: original subject here",
  "body": "your reply body here"
}`;

  const userPrompt = `Reply to this email as ${replierName}:

FROM: ${originalSenderName}
SUBJECT: ${originalSubject}
BODY: ${originalBody.slice(0, 2000)}

Write a brief, natural reply that shows interest. Vary the style — sometimes enthusiastic, sometimes measured, sometimes curious. Never repetitive.`;

  return (await callGroq(systemPrompt, userPrompt)) ?? fallbackReply(replierName, originalSubject);
}
