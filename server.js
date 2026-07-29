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
        console.error('❌ Ошибка подкconst express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config(); // npm install dotenv

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ========== Database Configuration ==========
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
        console.log('✅ Successfully connected to the MindMirrorDB database');
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        console.error('Check: SQL Server is running, server name, login/password, and firewall.');
    }
}

// Action Logging
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
        console.error('Logging error:', e.message);
    }
}

// REGISTER
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Please fill in all fields' });
    }

    try {
        const existing = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT Id FROM Users WHERE Email = @email');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ success: false, error: 'This email is already registered' });
        }

        await pool.request()
            .input('name', sql.NVarChar, name)
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password) // Use bcrypt in production!
            .query(`INSERT INTO Users (Name, Email, Password, CreatedAt) 
                    VALUES (@name, @email, @password, GETDATE())`);

        await logAction(req, email, 'Register');

        console.log(`✅ New user registered: ${email}`);
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
        return res.status(400).json({ success: false, error: 'Enter email and password' });
    }

    try {
        console.log(`Login attempt: ${email}`);

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

            console.log(`✅ Successful login: ${email}`);
            res.json({ 
                success: true, 
                name: user.Name,
                email: user.Email,
                createdAt: user.CreatedAt 
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
    } catch (err) {
        console.error('❌ Login error:', err.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// SAVE RESULT
app.post('/api/save-result', async (req, res) => {
    const { userEmail, testTitle, totalScore, verdict, mood } = req.body;

    if (!userEmail || !testTitle) {
        return res.status(400).json({ success: false, error: 'Insufficient data' });
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

        console.log(`✅ Test result saved for ${userEmail} | ${testTitle} (${totalScore})`);
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving result:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================== GEMINI AI ======================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function callGemini(prompt) {
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
                        temperature: 0.75,
                        maxOutputTokens: 1200
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`Gemini API error ${response.status}:`, errorText);

            if (response.status === 429) throw new Error('Gemini rate limit exceeded');
            if (response.status === 503) throw new Error('Gemini is temporarily overloaded');

            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0) {
            return "Sorry, I was unable to process your request. Please try rephrasing.";
        }

        return data.candidates[0].content?.parts?.[0]?.text?.trim() || "Empty response from AI.";
    } catch (err) {
        console.error('❌ callGemini error:', err.message);
        return "Sorry, I'm a bit overloaded right now. Please try again in a minute ❤️";
    }
}

app.post('/api/ai-chat', async (req, res) => {
    const { message, mode = 'chat', history = [] } = req.body;

    let systemPrompt = `You are MindMirror AI, a very gentle, empathetic, and wise psychological assistant. 
You help people navigate their thoughts and emotions. 
Speak calmly, supportively, and without preaching. 
Always respond in English.`;

    if (mode === 'reframe') systemPrompt += `\n\nThe user wants to reframe a negative thought. Offer 3 options: neutral and positive ones.`;
    else if (mode === 'analyze') systemPrompt += `\n\nAnalyze the user's situation gently: emotions, possible causes, and recommendations.`;
    else if (mode === 'crisis') systemPrompt += `\n\nThis is crisis mode. Be as caring as possible. If necessary, gently suggest a helpline.`;
    else if (mode === 'diary') systemPrompt += `\n\nAnalyze the diary entry: identify emotions and provide a brief supportive insight.`;

    let fullPrompt = systemPrompt + '\n\nConversation history:\n';
    history.forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'User' : 'MindMirror'}: ${msg.content}\n`;
    });
    fullPrompt += `User: ${message}`;

    try {
        const aiResponse = await callGemini(fullPrompt);
        res.json({ response: aiResponse });
    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            response: "Sorry, I'm a bit overloaded right now. Please try again in a minute ❤️" 
        });
    }
});

// ==================== RESEND API ====================
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@example.com';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ==================== SUPPORT ROUTE ====================
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ 
            success: false, 
            error: 'All fields are required' 
        });
    }

    if (!resend) {
        return res.status(500).json({ 
            success: false, 
            error: 'Email service is not configured (RESEND_API_KEY is missing)' 
        });
    }

    try {
        await resend.emails.send({
            from: 'MindMirror Support <onboarding@resend.dev>',
            replyTo: email,
            to: SUPPORT_EMAIL,
            subject: `MindMirror Support: ${subject} — from ${name}`,
            text: `Name: ${name}\nReply-To Email: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background:#f9fafb;">
                    <h2 style="color: #6366f1;">New message to MindMirror support</h2>
                    <p><strong>From:</strong> ${name} (${email})</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                    <div style="background:white; padding:15px; border-radius:8px; white-space: pre-wrap; line-height: 1.6;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                    <br>
                    <small style="color: #6b7280;">Sent: ${new Date().toLocaleString('en-US')}</small>
                </div>
            `
        });

        console.log(`✅ Support email sent to ${SUPPORT_EMAIL}`);

        await logAction(req, email, `Contact: ${subject}`);

        res.json({ 
            success: true, 
            message: 'Message sent successfully! Thank you, we will contact you soon ❤️' 
        });
    } catch (err) {
        console.error('❌ Resend error:', err.message || err);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send message. Please try again later.' 
        });
    }
});

// ==================== UPDATE PROFILE ====================
app.put('/api/profile', async (req, res) => {
    const { email, name, avatar } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
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
            return res.status(400).json({ success: false, error: 'No data to update' });
        }

        query = query.replace(/,\s*$/, ` WHERE Email = @email`);

        await request.query(query);

        await logAction(req, email, 'Profile Update');

        res.json({ success: true, message: 'Profile updated successfully ✅' });
    } catch (err) {
        console.error('Profile update error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === FEEDBACK COLLECTION ===

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
        return res.status(400).json({ success: false, error: 'Invalid data' });
    }

    try {
        await pool.request()
            .input('email', sql.NVarChar, userEmail)
            .input('rating', sql.Int, rating)
            .input('comment', sql.NVarChar, comment || null)
            .query(`INSERT INTO Feedback (UserEmail, Rating, Comment)
                    VALUES (@email, @rating, @comment)`);

        res.json({ success: true, message: 'Thank you for your feedback ❤️' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === FEEDBACK ANALYSIS ===
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
                analysis: "No reviews found for the past month.",
                totalReviews: 0,
                averageRating: 0
            });
        }

        let promptText = `Analyze user feedback for the MindMirror app over the past month.\n\n`;
        promptText += `Total reviews: ${feedbacks.length}\nAverage rating: ${(feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length).toFixed(1)}\n\n`;

        feedbacks.forEach((f, i) => {
            promptText += `Review ${i+1}: Rating ${f.Rating}/5 — "${f.Comment || 'No comment'}"\n`;
        });

        promptText += `\nProvide a detailed analysis in English in the following format:\n
1. Overall tone and sentiment of the feedback.
2. Main pros of the app.
3. Main issues and areas for improvement.
4. Most common user feature requests.
5. Key quotes (3–5 quotes).
6. Actionable recommendations for the developer.`;

        const aiResponse = await callGemini(promptText);

        res.json({ 
            success: true, 
            analysis: aiResponse,
            totalReviews: feedbacks.length,
            averageRating: feedbacks.reduce((sum, f) => sum + (f.Rating || 0), 0) / feedbacks.length
        });

    } catch (err) {
        console.error('Feedback analysis error:', err.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to perform analysis. Please try again later.' 
        });
    }
});

// ====================== PSYCHOLOGIST CONSULTATION ======================
app.post('/api/book-consultation', async (req, res) => {
    const { userEmail, topic, preferredDate, notes } = req.body;

    if (!userEmail || !topic || !preferredDate) {
        return res.status(400).json({ success: false, error: 'Please fill in all required fields' });
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
                subject: `NEW CONSULTATION BOOKING — ${topic}`,
                html: `
                    <h2>New Consultation Booking</h2>
                    <p><strong>User:</strong> ${userEmail}</p>
                    <p><strong>Topic:</strong> ${topic}</p>
                    <p><strong>Preferred Time:</strong> ${new Date(preferredDate).toLocaleString('en-US')}</p>
                    ${notes ? `<p><strong>Notes:</strong><br>${notes.replace(/\n/g, '<br>')}</p>` : ''}
                    <hr>
                    <small>Status: Pending confirmation</small>
                `
            });
        }

        await logAction(req, userEmail, `Booked consultation: ${topic}`);

        res.json({ 
            success: true, 
            message: 'Consultation request sent successfully! A psychologist will reach out to you shortly ❤️' 
        });

    } catch (err) {
        console.error('Consultation booking error:', err);
        res.status(500).json({ success: false, error: 'Failed to book consultation' });
    }
});

// ====================== CONSULTATION HISTORY ======================
app.get('/api/consultations', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required' });
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
        console.error('Error getting consultation history:', err.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ====================== CANCEL CONSULTATION ======================
app.post('/api/cancel-consultation', async (req, res) => {
    const { id, userEmail } = req.body;

    if (!id || !userEmail) {
        return res.status(400).json({ success: false, error: 'Insufficient data' });
    }

    try {
        const check = await pool.request()
            .input('id', sql.Int, id)
            .input('email', sql.NVarChar, userEmail)
            .query(`SELECT Id, Status FROM Consultations WHERE Id = @id AND UserEmail = @email`);

        if (check.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Consultation not found' });
        }

        if (check.recordset[0].Status?.toLowerCase() === 'cancelled') {
            return res.status(400).json({ success: false, error: 'Consultation is already cancelled' });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE Consultations SET Status = 'cancelled' WHERE Id = @id`);

        await logAction(req, userEmail, `Cancelled consultation #${id}`);

        res.json({ success: true, message: 'Consultation successfully cancelled' });
    } catch (err) {
        console.error('Error cancelling consultation:', err.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ====================== PREMIUM SUBSCRIPTION ======================

app.get('/api/subscription/status', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

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
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

app.post('/api/subscribe', async (req, res) => {
    const { email, plan = 'monthly', amount = 990, cardLast4 = '4242' } = req.body;

    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

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

        console.log(`💎 Premium activated for ${email} until ${endDate.toLocaleDateString('en-US')}`);

        res.json({ 
            success: true, 
            message: 'Premium successfully activated!',
            until: endDate
        });
    } catch (err) {
        console.error('Subscribe error:', err.message);
        res.status(500).json({ success: false, error: 'Error processing subscription' });
    }
});

app.post('/api/subscription/cancel', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

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

        console.log(`❌ Subscription cancelled for ${email}`);

        res.json({ 
            success: true, 
            message: 'Subscription cancelled' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Error cancelling subscription' });
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

// Start Server
connectToDb().then(() => {
    
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/mindmirror.html');
    });

    const PORT = process.env.PORT || 3000;

    app.listen(PORT, '0.0.0.0', () => {
        console.log('🚀 Server successfully started!');
        console.log(`🌐 Local: http://localhost:${PORT}`);
    });
});
