Select *
From TestResults

Select *
From Consultations

Select *
From UserLogins

Select*
From Feedback

Select *
From Users

-- Выполни это в SSMS
SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Subscriptions';

TRUNCATE TABLE TestResults;

TRUNCATE TABLE UserLogins;

TRUNCATE TABLE Users;

TRUNCATE TABLE Consultations;

TRUNCATE TABLE Feedback
