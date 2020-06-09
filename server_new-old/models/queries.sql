s350Queries

    brigadeQuery:
        SELECT ID
        FROM [L2Mill].[dbo].[Brigada]
        WHERE BCur > 0;

    delayQuery:
        SELECT
            [DELAY_DATETIME] as start,
            [FINISH_DELAY_DATETIME] as finish
        FROM
            [L2Mill].[dbo].[L2_DELAY_HALTLFM1]
        WHERE
            [DELAY_DATETIME] < @shift_end
            AND [FINISH_DELAY_DATETIME] > @shift_start;

    statsQuery:
        CREATE TABLE #sheldule (
            id_sheldule TINYINT IDENTITY,
            brigade TINYINT
        );
        INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);

        CREATE TABLE #billets (
            [ID] INT IDENTITY,
            [SHIFT] [numeric](9, 0) NULL,
            [BRIGADE] [numeric](9, 0) NULL,
            [COUNT] [numeric](9) NULL,
            [COUNTGB] [numeric](9) NULL,
            [BILLETWEIGHT] [numeric](9) NULL,
        );

        INSERT INTO #billets ([SHIFT],[BRIGADE],[COUNT],[COUNTGB],[BILLETWEIGHT])
        SELECT
            DATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12 as [SHIFT],
            MAX(brigade) as [BRIGADE],
            SUM(CASE EVENT WHEN 0 THEN 1 ELSE 0 END) as [COUNT],
            SUM(CASE EVENT WHEN -10 THEN 1 WHEN -11 THEN 1 ELSE 0 END) as [COUNTGB],
            SUM(CASE EVENT WHEN 0 THEN [BILLET_WEIGHT] ELSE 0 END) as [BILLETWEIGHT]
        FROM
            [L2Mill].[dbo].[L2_PO_BILLET] LEFT JOIN #sheldule
                ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12) % 8 + 1
        WHERE
            [DATE_RECORD] > @monthBegin
        GROUP BY DATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12
        ORDER BY [SHIFT];

        SELECT
            DATEADD(SECOND, [SHIFT] * 43200, '20140602 08:00:00') AS beginTS,
            DATEADD(SECOND, ([SHIFT] + 1) * 43200 - 1, '20140602 08:00:00') AS endTS,
            LAST_MONTH.BRIGADE as brigade,
            [SHIFT_COUNT] as shiftCount,
            [SHIFT_WEIGHT] as shiftWeight,
            [MONTH_COUNT] as monthCount,
            [MONTH_WEIGHT] as monthWeight
        FROM (
            SELECT
                [BRIGADE],
                [SHIFT],
                SUM([COUNT]) as [SHIFT_COUNT],
                SUM([BILLETWEIGHT]) as [SHIFT_WEIGHT]
            FROM #billets
            WHERE [SHIFT] IN (
                SELECT MAX(SHIFT)
                FROM #billets
                GROUP BY [BRIGADE]
            )
            GROUP BY [BRIGADE], [SHIFT]
        ) AS LAST_SHIFT
        LEFT JOIN (
            SELECT
                [BRIGADE],
                SUM([COUNT]) as [MONTH_COUNT],
                SUM([BILLETWEIGHT]) as [MONTH_WEIGHT]
            FROM #billets
            GROUP BY [BRIGADE]) AS LAST_MONTH ON LAST_SHIFT.BRIGADE = LAST_MONTH.BRIGADE
        ORDER BY brigade DESC;

    getCurDelay:
        SELECT TOP (1) [DELAY_DATETIME] AS delayStart
        FROM [L2Mill].[dbo].[L2_DELAY_HALTLFM1]
        WHERE [FINISH_DELAY_DATETIME] IS NULL
        ORDER BY [DELAY_DATETIME] DESC;

    getDevPlan:
        SELECT
            CONVERT(date, [ts]) date,
            DATEPART(hour, [ts]) AS hour,
            [s350],
            [s210]
        FROM [L2Mill].[dbo].[DevelopmentPlan]
        WHERE CONVERT(date, [ts]) = @ts;

    insertDevPlanRecord:
        INSERT INTO [L2Mill].[dbo].[DevelopmentPlan]([ts],[s350],[s210])
        VALUES (@ts ,@s350 ,@s210);

    updateDevPlanRecord:
        UPDATE [L2Mill].[dbo].[DevelopmentPlan]
        SET
            [s350] = @s350,
            [s210] = @s210
        WHERE ts=@ts;

    planProduction:
        CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);
        INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);

        SELECT brigade, ISNULL(SUM([s350]),0) AS s350, ISNULL(SUM([s210]),0) AS s210
        FROM (
            SELECT
                s350,
                s210,
                brigade
            FROM
                [L2Mill].[dbo].[DevelopmentPlan] LEFT JOIN #sheldule
                    ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', ts) / 12) % 8 + 1
            WHERE
                ts BETWEEN @period_start AND @period_end) as 'plan'
        GROUP BY brigade;

        DROP TABLE #sheldule;

    spcTemperature:
        SELECT TOP (1) [tempspc]
        FROM [L2Mill].[dbo].[temperature];


