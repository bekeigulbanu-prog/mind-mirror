// ====================== ANALYZE SERVER - Separate Server for Review Analysis ======================
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ========== Database ==========
const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MindMirrorDB',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: { 
        encrypt: false, 
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

let pool;

async function connectToDb() {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Analysis server connected to the database');
    } catch (err) {
        console.error('❌ DB connection error:', err.message);
    }
}

// ========== GEMINI ==========
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGeminiAnalyze(prompt) {
    if (!GEMINI_API_KEY) {
        return "Error: GEMINI_API_KEY is not set in environment variables.";
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2500
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`[Analyze] Gemini HTTP ${response.status}:`, errorText);

            if (response.status === 503) {
                return "The Gemini model is currently overloaded. Please try again in 10–30 minutes.";
            }
            if (response.status === 429) {
                return "Request limit reached for today. Please try again tomorrow or create a new API key.";
            }
            if (response.status === 400 || response.status === 403) {
                return "API key error. Create a new key in Google AI Studio.";
            }

            return `Gemini error (${response.status}). Please try again later.`;
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
            return "Gemini could not process the request (a safety filter may have been triggered).";
        }

        const candidate = data.candidates[0];
        return candidate.content?.parts?.[0]?.text || "Empty response from AI.";

    } catch (err) {
        console.error('❌ callGeminiAnalyze error:', err.message);
        return "Connection error with Gemini. Check your internet connection and API key.";
    }
}

// ========== REVIEW ANALYSIS ROUTE ==========
app.post('/api/analyze-feedback', async (req, res) => {
    try {
        const result = await pool.request()
            .query(`
                SELECT Rating, Comment, CreatedAt 
                FROM Feedback 
                WHERE CreatedAt >= DATEADD(MONTH, -1, GETDATE())
                ORDER BY CreatedAt DESC
            `);

        const feedbacks = result.recordset;

        if (feedbacks.length === 0) {
            return res.json({ 
                success: true, 
                analysis: "There are no reviews for the past month yet.",
                totalReviews: 0,
                averageRating: 0
            });
        }

        let promptText = `You are an experienced product analyst for the MindMirror application.

Analyze user reviews for the past month as honestly and thoroughly as possible.

Total reviews: ${feedbacks.length}
Average rating: ${(feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length).toFixed(1)}

Reviews:\n`;

        feedbacks.forEach((f, i) => {
            promptText += `\n${i+1}. ⭐ ${f.Rating}/5 — "${f.Comment || 'No comment'}"`;
        });

        promptText += `

Provide a structured analysis in English:

1. Overall assessment and tone of the reviews
2. Main strengths of the application
3. Main user issues and pain points
4. Most frequent feature requests and suggestions
5. 5–7 key quotes from reviews (including the rating)
6. Concrete recommendations for the developer (priority actions)

Be objective and constructive.`;

        const aiResponse = await callGeminiAnalyze(promptText);

        res.json({ 
            success: true, 
            analysis: aiResponse,
            totalReviews: feedbacks.length,
            averageRating: feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length || 0
        });

    } catch (err) {
        console.error('Review analysis error:', err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to perform analysis. See server logs.' 
        });
    }
});

// ========== SERVER LAUNCH ==========
connectToDb().then(() => {
    const PORT = process.env.ANALYZE_PORT || 3001;

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Analysis server running at http://localhost:${PORT}`);
        console.log(`Model: Gemini 2.5 Flash`);
    });
});
