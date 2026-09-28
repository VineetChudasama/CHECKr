import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Rate limiting: max 10 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests from this IP, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ──────────────────────────────────────────────
// LanguageTool fallback (free, no API key needed)
// ──────────────────────────────────────────────
interface LTMatch {
  message: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { category: { name: string } };
  context: { text: string; offset: number; length: number };
}

async function checkWithLanguageTool(text: string) {
  console.log('Falling back to LanguageTool API (free, no key required)...');

  const response = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text, language: 'en-US' }),
  });

  if (!response.ok) {
    throw new Error(`LanguageTool API returned ${response.status}`);
  }

  const data = await response.json() as { matches: LTMatch[] };

  // Build corrected text by applying replacements in reverse order
  let correctedText = text;
  const sortedMatches = [...data.matches].sort((a, b) => b.offset - a.offset);
  for (const match of sortedMatches) {
    if (match.replacements.length > 0) {
      correctedText =
        correctedText.slice(0, match.offset) +
        match.replacements[0].value +
        correctedText.slice(match.offset + match.length);
    }
  }

  // Map matches to our mistake schema
  const mistakes = data.matches.map((match) => {
    const original = text.slice(match.offset, match.offset + match.length);
    const corrected = match.replacements.length > 0 ? match.replacements[0].value : original;
    const category = match.rule?.category?.name || 'Grammar';

    // Map LanguageTool categories to our types
    let type = 'Grammar';
    const cat = category.toLowerCase();
    if (cat.includes('spell') || cat.includes('typo')) type = 'Spelling';
    else if (cat.includes('punctuation')) type = 'Punctuation';
    else if (cat.includes('style') || cat.includes('redundan') || cat.includes('word')) type = 'Word Choice';
    else if (cat.includes('grammar')) type = 'Grammar';

    return { original, corrected, type, explanation: match.message };
  });

  return {
    correctedText,
    mistakes,
    mistakeCount: mistakes.length,
    isGibberish: false,
  };
}

// ──────────────────────────────────────────────
// Gemini-based check (primary)
// ──────────────────────────────────────────────
async function checkWithGemini(text: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const systemPrompt = `You are a professional English proofreader. Given the user's text, find every spelling, grammar, punctuation, and phrasing mistake.

CRITICAL RULES FOR NAMES:
- NEVER change the spelling of a person's name. If the user writes "vineet", "harshit", "priya", etc., keep the exact spelling — only capitalize the first letter (e.g. "vineet" → "Vineet", NOT "Vineeth").
- Personal names are sacred — do NOT "correct" them to similar dictionary words or alternate spellings.
- Only fix capitalization of names (first letter uppercase), never their spelling.
- You MAY correct the spelling of well-known place names (countries, cities) and common English words/things.

GIBBERISH DETECTION:
- If the user's input is entirely gibberish, random keyboard smashes (e.g., "ececefcert", "asdfghjkl"), or makes absolutely no sense in any language, set "isGibberish" to true.

Return ONLY valid JSON matching this schema (no markdown fences, no commentary): 
{ 
  "correctedText": "string - the fully corrected version of the input", 
  "mistakes": [
    {
      "original": "string - the exact original erroneous phrase/word", 
      "corrected": "string - the fixed phrase/word", 
      "type": "string - category, e.g. Spelling, Grammar, Punctuation, Tense, Word Choice, Subject-Verb Agreement, Capitalization", 
      "explanation": "string - one short sentence explaining the mistake"
    }
  ], 
  "mistakeCount": "number",
  "isGibberish": "boolean"
}
If there are no mistakes and the text is not gibberish, return correctedText identical to input and an empty mistakes array.`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  // Flash models to try (avoid Pro models on free tier)
  const modelsToTry = [
    "gemini-3.8-flash",
    "gemini-3.8-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.7-flash"
  ];

  let lastError: any;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Trying Gemini model: ${modelName}`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: "application/json" },
      });

      const result = await model.generateContent(text);
      const responseText = result.response.text();

      console.log(`Success with ${modelName}`);

      const jsonString = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(jsonString);
    } catch (err: any) {
      console.error(`Model ${modelName} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError;
}

// ──────────────────────────────────────────────
// Main endpoint
// ──────────────────────────────────────────────
app.post('/api/check', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Valid text is required in the request body.' });
    }

    // Strategy: Try Gemini first, fall back to LanguageTool
    try {
      const geminiResult = await checkWithGemini(text);
      return res.json(geminiResult);
    } catch (geminiError: any) {
      console.error('All Gemini models failed, falling back to LanguageTool:', geminiError.message);
    }

    // Fallback: LanguageTool (free, always available)
    try {
      const ltResult = await checkWithLanguageTool(text);
      return res.json(ltResult);
    } catch (ltError: any) {
      console.error('LanguageTool also failed:', ltError.message);
      return res.status(500).json({
        error: 'All grammar-checking services are currently unavailable. Please try again in a moment.',
      });
    }
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'An error occurred while checking the text.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
