const sql = require('mssql');
const mysql = require('mysql2');
const config = require('config');
// const fs = require('fs');
const store = require('data-store')({ path: process.cwd() + '/delay_plan.json' });

let s350Queries = {
    brigadeQuery: "SELECT [ID], [BDate] FROM [L2Mill].[dbo].[Brigada] WHERE BCur > 0",
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
    delayQuery: "SELECT [START_DELAY] as start\n" +
        ",[END_DELAY] as finish\n" +
        "\n" +
        "FROM [ABINSK_RMRT].[dbo].[STP_STOPPAGE]\n" +
        "WHERE [START_DELAY] < @shift_end AND [END_DELAY] > @shift_start",
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
            // current_brigade: await this.getCurBrigade(),
            current_brigade: await this.getNextBrigade(),
            temp_in: await this.getSPCTemperature(),
            temp_out: await this.getTemperature(),
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
            let plan = await this.getPlanProd(stan, monthBegin, today);
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
            for(let row of result.recordset) {
                await this._fillStats(pool, queries.delayQuery, row, stats);
                // Расчет процента выполнения плана за месяц
                stats.plan_perc[row.brigade] = (plan[row.brigade] === 0) ? 100 : Math.round(row.monthWeight/(plan[row.brigade]*10));
            }
            //console.dir(stats);
            return stats;
        } catch (e) {
            console.error('SQL error', e);
            return [];
        }
    },
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
    // Определяем номер бригады, которая должна заступить на смену
    getNextBrigade: async function() {

        const now = new Date();
        let current = 0;
        let lastID = 0;
        let lastDate = 0;
        let request = s350.request();
        let result = await request.query(s350Queries.brigadeQuery).catch(e =>console.log(e));
        for (let row of result.recordset) {
            lastID = row.ID;
            lastDate = row.BDate;
            lastDate.setHours(lastDate.getUTCHours());
        }

        ////////////////////////////////////////////
        // Тестирование модуля расчета долей часа //
        ////////////////////////////////////////////
        
        cl = this.getHourlyProduction();
        // console.log(cl);

        ////////////////////////////////////////////

        // Если предыдущая бригада работает >= 11 часов, то необходимо ее сменить
        let workingHours = (now - lastDate) / 3600000;

        if (workingHours >= 11) {
            let timeShift_start = new Date();
            timeShift_start.setHours(20);
            timeShift_start.setMinutes(0);
            timeShift_start.setSeconds(0);
            timeShift_start.setMilliseconds(0);
            let timeShift_finish = new Date();
            timeShift_finish.setHours(20);
            timeShift_finish.setMinutes(30);
            timeShift_finish.setSeconds(0);
            timeShift_finish.setMilliseconds(0);
    
            // Заступает бригада в дневную смену
            if (now >= timeShift_start && now <= timeShift_finish) {
                // Если время смены бригады
                // определяем номер бригады, которая заступает на смену
        
                switch (lastID) {
                    case 1 :
                        current = 4;
                        break;
                    case 2 :
                        current = 1;
                        break;
                    case 3 :
                        current = 2;
                        break;
                    case 4 :
                        current = 3;
                        break;
                }
            } else {
                current = lastID;
            }

            timeShift_start.setHours(8);
            timeShift_start.setMinutes(0);
            timeShift_start.setSeconds(0);
            timeShift_start.setMilliseconds(0);

            timeShift_finish.setHours(8);
            timeShift_finish.setMinutes(30);
            timeShift_finish.setSeconds(0);
            timeShift_finish.setMilliseconds(0);
        
            if (now >= timeShift_start && now <= timeShift_finish) {
                // Если время смены бригады
                // определяем номер бригады, которая заступает на смену
        
                switch (lastID) {
                    case 1 :
                        current = 3;
                        break;
                    case 2 :
                        current = 4;
                        break;
                    case 3 :
                        current = 1;
                        break;
                    case 4 :
                        current = 2;
                        break;
                }
            }
        } else {
            current = lastID;
        }
        return current;
    },
    getTemperature: async function(){
        let promisePool = espc.promise();
        let [rows, fiels] = await promisePool.query(espcQueries.temperature);
        if (rows.length > 0) return rows[0].outside_temperature;
        else return 0;
    },
    getSPCTemperature: async function(){
        let request = s350.request();
        let result = await request.query(s350Queries.spcTemperature);
        if (result.recordset.length > 0) return result.recordset[0].tempspc;
        else return 0;
    },
    getDelayPlan: function(stan) {
        let d = store.get(stan);
        return store.get(stan)
    },
    setDelayPlan: function(stan, data) {
        return store.set(stan, data)
    },
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
    setDevPlan: async function (plan) {
        let date = new Date(plan.plan_date);
        let request = s350.request();
        request.input('ts', sql.DateTime, date);
        let result = await request.query(s350Queries.getDevPlan);
        let setQuery = (result.recordset.length > 0) ? s350Queries.updateDevPlanRecord : s350Queries.insertDevPlanRecord;

        for(let it = 0; it <= 23; it++){
            let put_request = s350.request();
            put_request.input('ts', sql.DateTime, new Date(date.getTime() + it * 3600000));
            put_request.input('s350', sql.Int, plan.s350[it]);
            put_request.input('s210', sql.Int, plan.s210[it]);
            await put_request.query(setQuery).catch(e => console.log(e));
        }
        return true;
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
    getHourlyProduction: async function(/* dateShift */) {
        let dataRec;    //  Массив для сохранения значений текущей строки при расчетах
        let data = [];  //  Промежуточный массив в разрезе профилей и длин пореза (могут быть несколько записей, соответствующие одному часу проката)

        // Получаем время начала и конца смены 
        let shiftStart;
        let request = s350.request();
        let result = await request.query(s350Queries.brigadeQuery).catch(e =>console.log(e));
        for (let row of result.recordset) {
            shiftStart = row.BDate;
            shiftStart.setHours(shiftStart.getUTCHours());
        };

        let time1 = new Date(shiftStart);
        const sStart = time1.getFullYear() + '-' + (time1.getMonth()+1) + '-' + time1.getDate() + ' ' + (time1.getHours()+3) + ':' + time1.getMinutes() + ':' + time1.getSeconds() + '.' + time1.getMilliseconds();
        let time2 = new Date();
        const sEnd = time2.getFullYear() + '-' + (time2.getMonth()+1) + '-' + time2.getDate() + ' ' + (time2.getHours()+3) + ':' + time2.getMinutes() + ':' + time2.getSeconds() + '.' + time2.getMilliseconds();

        request.input("startTs", sql.DateTime, sStart);
        request.input("finishTs", sql.DateTime, sEnd);
        res = await request.query(s350Queries.hourlyProduction).catch(e =>console.log(e));
        let len = 0;
        const rec = res.recordset;

        for (row=0; row < rec.length; ++row) {
            // TODO: Для каждой строки определить:
            // 1) Время начала проката, 
            // 2) Выделить начало часа, в котором катался профиль
            // 3) Определить долю часа в процентах, 
            // 4) Определить сколько за этот час должны были выкатать соответствующего профиля соответствующей длины 
            // 5) Посчитать, на сколько процентов откатали от того количества, которое должны были выкатать (рассчитанное на шаге 4)
            // 6) Сохранить полученный процент выполнения плана в массив
            
            // FIXME: Сохранять значение переменной res.recordset[row].Hour в переменную, и если её значение не изменилось, тогда считать средний процент
            // с предыдущей записью о выполнении плана.

            // Расчет времени проката профиля в процентах от часа
            // Result.push(res.recordset[row]);
            profileTime = Number(rec[row].FinishTS - rec[row].StartTS);
            timePercent = Math.round((profileTime*100.0)/3600000);
            
            dataRec = {};

            dataRec['ID'] = row;                        // Номер строки
            dataRec['Size'] = rec[row].Size;            // Профиль
            len = Number(rec[row].Length);              // Первеод длины пореза в число
            dataRec['Length'] = len;                    // Длина пореза
            dataRec['Weight'] = rec[row].Weight;        // Вес
            dataRec['startTS'] = rec[row].StartTS;      // Время начала проката профиля
            dataRec['finishTS'] = rec[row].FinishTS;    // Время окончания проката профиля
            dataRec['lengthTS'] = profileTime;          // Длительность проката профиля
            dataRec['Hour'] = rec[row].Hour;            // Номер часа
            dataRec['percentTime'] = timePercent;       // Сколько процентов от часа был прокат

            // Заполняем поле плановой производительности на основании профиля и длины пореза
            if ((dataRec.Length >= 6000) && (dataRec.Length < 8000)) {
                dataRec['Plan'] = rec[row].Plan_Short;
            } else if ((dataRec.Length >= 8000) && (dataRec.Length < 10000)) {
                dataRec['Plan'] = rec[row].Plan_Midd;
            } else if (dataRec.Length >= 10000) {
                dataRec['Plan'] = rec[row].Plan_Long;
            }

            // Расчет процента выполнения плана за час
            planPercent = (dataRec.Plan * dataRec.percentTime) / 100.0; // Плановый прокат в тоннах за фактическое время проката
            dataRec['percentProfile'] = planPercent;
            hourPercent = ((dataRec.Weight/1000.0) * 100.0) / planPercent; // Расчет процента выполнения проката данного профиля данной длины
            dataRec['hourPercent'] = Math.round(hourPercent);
            data.push(dataRec);
        };
        
        // Расчет проката нескольких профилей в течение одного часа
        // Перебираем созданный ранее по всем профилям массив и выбираем строки, у которых 
        // совпадает значение часа, но различается длина и/или профиль
        let prev_prof = 0, prev_len = 0, prev_weigth = 0, prev_hour = 0;
        for (row of data) {
            // обход по строкам
            curr_prof = row.Size;
            curr_len = row.Length;
            curr_weight = row.Weight;
            curr_hour = row.Hour;

            // Проверяем, не является ли текущая строка продолжением часа
            if (curr_hour == prev_hour) {
                // Это продолжение часа
                // Проверить номер профиля и длину пореза.
                // Если они одинаковы, то сложить вес с предыдущей записью и сохранить в массив.
                // Если профиль и/или длина пореза различается, то записать разными строками в массив
                if (isNaN(curr_len)) {
                    // Если попалась немера, проверить предыдущую запись, и если это тот же час,
                    // то прибавить массу немеры к весу предыдущего часа
                    console.log('!NAN!');
                }
                prev_hour = curr_hour;
                prev_prof = curr_prof;
                prev_len = curr_len;
                prev_weigth = curr_weight;
            } else {
                // Это новый час, сохраняем его в массив

                prev_hour = curr_hour;
                prev_prof = curr_prof;
                prev_len = curr_len;
                prev_weigth = curr_weight;
            }
        }

        return data;
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
