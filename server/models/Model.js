const sql = require('mssql');
const brigades = require('./brigades');
const mysql = require('mysql2');
const config = require('config');
const store = require('data-store')({ path: process.cwd() + '/delay_plan.json' });
const hourlyStore = require('data-store')( {path: process.cwd() + '/hourly.json' } );

let s350Queries = {
    updateBStats: "UPDATE [L2Mill].[dbo].[BrigadaStats] SET [BPercent210] = @percent210, [BWeight210] = @weight210, " + 
        "[BPercent350] = @percent350, [BWeight350] = @weight350 WHERE ID = @currBrigada;",
    setHourStats: "UPDATE [L2Mill].[dbo].[Hourly350] SET [Percent] = @hourPercent, [Weight] = @hourWeight WHERE [Hour] = @currentHour;",
    getHourStats: "SELECT [Hour], [Percent], [Weight] FROM [L2Mill].[dbo].[Hourly350] ORDER BY [Hour];",
    resetHourStats: "UPDATE [L2Mill].[dbo].[Hourly350] SET [Percent] = 100, [Weight] = 0;",
    tmpQuery: "SELECT\n" +
        "[AllPack].[Size],\n" +
        "[AllPack].[Length],\n" +
        "[AllPack].[Weight],\n" +
        "[AllPack].[DataWeight]\n" +
        "FROM [L2Mill].[dbo].[AllPack]\n" +
        "WHERE [AllPack].[DataWeight] BETWEEN @startTS AND @finishTS\n" +
        "ORDER BY [AllPack].[DataWeight] ASC;",
    planProd: "SELECT * FROM [L2Mill].[dbo].[Dev_Plan_350_Profiles]",
    brigadeQuery: "SELECT [ID], [BDate] FROM [L2Mill].[dbo].[Brigada] WHERE BCur > 0",
    allBrigades: "SELECT * FROM [L2Mill].[dbo].[Brigada] ORDER BY [ID]",
    // Получаем список всех остановок стана 350
    delayQuery: "SELECT [DELAY_DATETIME] as start\n" +
        "      ,[FINISH_DELAY_DATETIME] as finish\n" +
        "\n" +
        "  FROM [L2Mill].[dbo].[L2_DELAY_HALTLFM1]\n" +
        "  WHERE [DELAY_DATETIME] < @shift_end AND [FINISH_DELAY_DATETIME] > @shift_start",
    prodPeriod: "SELECT SUM([Weight]) as 'Weigth'\n" +
        "FROM [L2Mill].[dbo].[AllPack]\n" +
        "WHERE [DataWeight] >= @startPeriod;",
    // Получение почасового проката за выбранный период
    // в разрезе Профмля и Длины с почасовым планом проката
    hourlyProduction: "CREATE TABLE #tplan (\n" +
        "[ID] [numeric](9, 0) IDENTITY(1,1) NOT NULL,\n" +
        "[Size] [nvarchar](10) NULL,\n" +
        "[Length] [nvarchar](10) NULL,\n" +
        "[Weight] [numeric](12, 0) NULL,\n" +
        "[Long_Hour] [numeric](4, 0) NULL,\n" +
        "[Middle_Hour] [numeric](4, 0) NULL,\n" +
        "[Short_Hour] [numeric](4, 0) NULL,\n" +
        "[DataWeight] [datetime] NULL\n" +
        ");\n" +
        "INSERT INTO #tplan ([Size], [Length], [Weight], [LONG_HOUR], [MIDDLE_HOUR], [SHORT_HOUR], [DataWeight])\n" +
        "SELECT\n" +
            "[Size],\n" +
            "[Length],\n" +
            "[Weight],\n" +
            "[LONG_HOUR],\n"+
            "[MIDDLE_HOUR],\n" +
            "[SHORT_HOUR],\n" +
            "[DataWeight]\n" +
        "FROM [L2Mill].[dbo].[AllPack] LEFT JOIN [L2Mill].[dbo].[Dev_Plan_350_Profiles] ON [L2Mill].[dbo].[AllPack].[Size] = [L2Mill].[dbo].[Dev_Plan_350_Profiles].[PROFILE]\n" +
        "WHERE [DataWeight] BETWEEN @startTs AND @finishTs\n" +
        "ORDER BY [DataWeight] DESC;\n" +
        "SELECT\n" +
            "[Size],\n" +
            "[Length],\n" +
            "SUM([Weight]) AS [Weight],\n" +
            "MAX([LONG_HOUR]) AS [Plan_Long],\n" +
            "MAX([MIDDLE_HOUR]) AS [Plan_Midd],\n" +
            "MAX([SHORT_HOUR]) AS [Plan_Short],\n" +
            "MIN([DataWeight]) AS [StartTS],\n" +
            "MAX([DataWeight]) AS [FinishTS],\n" +
            "MAX([DataWeight]) - MIN([DataWeight]) AS [LengthTS],\n" +
            "DATEPART(HOUR, [DataWeight]) AS [Hour]\n" +
        "FROM #tplan\n" +
        "GROUP BY [Size], [Length], (DATEPART(HOUR, [DataWeight]))\n" +
        "ORDER BY [StartTS];\n",
    statsQuery: "CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);\n" +
        "INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);\n" +
        "\n" +
        "CREATE TABLE #billets (\n" +
        "    [ID] INT IDENTITY,\n" +
        "    [SHIFT] [numeric](9, 0) NULL,\n" +
        "    [BRIGADE] [numeric](9, 0) NULL,\n" +
        "    [CURRENT] [numeric](9, 0) NULL,\n" +
        "    [BRIGADE_START] [datetime] NULL,\n" +
        "    [COUNT] [numeric](9) NULL,\n" +
        "    [COUNTGB] [numeric](9) NULL,\n" +
        "    [BILLETWEIGHT] [numeric](9) NULL,\n" +
        ")\n" +
        "\n" +
        "insert into #billets ([SHIFT], [BRIGADE], [CURRENT], [BRIGADE_START], [COUNT], [COUNTGB], [BILLETWEIGHT])\n" +
        "SELECT\n" +
        "    DATEDIFF(hour, '2014-06-02 08:00:00', [DATE_RECORD]) / 12 as [SHIFT],\n" +
        "    MAX(brigade) as [BRIGADE],\n" +
        "    0,\n" +
        "    '',\n" +
        "    SUM(CASE EVENT WHEN 0 THEN 1 ELSE 0 END) as [COUNT],\n" +
        "    SUM(CASE EVENT WHEN -10 THEN 1 WHEN -11 THEN 1 ELSE 0 END) as [COUNTGB],\n" +
        "    SUM(CASE EVENT WHEN 0 THEN [BILLET_WEIGHT] ELSE 0 END) as [BILLETWEIGHT]\n" +
        "FROM [L2Mill].[dbo].[L2_PO_BILLET]\n" +
        "    LEFT JOIN #sheldule ON id_sheldule = (DATEDIFF(hour, '2014-06-02 08:00:00', [DATE_RECORD]) / 12) % 8 + 1\n" +
        "WHERE [DATE_RECORD] > '2020-04-30 20:00:00'\n" +
        "group by DATEDIFF(hour, '2014-06-02 08:00:00', [DATE_RECORD]) / 12\n" +
        "order by [SHIFT]\n" +
        "\n" +
        "UPDATE #billets\n" +
        "SET \n" +
        "    #billets.[CURRENT] = [L2Mill].[dbo].[Brigada].[BCur],\n" +
        "    #billets.[BRIGADE_START] = [L2Mill].[dbo].[Brigada].[BDate]\n" +
        "FROM #billets LEFT JOIN [L2Mill].[dbo].[Brigada] ON #billets.[BRIGADE] = [L2Mill].[dbo].[Brigada].ID\n" +
        "\n" +
        "\n" +
        "SELECT\n" +
        "    DATEADD(SECOND, [SHIFT] * 43200, '2014-06-02 08:00:00') AS beginTS,\n" +
        "    DATEADD(SECOND, ([SHIFT] + 1) * 43200 - 1, '2014-06-02 08:00:00') AS endTS,\n" +
        "    LAST_MONTH.BRIGADE as brigade,\n" +
        "    [CURRENT],\n" +
        "    [BRIGADE_START],\n" +
        "    [SHIFT_COUNT] as shiftCount, \n" +
        "    [SHIFT_WEIGHT] as shiftWeight, \n" +
        "    [MONTH_COUNT] as monthCount, \n" +
        "    [MONTH_WEIGHT] as monthWeight\n" +
        "FROM (\n" +
        "    SELECT \n" +
        "        [BRIGADE], \n" +
        "        MAX([CURRENT]) AS [CURRENT],\n" +
        "        MAX([BRIGADE_START]) AS [BRIGADE_START],\n" +
        "        [SHIFT], \n" +
        "        SUM([COUNT]) as [SHIFT_COUNT], \n" +
        "        SUM([BILLETWEIGHT]) as [SHIFT_WEIGHT] \n" +
        "    FROM #billets\n" +
        "    WHERE [SHIFT] IN (\n" +
        "        SELECT \n" +
        "            MAX(SHIFT) \n" +
        "        from #billets \n" +
        "        GROUP BY [BRIGADE]) \n" +
        "    GROUP BY [BRIGADE], [SHIFT]) AS LAST_SHIFT\n" +
        "    LEFT JOIN (\n" +
        "        SELECT \n" +
        "            [BRIGADE], \n" +
        "            SUM([COUNT]) as [MONTH_COUNT], \n" +
        "            SUM([BILLETWEIGHT]) as [MONTH_WEIGHT]\n" +
        "        FROM #billets\n" +
        "        GROUP BY [BRIGADE]) AS LAST_MONTH ON LAST_SHIFT.BRIGADE = LAST_MONTH.BRIGADE\n" +
        "ORDER BY brigade DESC;\n",
    // Получаем текущую остановку стана 350
    getHourlyDelays: "SELECT [DELAY_STATE], [DELAY_DATETIME] as 'start', [FINISH_DELAY_DATETIME] as 'finish',\n" +
        "[FINISH_DELAY_DATETIME] - [DELAY_DATETIME] as 'len', DATEPART(HOUR, [DELAY_DATETIME]) AS [Hour]\n" +
        "FROM [L2Mill].[dbo].[L2_DELAY_HALTLFM1]\n" +
        "WHERE [DELAY_DATETIME] > @startTs AND [FINISH_DELAY_DATETIME] < @finishTs;\n",
    getCurDelay: "SELECT TOP (1) [DELAY_DATETIME] AS delayStart\n" +
        "FROM [L2Mill].[dbo].[L2_DELAY_HALTLFM1]\n" +
        "WHERE [FINISH_DELAY_DATETIME] IS NULL\n" +
        "order by [DELAY_DATETIME] DESC",
    getDevPlan: "SELECT CONVERT(date, [ts]) date,\n" +
        "\t\tDATEPART(hour, [ts]) AS hour\n" +
        "      ,[s350]\n" +
        "      ,[s210]\n" +
        "  FROM [L2Mill].[dbo].[DevelopmentPlan]\n" +
        "  WHERE CONVERT(date, [ts]) = @ts",
    insertDevPlanRecord: "INSERT INTO [L2Mill].[dbo].[DevelopmentPlan]([ts],[s350],[s210])\n" +
        "     VALUES (@ts ,@s350 ,@s210)",
    updateDevPlanRecord: "UPDATE [L2Mill].[dbo].[DevelopmentPlan]\n" +
        "     SET [s350] = @s350 , [s210] = @s210 WHERE ts=@ts",
    planProduction: "CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);\n" +
        "INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);\n" +
        "SELECT brigade, ISNULL(SUM([s350]),0) AS s350, ISNULL(SUM([s210]),0) AS s210\n" +
        "FROM (SELECT s350, s210, brigade\n" +
        "\tFROM [L2Mill].[dbo].[DevelopmentPlan] \n" +
        "\tLEFT JOIN #sheldule ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', ts) / 12) % 8 + 1\n" +
        "\tWHERE ts BETWEEN @period_start AND @period_end) as \"plan\"\n" +
        "GROUP BY brigade\n" +
        " DROP TABLE #sheldule;",
    spcTemperature: "SELECT TOP (1) [tempspc]\n" +
        "  FROM [L2Mill].[dbo].[temperature]",
};

