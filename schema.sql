/* =========================================================================
   MindMirror — DDL-скрипт создания структуры базы данных
   СУБД: Microsoft SQL Server
   База: MindMirrorDB

   Схема восстановлена по фактическим SQL-запросам в server.js,
   analyze-server.js и stats-server.js. Скрипт идемпотентен: таблицы
   создаются только если ещё не существуют, что позволяет выполнять
   его повторно без ошибок.
   ========================================================================= */

/* -------------------------------------------------------------------------
   0. Создание базы данных (пропустите этот блок, если база уже создана)
   ------------------------------------------------------------------------- */
IF DB_ID('MindMirrorDB') IS NULL
BEGIN
    CREATE DATABASE MindMirrorDB;
END
GO

USE MindMirrorDB;
GO

/* -------------------------------------------------------------------------
   1. Users — учётные записи пользователей
      Используется в: /api/register, /api/login, /api/profile,
                      /api/subscription/status, /api/subscribe
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id            INT             IDENTITY(1,1) PRIMARY KEY,
        Name          NVARCHAR(200)   NOT NULL,
        Email         NVARCHAR(320)   NOT NULL,
        Password      NVARCHAR(255)   NOT NULL,   -- ⚠ хранить хэш (bcrypt/argon2), не открытый текст
        Avatar        NVARCHAR(MAX)   NULL,       -- URL или base64-аватар профиля
        IsPremium     BIT             NOT NULL DEFAULT (0),
        PremiumUntil  DATETIME        NULL,
        CreatedAt     DATETIME        NOT NULL DEFAULT (GETDATE()),

        CONSTRAINT UQ_Users_Email UNIQUE (Email)
    );
END
GO

/* -------------------------------------------------------------------------
   2. UserLogins — журнал действий пользователей (регистрация, вход,
      обновление профиля и т.д.), используется также для статистики
      посещений (stats-server.js)
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.UserLogins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserLogins (
        Id          INT             IDENTITY(1,1) PRIMARY KEY,
        UserEmail   NVARCHAR(320)   NOT NULL,
        ActionType  NVARCHAR(100)   NOT NULL,      -- напр. 'Login', 'Register', 'Profile Update'
        IPAddress   NVARCHAR(64)    NULL,
        LoginTime   DATETIME        NOT NULL DEFAULT (GETDATE())
    );

    CREATE INDEX IX_UserLogins_UserEmail ON dbo.UserLogins (UserEmail);
    CREATE INDEX IX_UserLogins_LoginTime ON dbo.UserLogins (LoginTime);
END
GO

/* -------------------------------------------------------------------------
   3. TestResults — результаты прохождения психологических тестов
      Используется в: /api/save-result
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.TestResults', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TestResults (
        Id         INT             IDENTITY(1,1) PRIMARY KEY,
        UserEmail  NVARCHAR(320)   NOT NULL,
        TestTitle  NVARCHAR(255)   NOT NULL,
        Score      INT             NULL,
        Verdict    NVARCHAR(MAX)   NULL,           -- текстовый вывод/интерпретация теста
        Mood       INT             NULL,           -- числовая оценка настроения
        CreatedAt  DATETIME        NOT NULL DEFAULT (GETDATE())
    );

    CREATE INDEX IX_TestResults_UserEmail ON dbo.TestResults (UserEmail);
END
GO

/* -------------------------------------------------------------------------
   4. Feedback — отзывы пользователей о приложении
      Используется в: /api/feedback (GET/POST), /api/analyze-feedback
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.Feedback', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Feedback (
        Id         INT             IDENTITY(1,1) PRIMARY KEY,
        UserEmail  NVARCHAR(320)   NOT NULL,
        Rating     INT             NOT NULL,
        Comment    NVARCHAR(MAX)   NULL,
        CreatedAt  DATETIME        NOT NULL DEFAULT (GETDATE()),

        CONSTRAINT CK_Feedback_Rating CHECK (Rating BETWEEN 1 AND 5)
    );

    CREATE INDEX IX_Feedback_CreatedAt ON dbo.Feedback (CreatedAt);
END
GO

/* -------------------------------------------------------------------------
   5. Consultations — заявки на консультацию психолога
      Используется в: /api/book-consultation, /api/consultations,
                      /api/cancel-consultation
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.Consultations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Consultations (
        Id             INT             IDENTITY(1,1) PRIMARY KEY,
        UserEmail      NVARCHAR(320)   NOT NULL,
        Topic          NVARCHAR(255)   NOT NULL,
        PreferredDate  DATETIME        NOT NULL,
        Notes          NVARCHAR(MAX)   NULL,
        Status         NVARCHAR(50)    NOT NULL DEFAULT ('pending'),  -- pending | confirmed | cancelled
        CreatedAt      DATETIME        NOT NULL DEFAULT (GETDATE())
    );

    CREATE INDEX IX_Consultations_UserEmail ON dbo.Consultations (UserEmail);
END
GO

/* -------------------------------------------------------------------------
   6. Subscriptions — история Premium-подписок и платежей
      Используется в: /api/subscribe, /api/subscription/cancel,
                      /api/subscriptions/stats, /api/subscriptions/recent
   ------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.Subscriptions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Subscriptions (
        Id             INT             IDENTITY(1,1) PRIMARY KEY,
        UserEmail      NVARCHAR(320)   NOT NULL,
        PlanType       NVARCHAR(50)    NOT NULL,             -- напр. 'monthly'
        Amount         DECIMAL(10,2)   NOT NULL,
        PaymentMethod  NVARCHAR(50)    NULL,                 -- напр. '•••• 4242'
        StartDate      DATETIME        NOT NULL DEFAULT (GETDATE()),
        EndDate        DATETIME        NULL,
        Status         NVARCHAR(50)    NOT NULL DEFAULT ('active'),  -- active | cancelled

        CONSTRAINT CK_Subscriptions_Status CHECK (Status IN ('active', 'cancelled'))
    );

    CREATE INDEX IX_Subscriptions_UserEmail ON dbo.Subscriptions (UserEmail);
    CREATE INDEX IX_Subscriptions_Status    ON dbo.Subscriptions (Status);
END
GO

/* =========================================================================
   Готово. Проверить созданные таблицы можно так же, как в MindMirror.sql:

   SELECT * FROM Users;
   SELECT * FROM UserLogins;
   SELECT * FROM TestResults;
   SELECT * FROM Feedback;
   SELECT * FROM Consultations;
   SELECT * FROM Subscriptions;
   ========================================================================= */
