/**
 * Groq AI Email Generation Service.
 *
 * Uses Groq's LLaMA 3.3 70B model to generate unique, human-like emails
 * for warm-up outreach and reply generation.
 *
 * Two distinct prompt strategies:
 * 1. Outbound: Introduces AI call automation, invites for Google Meet
 * 2. Reply: Natural agreement-style continuation of thread
 *
 * All responses are structured JSON: { subject, body }
 */

import Groq from 'groq-sdk';
import { config } from '../config';
import { logger } from '../config/logger';
import { GroqEmailResponse } from '../types';

const groq = new Groq({
  apiKey: config.groq.apiKey,
});

/**
 * Generate a unique outbound warm-up email.
 *
 * The email introduces an AI-powered virtual call assistant and
 * invites the recipient for a short Google Meet demo.
 */
export async function generateOutboundEmail(
  senderName: string,
  recipientName: string,
  senderEmail: string
): Promise<GroqEmailResponse> {
  // Extract domain from sender email for context (e.g. "blizal.tech" from "jackson@blizal.tech")
  const senderDomain = senderEmail.split('@')[1] || 'our company';
  // Unique seed to ensure every call produces a different subject
  const uniqueSeed = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

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

  return callGroq(systemPrompt, userPrompt);
}

/**
 * Generate a natural reply to an email thread.
 *
 * The reply expresses interest, acknowledges the outreach,
 * and agrees to engage further — maintaining thread continuity.
 */
export async function generateReplyEmail(
  replierName: string,
  originalSenderName: string,
  originalSubject: string,
  originalBody: string
): Promise<GroqEmailResponse> {
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
BODY: ${originalBody}

Write a brief, natural reply that shows interest. Vary the style — sometimes enthusiastic, sometimes measured, sometimes curious. Never repetitive.`;

  return callGroq(systemPrompt, userPrompt);
}

/**
 * Internal: Call Groq API and parse the JSON response.
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<GroqEmailResponse> {
  try {
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9, // High temperature for variety
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    const parsed = JSON.parse(content) as GroqEmailResponse;

    // Validate response structure
    if (!parsed.subject || !parsed.body) {
      throw new Error('Invalid Groq response: missing subject or body');
    }

    logger.info('Groq email generated', {
      subject: parsed.subject.substring(0, 50),
      bodyLength: parsed.body.length,
    });

    return parsed;
  } catch (error: any) {
    logger.error('Groq API call failed', { error: error.message });

    // If JSON parsing failed, try to extract from raw text
    if (error instanceof SyntaxError) {
      throw new Error('Groq returned non-JSON response');
    }

    throw error;
  }
}
