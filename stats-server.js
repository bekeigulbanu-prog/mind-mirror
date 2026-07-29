// ====================== STATS SERVER - Отдельный сервер для аналитики ======================
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'MindMirrorDB',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 15000,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool;

async function connectToDb(retries = 3) {
    for (let i = 1; i <= retries; i++) {
        try {
            pool = await sql.connect(dbConfig);
            console.log('✅ Stats-сервер успешно подключён к базе данных MindMirrorDB');
            return;
        } catch (err) {
            console.error(`❌ Попытка ${i}/${retries} подключения к БД не удалась:`, err.message);
            if (i === retries) throw err;
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

// ====================== МАРШРУТ СТАТИСТИКИ ======================
app.get('/api/stats/visits', async (req, res) => {
    if (!pool) {
        return res.status(503).json({
            success: false,
            error: 'База данных ещё не подключена. Попробуйте позже.'
        });
    }

    try {
        const stats = {};

        const totalUsersQuery = await pool.request().query(`
            SELECT COUNT(*) as total_registered FROM Users
        `);

        const totalLoginsQuery = await pool.request().query(`
            SELECT COUNT(*) as total_logins,
                   COUNT(DISTINCT UserEmail) as unique_users 
            FROM UserLogins
        `);

        const todayQuery = await pool.request().query(`
            SELECT COUNT(*) as total_logins,
                   COUNT(DISTINCT UserEmail) as unique_users 
            FROM UserLogins 
            WHERE CAST(LoginTime AS DATE) = CAST(GETDATE() AS DATE)
        `);

        const getPeriodStats = async (days) => {
            const whereClause = days === 'year' 
                ? `WHERE LoginTime >= DATEADD(DAY, -365, GETDATE())`
                : `WHERE LoginTime >= DATEADD(DAY, -${days}, GETDATE())`;
            
            return await pool.request().query(`
                SELECT COUNT(*) as total_logins,
                       COUNT(DISTINCT UserEmail) as unique_users 
                FROM UserLogins 
                ${whereClause}
            `);
        };

        stats.total_registered = totalUsersQuery.recordset[0].total_registered;
        stats.all_time       = totalLoginsQuery.recordset[0];
        stats.today          = todayQuery.recordset[0];
        stats.last3days      = (await getPeriodStats(3)).recordset[0];
        stats.last7days      = (await getPeriodStats(7)).recordset[0];
        stats.last30days     = (await getPeriodStats(30)).recordset[0];
        stats.lastYear       = (await getPeriodStats('year')).recordset[0];

        res.json({
            success: true,
            stats: stats
        });

    } catch (err) {
        console.error('Ошибка получения статистики:', err.message);
        res.status(500).json({
            success: false,
            error: 'Не удалось загрузить статистику посещений'
        });
    }
});

// ====================== ЗАПУСК СЕРВЕРА ======================
connectToDb()
    .then(() => {
        const PORT = process.env.STATS_PORT || 3002;

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Stats-сервер запущен на порту ${PORT}`);
            console.log(`🌐 Эндпоинт: http://localhost:${PORT}/api/stats/visits`);
        });
    })
    .catch(err => {
        console.error('💥 Критическая ошибка запуска stats-сервера:', err.message);
        process.exit(1);
    });