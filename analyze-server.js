// ====================== ANALYZE SERVER - Отдельный сервер для анализа отзывов ======================
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ========== База данных ==========
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
        console.log('✅ Анализ-сервер подключён к БД');
    } catch (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    }
}

// ========== GEMINI ==========
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGeminiAnalyze(prompt) {
    if (!GEMINI_API_KEY) {
        return "Ошибка: GEMINI_API_KEY не задан в переменных окружения.";
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
                return "Модель Gemini сейчас сильно загружена. Попробуйте через 10–30 минут.";
            }
            if (response.status === 429) {
                return "Лимит запросов исчерпан на сегодня. Попробуйте завтра или создайте новый API-ключ.";
            }
            if (response.status === 400 || response.status === 403) {
                return "Ошибка API-ключа. Создайте новый ключ в Google AI Studio.";
            }

            return `Ошибка Gemini (${response.status}). Попробуйте позже.`;
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
            return "Gemini не смог обработать запрос (возможно, сработал фильтр безопасности).";
        }

        const candidate = data.candidates[0];
        return candidate.content?.parts?.[0]?.text || "Пустой ответ от ИИ.";

    } catch (err) {
        console.error('❌ Ошибка callGeminiAnalyze:', err.message);
        return "Ошибка соединения с Gemini. Проверьте интернет и API-ключ.";
    }
}

// ========== МАРШРУТ АНАЛИЗА ОТЗЫВОВ ==========
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
                analysis: "За последний месяц отзывов пока нет.",
                totalReviews: 0,
                averageRating: 0
            });
        }

        let promptText = `Ты — опытный продуктовый аналитик приложения MindMirror.

Проанализируй отзывы пользователей за последний месяц максимально честно и подробно.

Всего отзывов: ${feedbacks.length}
Средний рейтинг: ${(feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length).toFixed(1)}

Отзывы:\n`;

        feedbacks.forEach((f, i) => {
            promptText += `\n${i+1}. ⭐ ${f.Rating}/5 — "${f.Comment || 'Без комментария'}"`;
        });

        promptText += `

Дай структурированный анализ на русском языке:

1. Общая оценка и тон отзывов
2. Главные сильные стороны приложения
3. Главные проблемы и боли пользователей
4. Самые частые пожелания и предложения
5. 5–7 ключевых цитат из отзывов (с указанием рейтинга)
6. Конкретные рекомендации разработчику (что сделать в первую очередь)

Будь объективным и конструктивным.`;

        const aiResponse = await callGeminiAnalyze(promptText);

        res.json({ 
            success: true, 
            analysis: aiResponse,
            totalReviews: feedbacks.length,
            averageRating: feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length || 0
        });

    } catch (err) {
        console.error('Ошибка анализа отзывов:', err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось выполнить анализ. Смотри логи сервера.' 
        });
    }
});

// ========== ЗАПУСК СЕРВЕРА ==========
connectToDb().then(() => {
    const PORT = process.env.ANALYZE_PORT || 3001;

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Анализ-сервер запущен на http://localhost:${PORT}`);
        console.log(`Модель: Gemini 2.5 Flash`);
    });
});