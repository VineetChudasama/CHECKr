# CHECKr - Grammar & Spelling Checker

A fully functional, production-ready Grammar & Spelling Checker web app featuring a Neo-Brutalist design. 

## Features
- Complete grammar, spelling, punctuation, and style checking.
- Uses Google Gemini API (gemini-1.5-flash) for fast and intelligent corrections.
- Strict JSON response enforcement.
- Rate-limited API proxy in Node.js/Express.
- Responsive React + Vite + Tailwind CSS frontend.
- Distinctive Neo-Brutalism design system.

## Setup Instructions

### 1. Backend Setup
1. Open terminal and navigate to `backend`.
2. Run `npm install`.
3. Rename `.env.example` to `.env` or just edit `.env` and add your `GEMINI_API_KEY`.
4. Run `npm run dev` (we will add a dev script) or `npx ts-node-dev src/index.ts`. The backend server runs on `http://localhost:3001`.

### 2. Frontend Setup
1. Open another terminal and navigate to `frontend`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the displayed local URL in your browser (usually `http://localhost:5173`).

### 3. Usage
- Paste any text into the large textarea.
- Click **CHECK TEXT**.
- View the corrected text, which you can quickly copy to your clipboard.
- Review the specific mistakes, categorized with before/after comparisons and explanations.

## Tech Stack
- **Frontend**: React (Vite), TypeScript, Tailwind CSS v4, Lucide React (Icons).
- **Backend**: Node.js, Express, @google/generative-ai, TypeScript.
