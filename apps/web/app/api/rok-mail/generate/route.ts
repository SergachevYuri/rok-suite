import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a Rise of Kingdoms mail formatting assistant.
You write in-game mail messages using RoK markup:
- <b>text</b> for bold
- <i>text</i> for italic
- <color="red">text</color> for colored text (supports: red, blue, green, yellow, orange, purple, cyan, magenta, pink, gold, white, or hex like #ff0000)
- Unicode symbols for decoration: ━ ═ ★ ☆ ⚔ ♦ ▸ ► → ① ② ③ etc.

Rules:
- Keep total length under 2000 characters (including markup tags)
- Use decorative borders and headers to make messages visually appealing
- Be concise - RoK players skim mail quickly
- Match the tone requested (formal for kingdom announcements, urgent for war, friendly for recruitment)
- When improving an existing draft, preserve the template structure (header, borders, signature) and only change the message body
- Output ONLY the formatted mail content, no explanations or surrounding text`;

export async function POST(request: NextRequest) {
  const { prompt, currentContent } = await request.json();

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI assistant is not configured. Set GEMINI_API_KEY to enable this feature.' },
      { status: 503 }
    );
  }

  const fullPrompt = currentContent
    ? `${SYSTEM_PROMPT}\n\nThe user's current draft:\n${currentContent}\n\nUser request: ${prompt}`
    : `${SYSTEM_PROMPT}\n\nUser request: ${prompt}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const geminiMsg = errorData?.error?.message || '';
      console.error('Gemini API error:', response.status, geminiMsg);

      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Gemini API quota exceeded. The free tier limit has been reached — try again later or upgrade your Google AI plan.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: geminiMsg ? `Gemini API error: ${geminiMsg}` : 'AI generation failed' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const generatedText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return NextResponse.json({ content: generatedText });
  } catch (error) {
    console.error('AI generation error:', error);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
