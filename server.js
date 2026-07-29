const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config(); // npm install dotenv

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
        console.log('✅ Успешно подключено к базе данных MindMirrorDB');
    } catch (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
        console.error('Проверь: SQL Server запущен, имя сервера, логин/пароль и firewall.');
    }
}

// Логирование действий
async function logAction(req, email, action) {
    try {
        if (!email) return;

        const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';

        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('action', sql.NVarChar, action)
            .input('ip', sql.NVarChar, ip)
            .query(`INSERT INTO UserLogins 
                    (UserEmail, ActionType, IPAddress, LoginTime) 
                    VALUES (@email, @action, @ip, GETDATE())`);

    } catch (e) {
        console.error('Ошибка логирования:', e.message);
    }
}

// REGISTER
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Заполните все поля' });
    }

    try {
        const existing = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Users WHERE Email = @email');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ success: false, error: 'Этот email уже зарегистрирован' });
        }

        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password) // В продакшене используй bcrypt!
            .query(`INSERT INTO Users (Name, Email, Password, CreatedAt) 
                    VALUES (@name, @email, @password, GETDATE())`);

        await logAction(req, email, 'Register');

        console.log(`✅ Новый пользователь: ${email}`);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Введите email и пароль' });
    }

    try {
        console.log(`Попытка входа: ${email}`);

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password)
            .query(`
                SELECT Id, Name, Email, CreatedAt 
                FROM Users 
                WHERE Email = @email AND Password = @password
            `);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            
            await logAction(req, email, 'Login');

            console.log(`✅ Успешный вход: ${email}`);
            res.json({ 
                success: true, 
                name: user.Name,
                email: user.Email,
                createdAt: user.CreatedAt 
            });
        } else {
            res.status(401).json({ success: false, error: 'Неверный email или пароль' });
        }
    } catch (err) {
        console.error('❌ Ошибка при логине:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// SAVE RESULT
app.post('/api/save-result', async (req, res) => {
    const { userEmail, testTitle, totalScore, verdict, mood } = req.body;

    if (!userEmail || !testTitle) {
        return res.status(400).json({ success: false, error: 'Недостаточно данных' });
    }

    try {
        await pool.request()
            .input('email', sql.NVarChar, userEmail)
            .input('testTitle', sql.NVarChar, testTitle)
            .input('score', sql.Int, totalScore || 0)
            .input('verdict', sql.NVarChar, verdict || null)
            .input('mood', sql.Int, mood || null)
            .query(`INSERT INTO TestResults 
                    (UserEmail, TestTitle, Score, Verdict, Mood, CreatedAt)
                    VALUES (@email, @testTitle, @score, @verdict, @mood, GETDATE())`);

        console.log(`✅ Результат теста сохранён для ${userEmail} | ${testTitle} (${totalScore})`);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка сохранения результата:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================== GEMINI AI ======================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(prompt) {
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
                        temperature: 0.75,
                        maxOutputTokens: 1200
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`Gemini API error ${response.status}:`, errorText);

            if (response.status === 429) throw new Error('Лимит запросов Gemini исчерпан');
            if (response.status === 503) throw new Error('Gemini временно перегружен');

            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
            return "Извините, я не смог обработать ваш запрос. Попробуйте перефразировать.";
        }

        return data.candidates[0].content?.parts?.[0]?.text?.trim() || "Пустой ответ от ИИ.";
    } catch (err) {
        console.error('❌ Ошибка callGemini:', err.message);
        return "Прости, я сейчас немного перегружена. Попробуй через минуту ❤️";
    }
}

app.post('/api/ai-chat', async (req, res) => {
    const { message, mode = 'chat', history = [] } = req.body;

    let systemPrompt = `Ты — MindMirror AI, очень мягкий, эмпатичный и мудрый психологический помощник. 
Ты помогаешь людям разбираться в своих мыслях и эмоциях. 
Говори спокойно, поддерживающе, без нравоучений. 
Всегда отвечай на русском языке.`;

    if (mode === 'reframe') systemPrompt += `\n\nПользователь хочет переформулировать негативную мысль. Предложи 3 варианта: нейтральный и позитивный.`;
    else if (mode === 'analyze') systemPrompt += `\n\nРазбери ситуацию пользователя мягко: эмоции, возможные причины, рекомендации.`;
    else if (mode === 'crisis') systemPrompt += `\n\nЭто кризисный режим. Будь максимально заботливым. При необходимости мягко предложи горячую линию 8-800-2000-122.`;
    else if (mode === 'diary') systemPrompt += `\n\nПроанализируй запись из дневника: выдели эмоции и дай короткий поддерживающий инсайт.`;

    let fullPrompt = systemPrompt + '\n\nИстория разговора:\n';
    history.forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'Пользователь' : 'MindMirror'}: ${msg.content}\n`;
    });
    fullPrompt += `Пользователь: ${message}`;

    try {
        const aiResponse = await callGemini(fullPrompt);
        res.json({ response: aiResponse });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            response: 'Прости, я сейчас немного перегружена. Попробуй через минуту ❤️' 
        });
    }
});

// ==================== RESEND API ====================
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@example.com';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ==================== МАРШРУТ ПОДДЕРЖКИ ====================
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ 
            success: false, 
            error: 'Все поля обязательны' 
        });
    }

    if (!resend) {
        return res.status(500).json({ 
            success: false, 
            error: 'Почтовый сервис не настроен (RESEND_API_KEY отсутствует)' 
        });
    }

    try {
        await resend.emails.send({
            from: 'MindMirror Support <onboarding@resend.dev>',
            replyTo: email,
            to: SUPPORT_EMAIL,
            subject: `MindMirror Поддержка: ${subject} — от ${name}`,
            text: `Имя: ${name}\nEmail для ответа: ${email}\nТема: ${subject}\n\nСообщение:\n${message}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background:#f9fafb;">
                    <h2 style="color: #6366f1;">Новое сообщение в поддержку MindMirror</h2>
                    <p><strong>От:</strong> ${name} (${email})</p>
                    <p><strong>Тема:</strong> ${subject}</p>
                    <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                    <div style="background:white; padding:15px; border-radius:8px; white-space: pre-wrap; line-height: 1.6;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <br>
                    <small style="color: #6b7280;">Отправлено: ${new Date().toLocaleString('ru-RU')}</small>
                </div>
            `
        });

        console.log(`✅ Письмо в поддержку отправлено на ${SUPPORT_EMAIL}`);

        await logAction(req, email, `Contact: ${subject}`);

        res.json({ 
            success: true, 
            message: 'Сообщение успешно отправлено! Спасибо, мы скоро свяжемся ❤️' 
        });
    } catch (err) {
        console.error('❌ Ошибка Resend:', err.message || err);
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось отправить сообщение. Попробуйте позже.' 
        });
    }
});

// ==================== UPDATE PROFILE ====================
app.put('/api/profile', async (req, res) => {
    const { email, name, avatar } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email обязателен' });
    }

    try {
        let query = `UPDATE Users SET `;
        const request = pool.request().input('email', sql.NVarChar, email);
        let hasUpdate = false;

        if (name !== undefined && name !== null) {
            query += `Name = @name, `;
            request.input('name', sql.NVarChar, name);
            hasUpdate = true;
        }
        if (avatar !== undefined && avatar !== null) {
            query += `Avatar = @avatar, `;
            request.input('avatar', sql.NVarChar, avatar);
            hasUpdate = true;
        }

        if (!hasUpdate) {
            return res.status(400).json({ success: false, error: 'Нет данных для обновления' });
        }

        query = query.replace(/,\s*$/, ` WHERE Email = @email`);

        await request.query(query);

        await logAction(req, email, 'Profile Update');

        res.json({ success: true, message: 'Профиль успешно обновлён ✅' });
    } catch (err) {
        console.error('Ошибка обновления профиля:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === СБОР ОТЗЫВОВ ===

app.get('/api/feedback', async (req, res) => {
    try {
        const result = await pool.request()
            .query(`SELECT Id, UserEmail, Rating, Comment, CreatedAt 
                    FROM Feedback 
                    ORDER BY CreatedAt DESC`);

        res.json({ success: true, feedback: result.recordset });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/feedback', async (req, res) => {
    const { userEmail, rating, comment } = req.body;

    if (!userEmail || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'Некорректные данные' });
    }

    try {
        await pool.request()
            .input('email', sql.NVarChar, userEmail)
            .input('rating', sql.Int, rating)
            .input('comment', sql.NVarChar, comment || null)
            .query(`INSERT INTO Feedback (UserEmail, Rating, Comment)
                    VALUES (@email, @rating, @comment)`);

        res.json({ success: true, message: 'Спасибо за ваш отзыв ❤️' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === АНАЛИЗ ОТЗЫВОВ ===
app.post('/api/analyze-feedback', async (req, res) => {
    try {
        const result = await pool.request()
            .query(`SELECT Rating, Comment, CreatedAt 
                    FROM Feedback 
                    WHERE CreatedAt >= DATEADD(MONTH, -1, GETDATE())
                    ORDER BY CreatedAt DESC`);

        const feedbacks = result.recordset;

        if (feedbacks.length === 0) {
            return res.json({ 
                success: true, 
                analysis: "За последний месяц отзывов ещё нет.",
                totalReviews: 0,
                averageRating: 0
            });
        }

        let promptText = `Проанализируй отзывы пользователей приложения MindMirror за последний месяц.\n\n`;
        promptText += `Всего отзывов: ${feedbacks.length}\nСредний рейтинг: ${(feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length).toFixed(1)}\n\n`;

        feedbacks.forEach((f, i) => {
            promptText += `Отзыв ${i+1}: Рейтинг ${f.Rating}/5 — "${f.Comment || 'Без комментария'}"\n`;
        });

        promptText += `\nДай подробный анализ на русском языке в следующем формате:\n
1. Общая оценка и тон отзывов.
2. Главные плюсы приложения.
3. Главные проблемы и что нужно улучшить.
4. Самые частые пожелания пользователей.
5. Ключевые цитаты (3–5 штук).
6. Конкретные рекомендации для разработчика.`;

        const aiResponse = await callGemini(promptText);

        res.json({ 
            success: true, 
            analysis: aiResponse,
            totalReviews: feedbacks.length,
            averageRating: feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length
        });

    } catch (err) {
        console.error('Ошибка анализа отзывов:', err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Не удалось выполнить анализ. Попробуйте позже.' 
        });
    }
});

// ====================== КОНСУЛЬТАЦИЯ С ПСИХОЛОГОМ ======================
app.post('/api/book-consultation', async (req, res) => {
    const { userEmail, topic, preferredDate, notes } = req.body;

    if (!userEmail || !topic || !preferredDate) {
        return res.status(400).json({ success: false, error: 'Заполните все обязательные поля' });
    }

    try {
        await pool.request()
            .input('email', sql.NVarChar, userEmail)
            .input('topic', sql.NVarChar, topic)
            .input('date', sql.DateTime, new Date(preferredDate))
            .input('notes', sql.NVarChar, notes || null)
            .query(`
                INSERT INTO Consultations (UserEmail, Topic, PreferredDate, Notes)
                VALUES (@email, @topic, @date, @notes)
            `);

        if (resend) {
            await resend.emails.send({
                from: 'MindMirror Support <onboarding@resend.dev>',
                replyTo: userEmail,
                to: [SUPPORT_EMAIL],
                subject: `НОВАЯ ЗАПИСЬ НА КОНСУЛЬТАЦИЮ — ${topic}`,
                html: `
                    <h2>Новая запись на консультацию</h2>
                    <p><strong>Пользователь:</strong> ${userEmail}</p>
                    <p><strong>Тема:</strong> ${topic}</p>
                    <p><strong>Желаемое время:</strong> ${new Date(preferredDate).toLocaleString('ru-RU')}</p>
                    ${notes ? `<p><strong>Комментарий:</strong><br>${notes.replace(/\n/g, '<br>')}</p>` : ''}
                    <hr>
                    <small>Статус: ожидает подтверждения</small>
                `
            });
        }

        await logAction(req, userEmail, `Booked consultation: ${topic}`);

        res.json({ 
            success: true, 
            message: 'Заявка на консультацию успешно отправлена! Психолог свяжется с вами в ближайшее время ❤️' 
        });

    } catch (err) {
        console.error('Ошибка записи на консультацию:', err);
        res.status(500).json({ success: false, error: 'Не удалось записаться' });
    }
});

// ====================== ИСТОРИЯ КОНСУЛЬТАЦИЙ ======================
app.get('/api/consultations', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email обязателен' });
    }

    try {
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT Id, Topic, PreferredDate, Status, Notes, CreatedAt 
                FROM Consultations 
                WHERE UserEmail = @email 
                ORDER BY PreferredDate DESC
            `);

        res.json({
            success: true,
            consultations: result.recordset
        });
    } catch (err) {
        console.error('Ошибка получения истории консультаций:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// ====================== ОТМЕНА КОНСУЛЬТАЦИИ ======================
app.post('/api/cancel-consultation', async (req, res) => {
    const { id, userEmail } = req.body;

    if (!id || !userEmail) {
        return res.status(400).json({ success: false, error: 'Недостаточно данных' });
    }

    try {
        const check = await pool.request()
            .input('id', sql.Int, id)
            .input('email', sql.NVarChar, userEmail)
            .query(`SELECT Id, Status FROM Consultations WHERE Id = @id AND UserEmail = @email`);

        if (check.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Консультация не найдена' });
        }

        if (check.recordset[0].Status?.toLowerCase() === 'cancelled') {
            return res.status(400).json({ success: false, error: 'Консультация уже отменена' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE Consultations SET Status = 'cancelled' WHERE Id = @id`);

        await logAction(req, userEmail, `Cancelled consultation #${id}`);

        res.json({ success: true, message: 'Консультация успешно отменена' });
    } catch (err) {
        console.error('Ошибка отмены консультации:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// ====================== PREMIUM ПОДПИСКА ======================

app.get('/api/subscription/status', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, error: 'Email обязателен' });

    try {
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT IsPremium, PremiumUntil 
                FROM Users 
                WHERE Email = @email
            `);

        const user = result.recordset[0];
        const isActive = user && user.IsPremium === true && 
                        (!user.PremiumUntil || new Date(user.PremiumUntil) > new Date());

        res.json({
            success: true,
            isPremium: isActive,
            until: user ? user.PremiumUntil : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Ошибка базы данных' });
    }
});

app.post('/api/subscribe', async (req, res) => {
    const { email, plan = 'monthly', amount = 990, cardLast4 = '4242' } = req.body;

    if (!email) return res.status(400).json({ success: false, error: 'Email обязателен' });

    try {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('until', sql.DateTime, endDate)
            .query(`
                UPDATE Users 
                SET IsPremium = 1, 
                    PremiumUntil = @until 
                WHERE Email = @email
            `);

        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('plan', sql.NVarChar, plan)
            .input('amount', sql.Decimal, amount)
            .input('card', sql.NVarChar, `•••• ${cardLast4}`)
            .input('endDate', sql.DateTime, endDate)
            .query(`
                INSERT INTO Subscriptions 
                (UserEmail, PlanType, Amount, PaymentMethod, EndDate, Status)
                VALUES (@email, @plan, @amount, @card, @endDate, 'active')
            `);

        console.log(`💎 Premium активирован для ${email} до ${endDate.toLocaleDateString('ru-RU')}`);

        res.json({ 
            success: true, 
            message: 'Premium успешно активирован!',
            until: endDate
        });
    } catch (err) {
        console.error('Subscribe error:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка при оформлении подписки' });
    }
});

app.post('/api/subscription/cancel', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email обязателен' });

    try {
        await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                UPDATE Users 
                SET IsPremium = 0 
                WHERE Email = @email
            `);

        await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                UPDATE Subscriptions 
                SET Status = 'cancelled' 
                WHERE UserEmail = @email AND Status = 'active'
            `);

        console.log(`❌ Подписка отменена для ${email}`);

        res.json({ 
            success: true, 
            message: 'Подписка отменена' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Ошибка при отмене подписки' });
    }
});

app.get('/api/subscriptions/stats', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT 
                COUNT(*) as total_subscribers,
                ISNULL(SUM(Amount), 0) as total_revenue,
                COUNT(CASE WHEN Status = 'active' AND (EndDate IS NULL OR EndDate > GETDATE()) THEN 1 END) as active_subscribers,
                ISNULL(SUM(CASE WHEN Status = 'active' AND (EndDate IS NULL OR EndDate > GETDATE()) THEN Amount ELSE 0 END), 0) as monthly_revenue
            FROM Subscriptions
        `);

        res.json({ success: true, stats: result.recordset[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/subscriptions/recent', async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT TOP 10 
                UserEmail,
                Amount,
                PaymentMethod,
                StartDate,
                Status
            FROM Subscriptions 
            ORDER BY StartDate DESC
        `);

        res.json({ success: true, subscriptions: result.recordset });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Запуск сервера
connectToDb().then(() => {
    
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/mindmirror.html');
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, '0.0.0.0', () => {
        console.log('🚀 Сервер успешно запущен!');
        console.log(`🌐 Локально: http://localhost:${PORT}`);
    });
});