s210Queries

    delayQuery:
        SELECT
            [START_DELAY] as start,
            [END_DELAY] as finish
        FROM
            [ABINSK_RMRT].[dbo].[STP_STOPPAGE]
        WHERE
            [START_DELAY] < @shift_end
            AND [END_DELAY] > @shift_start;

    statsQuery:
        CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);
        INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);

        CREATE TABLE #billets (
            [ID] INT IDENTITY,
            [SHIFT] [numeric](9, 0) NULL,
            [BRIGADE] [numeric](9, 0) NULL,
            [COUNT] [numeric](9) NULL,
            [COUNTGB] [numeric](9) NULL,
            [BILLETWEIGHT] [numeric](9) NULL,
        );

        INSERT INTO #billets ([SHIFT],[BRIGADE],[COUNT],[COUNTGB],[BILLETWEIGHT])
        SELECT
            DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12 as [SHIFT],
            MAX(brigade) as [BRIGADE],
            SUM(CASE SEMIPRODUCT_STATUS WHEN 100 THEN 1 ELSE 0 END) as [COUNT],
            SUM(CASE SEMIPRODUCT_STATUS WHEN 110 THEN 1 WHEN -11 THEN 1 ELSE 0 END) as [COUNTGB],
            SUM(CASE SEMIPRODUCT_STATUS WHEN 100 THEN [SEMIPRODUCT_WGT] ELSE 0 END) as [BILLETWEIGHT]
        FROM
            [RML_SEMIPRODUCT] LEFT JOIN #sheldule
                ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12) % 8 + 1
        WHERE
            [ROLLING_DATE] > @monthBegin
        GROUP BY
            DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12
        ORDER BY [SHIFT];

        SELECT
            DATEADD(SECOND, [SHIFT] * 43200, '20140602 08:00:00') AS beginTS,
            DATEADD(SECOND, ([SHIFT] + 1) * 43200 - 1, '20140602 08:00:00') AS endTS,
            LAST_MONTH.BRIGADE as brigade,
            [SHIFT_COUNT] as shiftCount,
            [SHIFT_WEIGHT] as shiftWeight,
            [MONTH_COUNT] as monthCount,
            [MONTH_WEIGHT] as monthWeight
        FROM (
            SELECT
                [BRIGADE],
                [SHIFT],
                SUM([COUNT]) as [SHIFT_COUNT],
                SUM([BILLETWEIGHT]) as [SHIFT_WEIGHT]
            FROM #billets
            WHERE
                [SHIFT] IN (
                    SELECT
                        MAX(SHIFT)
                    FROM #billets
                    GROUP BY [BRIGADE]
                )
            GROUP BY
                [BRIGADE],
                [SHIFT]
        ) AS LAST_SHIFT LEFT JOIN (
            SELECT
                [BRIGADE],
                SUM([COUNT]) as [MONTH_COUNT],
                SUM([BILLETWEIGHT]) as [MONTH_WEIGHT]
            FROM #billets
            GROUP BY [BRIGADE]
        ) AS LAST_MONTH ON LAST_SHIFT.BRIGADE = LAST_MONTH.BRIGADE
        ORDER BY brigade DESC;

    getCurDelay:
        SELECT TOP (1) [START_DELAY] AS delayStart
        FROM [ABINSK_RMRT].[dbo].[STP_STOPPAGE]
        WHERE [STOP_STATUS] = 1
        ORDER BY [START_DELAY] DESC;


espcQueries

    temperature:
        SELECT outside_temperature FROM operative;