let s210Queries = {
    setHourStats: "UPDATE [L2Mill].[dbo].[Hourly210] SET [Percent] = @hourPercent, [Weight] = @hourWeight WHERE [Hour] = @currentHour;",
    getHourStats: "SELECT [Hour], [Percent], [Weight] FROM [L2Mill].[dbo].[Hourly210] ORDER BY [Hour];",
    resetHourStats: "UPDATE [L2Mill].[dbo].[Hourly210] SET [Percent] = 100, [Weight] = 0;",
    delayQuery: "SELECT [START_DELAY] as start\n" +
        ",[END_DELAY] as finish\n" +
        "\n" +
        "FROM [ABINSK_RMRT].[dbo].[STP_STOPPAGE]\n" +
        "WHERE [START_DELAY] < @shift_end AND [END_DELAY] > @shift_start",
    planProd: "SELECT * FROM [L2Mill].[dbo].[Dev_Plan_210_Profiles]",
    statsQuery: "CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);\n" +
        " INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);\n" +
        "CREATE TABLE #billets (\n" +
        "[ID] INT IDENTITY,\n" +
        "[SHIFT] [numeric](9, 0) NULL,\n" +
        "[BRIGADE] [numeric](9, 0) NULL,\n" +
        "[COUNT] [numeric](9) NULL,\n" +
        "[COUNTGB] [numeric](9) NULL,\n" +
        "[BILLETWEIGHT] [numeric](9) NULL,\n" +
        ")\n" +
        "    \n" +
        "insert into #billets ([SHIFT],[BRIGADE],[COUNT],[COUNTGB],[BILLETWEIGHT])\n" +
        "    \n" +
        "SELECT \n" +
        "DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12 as [SHIFT],\n" +
        "MAX(brigade) as [BRIGADE] ,\n" +
        "SUM(CASE SEMIPRODUCT_STATUS WHEN 100 THEN 1 ELSE 0 END) as [COUNT],\n" +
        "SUM(CASE SEMIPRODUCT_STATUS WHEN 110 THEN 1 WHEN -11 THEN 1 ELSE 0 END) as [COUNTGB],\n" +
        "SUM(CASE SEMIPRODUCT_STATUS WHEN 100 THEN [SEMIPRODUCT_WGT] ELSE 0 END) as [BILLETWEIGHT]\n" +
        "FROM [RML_SEMIPRODUCT]\n" +
        "LEFT JOIN #sheldule ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12) % 8 + 1\n" +
        "    WHERE [ROLLING_DATE] > @monthBegin\n" +
        "group by DATEDIFF(hour, '20140602 08:00:00', [ROLLING_DATE]) / 12\n" +
        "order by [SHIFT]\n" +
        "    \n" +
        "SELECT DATEADD(SECOND, [SHIFT] * 43200, '20140602 08:00:00') AS beginTS, \n" +
        "DATEADD(SECOND, ([SHIFT] + 1) * 43200 - 1, '20140602 08:00:00') AS endTS, LAST_MONTH.BRIGADE as brigade,  +\n" +
        "[SHIFT_COUNT] as shiftCount, [SHIFT_WEIGHT] as shiftWeight, [MONTH_COUNT] as monthCount, [MONTH_WEIGHT] as monthWeight\n" +
        "FROM (SELECT [BRIGADE], [SHIFT], SUM([COUNT]) as [SHIFT_COUNT], SUM([BILLETWEIGHT]) as [SHIFT_WEIGHT]\n" +
        "FROM #billets\n" +
        "WHERE [SHIFT] IN (SELECT MAX(SHIFT) from #billets GROUP BY [BRIGADE]) GROUP BY [BRIGADE], [SHIFT]) AS LAST_SHIFT\n" +
        "LEFT JOIN (SELECT [BRIGADE], SUM([COUNT]) as [MONTH_COUNT], SUM([BILLETWEIGHT]) as [MONTH_WEIGHT]\n" +
        "FROM #billets \n" +
        "GROUP BY [BRIGADE]) AS LAST_MONTH ON LAST_SHIFT.BRIGADE = LAST_MONTH.BRIGADE\n" +
        "ORDER BY brigade DESC",
    getCurDelay: "SELECT TOP (1) [START_DELAY] AS delayStart\n" +
        "FROM [ABINSK_RMRT].[dbo].[STP_STOPPAGE]\n" +
        "WHERE [STOP_STATUS] = 1\n" +
        "ORDER BY [START_DELAY] DESC",
    prodPeriod: "SELECT SUM(SEMIPRODUCT_WGT) AS 'Weigth'\n"+
        "FROM [RML_SEMIPRODUCT]\n" +
        "WHERE [ROLLING_DATE] >= @startPeriod\n",
}
let espcQueries = {
    temperature: "SELECT outside_temperature FROM operative"
}

let s350 = new sql.ConnectionPool(config.get("s350"));
let s210 = new sql.ConnectionPool(config.get("s210"));
let espc = mysql.createPool(config.get("espc"));

const Model = {

    getData: async function(){
        let result_data = {
            's350': await this.getStats("s350", s350, s350Queries),
            's210': await this.getStats("s210", s210, s210Queries),
            shift_start: await this.getShiftStart(),
            temp_in: await this.getSPCTemperature(),
            temp_out: await this.getTemperature(),
            current_brigade: await this.getSelectedBrigade(s350), /* brigades.getActiveBrigade(s350), */
            spc_month: 0,
            spc_year: 0,
        };
        result_data.spc_month = result_data.s350.start_month + result_data.s210.start_month;
        result_data.spc_year = result_data.s350.start_year + result_data.s210.start_year;
        return result_data;
    },
    getStats: async function(stan, pool, queries) {
        await pool.connect();
        try {
            let request = pool.request();
            const today = new Date();
            const monthBegin = new Date(today.getFullYear(), today.getMonth() , 1, -4, 0, 0);
            request.input("monthBegin", sql.DateTime, monthBegin);
            let result = await request.query(queries.statsQuery).catch(e =>console.log(e));
            // let plan = await this.getPlanProd(stan, monthBegin, today);
            //result.recordsets.forEach(r => console.log(r));
            let stats =  {
                dev_shift: [0, 0, 0, 0, 0],
                delay_shift: [0, 0, 0, 0, 0],
                plan_perc: [0, 100, 100, 100, 100],
                dev_month: [0, 0, 0, 0, 0],
                working: true,
                delay_start_time: '',
                start_month: 0,
                start_year: 0,
            };

            // fromYear = await this.getFromStartYear(stan, pool, stats);
            stats.start_year = Math.round(await this.getFromStartYear(stan, pool) / 1000.0);
            stats.start_month = Math.round(await this.getFromStartMonth(stan, pool) / 1000.0);
            let resultCurDelay = await request.query(queries.getCurDelay);
            let oldValues = this.getDelayPlan(stan) || { working: false, delay_planned_time: 0};
            if (resultCurDelay.recordset.length > 0) {
                stats.working = false;
                stats.delay_start_time = new Date(resultCurDelay.recordset[0].delayStart - 10800000);
                stats.delay_planned_time = oldValues.delay_planned_time;
            } else {
                stats.working = true;
                if (oldValues.working === false) {
                    oldValues.working = true;
                    oldValues.delay_planned_time = 0;
                    this.setDelayPlan(stan, oldValues);
                }
            }
            // Расчет процента выполнения плана
            // let currentPrecent = await this.calcPercent(stan);
            // brig = await this.getSelectedBrigade()
            // stats.plan_perc[brig] = currentPrecent;

            for(let row of result.recordset) {
                await this._fillStats(pool, queries.delayQuery, row, stats);
                // Расчет процента выполнения плана за месяц
                // Для текущей бригады считаем по своему алгоритму,
                // Для остальных - берем ранее сохраненные данные
                brig = await brigades.getCurrentBrigade(s350);
                let currentData = await this.getDailyPercent(stan);
                if (!currentData) {
                    stats.plan_perc[brig.ID] = 0;
                    stats.dev_shift[brig.ID] = 0;
                } else {
                    stats.plan_perc[brig.ID] = currentData.Percent;
                    stats.dev_shift[brig.ID] = currentData.Weight;                    
                };
                //stats.plan_perc[row.brigade] = (plan[row.brigade] === 0) ? 100 : Math.round(row.monthWeight/(plan[row.brigade]*10));
            }
            //console.dir(stats);
            return stats;
        } catch (e) {
            console.error('SQL error', e);
            return [];
        }
    },
    // Заполнение очередной строки из результата запроса
    _fillStats: async function(pool, query, row, stats) {
        //stats[row.brigade] = row;
        let subreq = pool.request();
        subreq.input("shift_start", sql.DateTime, row.beginTS);
        subreq.input("shift_end", sql.DateTime, row.endTS);
        let delays = await subreq.query(query);
        let delStart, delEnd, delDuration  = 0;

        // Получаем список всех простоев за смену
        for (let delay of delays.recordset) {
            delStart = Math.max(row.beginTS, delay.start);      // Либо время начала смены, либо время начала простоя
            delEnd = Math.min(row.endTS, delay.finish);         // Либо время конца смены, либо время окончания простоя
            delDuration += Math.max( delEnd - delStart , 0);    // Складываем время всех простоев за смену
        }
        delDuration = Math.min(delDuration, 12 * 3600000);      // Либо вся смена (12 часов), либо сумма всех простоев за смену
        let pad = (n, z = 2) => ('00' + n).slice(-z);   // Форматированный вывод времени простоя в виде '01:22'
        stats.delay_shift[row.brigade] = pad(delDuration/3.6e6 | 0) + ':' + pad((delDuration%3.6e6)/6e4 | 0); // Добавляем в результат отформатированное время суммы простоев
        stats.dev_shift[row.brigade] = Math.round(row.shiftWeight/1000);    // Добавляем в результат вес прокатанного с начала смены в тоннах
        stats.dev_month[row.brigade] = Math.round(row.monthWeight/1000);    // Добавляем в результат вес прокатанного с начала месяца в тоннах
        return row;
    },

    //////////////////////////////////////////////////////////////////////////
    // Модуль по сохранению состояния текущей бригады в локальном хранилище //
    //////////////////////////////////////////////////////////////////////////

    // Записать план производства по часам в базу данных
    setDevPlan: async function (plan) {
        let date = new Date(plan.plan_date);
        let request = s350.request();
        request.input('ts', sql.DateTime, date);
        let result = await request.query(s350Queries.getDevPlan);
        let setQuery = (result.recordset.length > 0) ? s350Queries.updateDevPlanRecord : s350Queries.insertDevPlanRecord; // >>>>>>>

        for(let it = 0; it <= 23; it++){
            let put_request = s350.request();
            put_request.input('ts', sql.DateTime, new Date(date.getTime() + it * 3600000));
            put_request.input('s350', sql.Int, plan.s350[it]);
            put_request.input('s210', sql.Int, plan.s210[it]);
            await put_request.query(setQuery).catch(e => console.log(e));
        }
        return true;
    },

    resetHourlyStats: async function(local) {
        // Обнуление почасового произврдства для выбранного стана
        let res = false;
        if (local) {
            // Локальное хранилшище
                hourlyStore.set('s350', {});
                hourlyStore.set('s210', {});
                res = true;
            } else {
            // База данных
                let request = s350.request();
                let query = await request.query(s350Queries.resetHourStats).catch(e => console.log(e));
                if (query.rowsAffected[0] > 0) {
                    res = true;
                }
                query = await request.query(s210Queries.resetHourStats).catch(e => console.log(e));
                if (query.rowsAffected[0] > 0) {
                    res = true;
                }
            }
            return res;
        },
    

    // Сохранение подготовленного состояния по всем часам работы бригады
    saveHourlyPercent: async function(stan, data, local, hour) {
        // Сохранение состояния по часам
        if (local) {
            hourlyStore.set(stan, data);
        } else {
            // Сохранение данных в БД
            let request = s350.request();
            request.input('hourPercent', data[hour].Percent);   //  /* Процент выполнения текущего часа */
            request.input('hourWeight', data[hour].Weight);     //  /* Сумма взвешенных пакетов за текущий час */
            request.input('currentHour', hour);                 //  /* Текущий час */
            await request.query(s350Queries.setHourStats).catch(e => console.log(e));
        }
    },

    // Получение данных о всех часах работы текущей бригады
    readHourlyPercent: async function(stan, local) {
        // Читаем все записи статуса часов по выбранному стану
        if (local) {
            let data = hourlyStore.get(stan);
            return data;
        } else {
            let data = [];
            let request = s350.request();
            let result;

            if (stan == 's350') {
                result = await request.query(s350Queries.getHourStats).catch(e =>console.log(e));
            } else {
                result = await request.query(s210Queries.getHourStats).catch(e =>console.log(e));
            }
            for (let row of result.recordset) {
                res = {};
                res['Hour'] = row.Hour;
                res['Percent'] = row.Percent;
                res['Weight'] = row.Weight;
                data.push(res);
            }
            return data;
        }
    },

    // Сохранение текущего часа работы бригады
    putHour: async function(stan, hour, percent=0, weight=0, local=false) {
        // 1. Получаем сохраненное ранее состояние бригады
        var data = await this.readHourlyPercent(stan, local);
        if (isNaN(percent) || isNaN(weight)) {
            data[hour].Percent = 0;
            data[hour].Weight = 0;
        } else {
        // 2. Изменяем значение текущего часа
            data[hour].Percent = percent;
            data[hour].Weight = weight;
        };
        // Записываем состояние по часам в локальное хранилище
        await this.saveHourlyPercent(stan, data, local, hour);
    },

    // Получение времени начала смены текущей бригады
    getShiftStart: async function() {
        let data;
        let request = s350.request();
        let result = await request.query(s350Queries.brigadeQuery).catch(e =>console.log(e));
        for (let row of result.recordset) {
            data = row.BDate;
        }
        return data;
    },

    getStartHour: async function(hour) {
        // Получение начала часа переданной в параметре даты
        // Если это первый час работы бригады, то начало часа - начало смены.
        // Если это не первый час смены, то начало часа
        let result = new Date(hour);

        let numHour = Number(hour.getHours()); // Hour - строка, нет функции getHours();
        let shiftStart = await this.getShiftStart();
        let shiftHour = shiftStart.getHours();
        if (shiftHour == numHour) {         // Работаем первый час
            result = shiftStart;
        } else {
            result.setHours(numHour);
            result.setMinutes(0);
            result.setSeconds(0);
            result.setMilliseconds(0);
        }

        return result;
    },
    toLocalDate: function(date) {
        return new Date(date.setHours(date.getHours()+3));
    },

    // Сохранение состояния текущей бригады
    saveShiftStat: async function(currBrigada) {
        let perc350 = 0;
        let perc210 = 0;
        let weig350 = 0;
        let weig210 = 0;
        let data350 = await this.getDailyPercent('s350');
        if (data350) {
            perc350 = data350.Percent;
            weig350 = data350.Weight;
        }
        let data210 = await this.getDailyPercent('s210');
        if (data210) {
            perc210 = data210.Percent;
            weig210 = data210.Weight;
        }

        // Сохраняем процент выполнения и массу проката для стана 350 за смену
        // Если нет данных о станах, 100% выполнение и 0 тонн
        let request = s350.request();
        request.input('percent350', perc350);
        request.input('weight350', weig350);
        request.input('percent210', perc210);
        request.input('weight210', weig210);
        request.input('currBrigada', currBrigada);
        let result = await request.query(s350Queries.updateBStats).catch(e => {return false}); 
        if (result.rowsAffected.length) {
            brigades.setSaved(true);
        }
        return true;
    },


    // Определяем номер бригады, которая должна заступить на смену
    getSelectedBrigade: async function(pool) {
    /* TODO: Получить из модуля brigades флаг состояния бригады (сохранено, или нет)
    Если даные не сохранены и пришло время сменить бригаду, то сохранить данные, сменить бригаду
    и обнулить данные по часам */

        // Проверяем время
        let currBrig = await brigades.getCurrentBrigade(pool);    // Номер текущей бригады и время начала ее смены
        let brigDate = currBrig.BDate;
        brigDate = new Date(brigDate = brigDate.setHours(brigDate.getUTCHours()));
        let activeBrig = await brigades.getActiveBrigade(pool);   // Номер активной бригады
        let saved = brigades.isSaved();                 // Флаг сохранения текущей бригады;
        const today = new Date();                       // Текущее время

        // Если время работы бригады менее 1 минуты и состояние не сохранено, то сохраняем и устанавливаем флаг сохранения бригады
        if ( (Number(today) - Number(currBrig.BDate) <= 60000 && !saved) ) {
            // Бригада работает менее минуты и статус не сохранен
            let shift;
            if (today.getHours() == 12) {
                shift = "Day";
            } else {
                shift = "Night";
            }
            let prevBrig = brigades.getPrevBrigade(currBrig.ID, shift);
            let isSaved = await this.saveShiftStat(prevBrig);
            // Если сохранен статус, то обнулить почасовую статистику, иначе выдать ошибку
            if (isSaved) {
                // Обнуляем почасовую статистику
                let reset = await this.resetHourlyStats(false);
                if (reset) {
                    console.log('Hourly stats was been reseted!');
                };
            } else {
                console.log("Error saving current brigade state.");
            };
        }
        return activeBrig;
    },

    // Расчитывем средний процент за день
    getDailyPercent: async function(stan) {
        const toLocalStorage = false;
        let perc = 0;
        let weight =0;
        const timeShift = {
            "Day": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            "Night": [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8]
        };
        let curr = [];

        let calc = await this.calcPercent(stan, toLocalStorage); // Заполняем данные по часам
        if (!calc) {
            return false;
        }
        let data = {};
        let currentShift = await brigades.getCurrentBrigade(s350);
        let shiftStart = currentShift.BDate;
        shiftStart = shiftStart.getHours();
        if (shiftStart == 8) {
            // Заступила дневная смена, устанавливаем часы дневной смены
            curr = timeShift.Day;
        } else {
            // Заступила ночная смена, устанавливаем часы ночной смены
            curr = timeShift.Night;
        }

        let daily = await this.readHourlyPercent(stan, toLocalStorage);

        for (day of daily) { 
            if (curr.includes(day.Hour)) {
                perc += day.Percent;
                weight += day.Weight;
            }
        }
        perc = Math.round(perc / 12);
        data['Percent'] = perc;
        data['Weight'] = weight;
        return data;
    },

    // Расчет процента выполнения плана за текущий час
    // и сохранение текущего часа в локальном хранилище или БД
    calcPercent: async function (stan, local){

        // Определяем начало и конец периода расчета
        // (текущее время и начало отсчета часа)
        let finish = new Date();
        finish = this.toLocalDate(finish);
        let start = await this.getStartHour(finish);

        /// START DEBUG
        // start = new Date('2020-06-02 11:00:00');
        // finish = new Date ('2020-06-02 11:59:59');
        /// FINISH DEBUG

        var hour = finish.getUTCHours(); 
        // Получаем фактически произведенную продукцию за период
        fact = await this.getHourlyProd(start, finish); // Нет стана 210
        if (!fact) {
            return false;
        }
        // Получаем плановые показатели 
        plan = await this.getProdPlan(stan);

        let avg = 0;
        // TODO: Проход по строкам набора fact, выбор наименования профиля, поиск в таблице плана данный профиль и получение плана
        if (stan == "s350") {
            // Для стана 350
            var profile = '';
            var length = '';
            var real_weight = 0;
            var plan_weight = 0;
            let percent = [];
            for (let row of fact) {
                // Проверить на наличие записей (при простое возвращается пустой набор)
                profile = row.Profile;
                length = Number(row.Length);
                real_weight = row.Weight;
                duration = row.Duration;

                // Ищем план для текущего профиля
                for (let pl of plan) {
                    if (pl.Profile == profile) {
                        if (length >= 10000) { plan_weight = pl.Long; break; }
                        if (length >= 8000 && length < 10000) { plan_weight = pl.Middle; break; }
                        if (length < 8000) { plan_weight = pl.Short; break; }
                    }
                }

                // Расчитаем, какую часть часа был фактический прокат
                hourPercent = this.calcHourPart(start, finish);       // сколько процентов в текущем часе работали
                real_weight = Math.round(real_weight / 1000);         // Пересчитать фактически прокатанное в тонны
                hourPlan = (plan_weight * hourPercent) / 100;         // Сколько тонн должны были прокатать за это время 
                perc = (real_weight * 100) / hourPlan;                // При простое деление на 0!
                avg += perc;
                percent.push(perc);
            }
            // Если разные профиля в течение часа, считаем средний процент за час
            avg = Math.round(avg / percent.length);
        } else {
            // Для стана 210
            // >>>>>>>>>>>>>>>>>>>>>

        }
        await this.putHour(stan, hour, avg, real_weight, local);
    },

    // Получить температуру воздуха на улице из базы данных
    getTemperature: async function(){
        let promisePool = espc.promise();
        let [rows, fiels] = await promisePool.query(espcQueries.temperature);
        if (rows.length > 0) return rows[0].outside_temperature;
        else return 0;
    },
    // Получить температуру внутри цеха из базы данных
    getSPCTemperature: async function(){
        let request = s350.request();
        let result = await request.query(s350Queries.spcTemperature);
        if (result.recordset.length > 0) return result.recordset[0].tempspc;
        else return 0;
    },
    // Получить плановые остановки из локального хранилища
    getDelayPlan: function(stan) {
        return store.get(stan)
    },
    // Записать плановые остановки в локальное хранилище
    setDelayPlan: function(stan, data) {
        return store.set(stan, data)
    },
    // Получить план производства по часам из базы данных
    getDevPlan: async function (date) {
        let result_data = {
            plan_date: date,
            s350: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
            s210: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
        };

        let request = s350.request();
        request.input('ts', sql.DateTime, date);
        let result = await request.query(s350Queries.getDevPlan);
        if (result.recordset.length > 0) {
            for(let rec of result.recordset){
                result_data.s350[rec.hour] = rec.s350;
                result_data.s210[rec.hour] = rec.s210;
            }
        }
        return result_data;
    },
    // Получение плана производства из базы данных
    getPlanProd: async function(stan, dateFrom, dateTo){
        let plan = {1: 0, 2: 0, 3: 0, 4: 0};
        let request = s350.request();
        request.input("period_start", sql.DateTime, dateFrom);
        request.input("period_end", sql.DateTime, dateTo);
        let result = await request.query(s350Queries.planProduction);
        if (result.recordset.length > 0) {
            for(let row of result.recordset){
                plan[row.brigade] = row[stan];
            }
        }
        return plan;
    },

    dateToString: function(date, withDate=true) {
        const d = new Date(Number(date));
        let strDate = '';
        if (withDate) {
            strDate = d.getFullYear();
            strDate += '-';

            tmp = d.getMonth()+1;
            if (tmp < 10) {
                strDate += '0'
            }
            strDate += tmp;
            strDate += '-';

            tmp = d.getDate();
            if (tmp < 10) {
                strDate += '0';
            }
            strDate += tmp;
            strDate += ' ';
        }
        tmp = d.getUTCHours();
        if (tmp < 10) {
            strDate += '0';
        }
        strDate += tmp;
        strDate += ':';

        tmp = d.getMinutes();
        if (tmp < 10) {
            strDate += '0';
        }
        strDate += tmp;
        strDate += ":";

        tmp = d.getSeconds();
        if (tmp < 10) {
            strDate += '0';
        }
        strDate += tmp;
        strDate += '.';
        strDate += d.getMilliseconds();

        return strDate;
    },

    // Получаем, сколько процентов времени в этом часе работали
    calcHourPart: function(start, finish) {

        let diffData = finish - start;
        let percent = Math.round((diffData*100)/3600000, 0);
       return percent;
    },
    
    // Получение плана проката для заданного стана
    getProdPlan: async function(stan) {
        let Data = [];
        let request = s350.request();
        let query; 

        if (stan == 's350') {
            query = s350Queries.planProd;
            let result = await request.query(query);
            if (result.recordset.length > 0) {
                for (row of result.recordset) {
                    r = {}
                    r['Profile'] = row.PROFILE;         // Наименование профиля
                    r['Short'] = row.SHORT_HOUR;        // План для короткого пореза (6'000 - 7'999 мм)
                    r['Middle'] = row.MIDDLE_HOUR;      // План для среднего пореза (8'000 - 9'999 мм)
                    r['Long'] = row.LONG_HOUR;          // План для длинного пореза (более 10'000 мм)
                    Data.push(r);
                }
            }
        };

        if (stan == 's210') {
            query = s210Queries.planProd;
            let result = await request.query(query);
            if (result.recordset.length > 0) {
                for (row of result.recordset) {
                    r = {}
                    r['Profile'] = row.PROFILE;    // Наименование профиля
                    r['Plan'] = row.HOURLY;        // План проката на час
                    Data.push(r);
                }
            }
        }
        return Data;
    },

    getProdList: async function(start, finish) {
        //FIXME: Нет стана 210
        // TODO: Для каждой строки определить:
        // 1) Время начала проката, 
        // 2) Выделить начало часа, в котором катался профиль
        // 3) Определить долю часа в процентах, 
        // 4) Определить сколько за этот час должны были выкатать соответствующего профиля соответствующей длины 
        // 5) Посчитать, на сколько процентов откатали от того количества, которое должны были выкатать (рассчитанное на шаге 4)
        // 6) Сохранить полученный процент выполнения плана в массив

        // Расчет проката нескольких профилей в течение одного часа
        // Перебираем созданный ранее по всем профилям массив и выбираем строки, у которых 
        // совпадает значение часа, но различается длина и/или профиль

        let tmp350 = s350.request();
        tmp350.input("startTS", sql.DateTime, start);
        tmp350.input("finishTS", sql.DateTime, finish);
        let tmpResult = await tmp350.query(s350Queries.tmpQuery).catch(e =>console.log(e));
        let prof = [];
        for (let r=0; r<tmpResult.recordset.length; ++r) {
            row = {};
            Data = tmpResult.recordset[r].DataWeight;
            Profile = tmpResult.recordset[r].Size;
            Length = tmpResult.recordset[r].Length;
            Weight = tmpResult.recordset[r].Weight;
            if (Data < start) break;

            row['Profile'] = Profile;
            row['Length'] = Length;
            row['Weight'] = Weight;
            row['Data'] = Data;

            if (prof.length == 0) {
                // Расчет времени проката
                // Если в этом часу больше ничего не катали, то берем сначала часа
                LengthTs = Number(Data) - Number(start);
                row['LengthTs'] = LengthTs;
            } else {
                LengthTs = Number(Data) - Number(prof[r-1].Data);
                row['LengthTs'] = LengthTs;
            };
            prof.push(row); // Массив prof содержит все взвешенные пакеты за текущий час
        };
        return prof;
    },

    getHourlyProd: async function(start, finish) {
        // Нет стана 210
        const prof = await this.getProdList(start, finish);
        if (prof.length > 0) {
            // Ручной расчет проката всех профилей 
            let weight = 0;
            let duration = 0;
            let profile = 0;
            let length = 0;
            let hour = '';
            let hours = [];
            let rw = {};
            len = prof.length;
            // Рассчитываем время фактического проката профиля в течение часа
            // FIXME: Проверить работу при попадании немеры - длина пореза ND
            for (let w=0; w<len; ++w) {
                if (profile == 0 && length == 0) {
                    // Первый прокат в этом часе
                    profile = prof[w].Profile;
                    length = prof[w].Length;
                    weight = prof[w].Weight;
                    duration = prof[w].LengthTs;
                    hour = start.getUTCHours().toString();
                } else {
                    // Доугой профиль и/ил длина пореза
                    if (profile != prof[w].Profile || length != prof[w].Length) {
                        rw = {};
                        rw['Hour'] = hour;
                        rw['Profile'] = profile;
                        rw['Length'] = length;
                        rw['Weight'] = weight;
                        rw['Duration'] = duration;
                        hours.push(rw);
                        profile = prof[w].Profile;
                        length = prof[w].Length;
                        weight = 0;
                        duration = 0;
                    } else {
                        weight += prof[w].Weight;
                        duration += Number(prof[w].LengthTs);
                    }
                }
            }
            rw = {};
            rw['Hour'] = hour;
            rw['Profile'] = profile;
            rw['Length'] = length;
            rw['Weight'] = weight;
            rw['Duration'] = duration;
            hours.push(rw);     
            // Массив hours содержит данные о продолжительности праката различных профилей в течение часа
            // Если hours путой - вернуть false
            return hours;
        } else {
            return false;
        }
    },

    getFromStartYear: async function(stan, pool) {
    // Подсчет прокатанной продукции с начала года (кг)
        const today = new Date();
        const yy = today.getFullYear()-1
        const stYear = yy + '-12-31 20:00:00'
        const startYear = new Date(stYear);
        let result_data = 0;

        if (stan == 's350') {
            let request = pool.request();
            request.input('startPeriod', startYear);
            let result = await request.query(s350Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }

        if (stan == 's210') {
            let request = pool.request();
            request.input('startPeriod', startYear);
            let result = await request.query(s210Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }
        return result_data;
    },

    getFromStartMonth: async function(stan, pool) {
    // Подсчет прокатанной продукции с начала месяца (кг)
        const today = new Date();
        const monthBegin = new Date(today.getFullYear(), today.getMonth() , 1, -4, 0, 0);
        let result_data = 0;

        if (stan == 's350') {
            let request = pool.request();
            request.input('startPeriod', monthBegin);
            let result = await request.query(s350Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }

        if (stan == 's210') {
            let request = pool.request();
            request.input('startPeriod', monthBegin);
            let result = await request.query(s210Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }
        return result_data;
    },
};

module.exports = Model;
