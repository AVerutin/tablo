const sql = require('mssql');
const brigades = require('./brigades');
const mysql = require('mysql2');
const config = require('config');
const store = require('data-store')({ path: process.cwd() + '/delay_plan.json' });
const hourlyStore = require('data-store')( {path: process.cwd() + '/hourly.json' } );
const debug = require("./debug_log");
const delays = require('./delays');

const _DEBUG = false;
const toLocal = true;

let s350Queries = {
    getStatBrigades: "SELECT [ID], [BPercent350], [BWeight350], [BPercent210], [BWeight210] FROM [L2Mill].[dbo].[BrigadaStats] ORDER BY [ID];",
    updateBStats: "UPDATE [L2Mill].[dbo].[BrigadaStats] SET [BPercent210] = @percent210, [BWeight210] = @weight210, " + 
        "[BPercent350] = @percent350, [BWeight350] = @weight350 WHERE ID = @currBrigada;",
    setHourStats: "UPDATE [L2Mill].[dbo].[Hourly350] SET [Percent] = @hourPercent, [Weight] = @hourWeight WHERE [Hour] = @currentHour;",
    resetHourStats: "UPDATE [L2Mill].[dbo].[Hourly350] SET [Percent] = 100, [Weight] = 0;",
    getHourStats: "SELECT [Hour], [Percent], [Weight] FROM [L2Mill].[dbo].[Hourly350] ORDER BY [Hour];",
    prodList: "SELECT\n" +
        "[AllPack].[Size],\n" +
        "[AllPack].[Length],\n" +
        "[AllPack].[Weight],\n" +
        "[AllPack].[DataWeight]\n" +
        "FROM [L2Mill].[dbo].[AllPack]\n" +
        "WHERE [AllPack].[DataWeight] BETWEEN @startTS AND @finishTS\n" +
        "ORDER BY [AllPack].[DataWeight] ASC;",
    planProd: "SELECT * FROM [L2Mill].[dbo].[Dev_Plan_350_Profiles]",
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
    statsQuery: "CREATE TABLE #sheldule (id_sheldule TINYINT IDENTITY, brigade TINYINT);\n" +
        "INSERT INTO #sheldule VALUES (2), (1), (3), (2), (4), (3), (1), (4);\n" +
        "\n" +
        "CREATE TABLE #billets (\n" +
        "\t[ID] INT IDENTITY,\n" +
        "\t[SHIFT] [numeric](9, 0) NULL,\n" +
        "\t[BRIGADE] [numeric](9, 0) NULL,\n" +
        "\t[COUNT] [numeric](9) NULL,\n" +
        "\t[COUNTGB] [numeric](9) NULL,\n" +
        "\t[BILLETWEIGHT] [numeric](9) NULL,\n" +
        ")\n" +
        " insert into #billets ([SHIFT],[BRIGADE],[COUNT],[COUNTGB],[BILLETWEIGHT])\n" +
        "SELECT \n" +
        "\tDATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12 as [SHIFT],\n" +
        "\tMAX(brigade) as [BRIGADE] ,\n" +
        "\tSUM(CASE EVENT WHEN 0 THEN 1 ELSE 0 END) as [COUNT],\n" +
        "\tSUM(CASE EVENT WHEN -10 THEN 1 WHEN -11 THEN 1 ELSE 0 END) as [COUNTGB],\n" +
        "\tSUM(CASE EVENT WHEN 0 THEN [BILLET_WEIGHT] ELSE 0 END) as [BILLETWEIGHT]\n" +
        "FROM [L2Mill].[dbo].[L2_PO_BILLET]\n" +
        "LEFT JOIN #sheldule ON id_sheldule = (DATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12) % 8 + 1\n" +
        " WHERE [DATE_RECORD] > @monthBegin\n" +
        "group by DATEDIFF(hour, '20140602 08:00:00', [DATE_RECORD]) / 12\n" +
        "order by [SHIFT]\n" +
        "\n" +
        "SELECT DATEADD(SECOND, [SHIFT] * 43200, '20140602 08:00:00') AS beginTS,  \n" +
        "\tDATEADD(SECOND, ([SHIFT] + 1) * 43200 - 1, '20140602 08:00:00') AS endTS, LAST_MONTH.BRIGADE as brigade, " +
        "[SHIFT_COUNT] as shiftCount, [SHIFT_WEIGHT] as shiftWeight, [MONTH_COUNT] as monthCount, [MONTH_WEIGHT] as monthWeight\n" +
        "FROM (SELECT [BRIGADE], [SHIFT], SUM([COUNT]) as [SHIFT_COUNT], SUM([BILLETWEIGHT]) as [SHIFT_WEIGHT]\n" +
        "\tFROM #billets\n" +
        "\tWHERE [SHIFT] IN (SELECT MAX(SHIFT) from #billets GROUP BY [BRIGADE]) GROUP BY [BRIGADE], [SHIFT]) AS LAST_SHIFT\n" +
        "LEFT JOIN (SELECT [BRIGADE], SUM([COUNT]) as [MONTH_COUNT], SUM([BILLETWEIGHT]) as [MONTH_WEIGHT]\n" +
        "\tFROM #billets \n" +
        "\tGROUP BY [BRIGADE]) AS LAST_MONTH ON LAST_SHIFT.BRIGADE = LAST_MONTH.BRIGADE\n" +
        "\tORDER BY brigade DESC",
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
}

let s210Queries = {
    setHourStats: "UPDATE [L2Mill].[dbo].[Hourly210] SET [Percent] = @hourPercent, [Weight] = @hourWeight WHERE [Hour] = @currentHour;",
    getHourStats: "SELECT [Hour], [Percent], [Weight] FROM [L2Mill].[dbo].[Hourly210] ORDER BY [Hour];",
    resetHourStats: "UPDATE [L2Mill].[dbo].[Hourly210] SET [Percent] = 100, [Weight] = 0;",
    // prodList: "SELECT [RML_SEMIPRODUCT].[SEMIPRODUCT_WGT] AS [Weight], [RML_SEMIPRODUCT].[ROLLING_DATE] AS [Rolling_Date], " +
    //     "[RML_PRODUCT_TYPE].[PROFILE_ID] AS [Profile_ID], [RML_PRODUCT_TYPE].[PRODUCT_TYPE_HIPROF] AS [Profile_Name] FROM [ABINSK_RMRT].[dbo].[RML_SEMIPRODUCT], " +
    //     "[ABINSK_RMRT].[dbo].[RML_PROGRAM], [ABINSK_RMRT].[dbo].[RML_JOB], [ABINSK_RMRT].[dbo].[RML_CATALOG], [ABINSK_RMRT].[dbo].[RML_PRODUCT_TYPE] " +
    //     "WHERE [ABINSK_RMRT].[dbo].[RML_SEMIPRODUCT].[PROGRAM_ID] = [ABINSK_RMRT].[dbo].[RML_PROGRAM].[PROGRAM_ID] AND " +
    //     "[ABINSK_RMRT].[dbo].[RML_PROGRAM].[JOB_ID] = [ABINSK_RMRT].[dbo].[RML_JOB].[JOB_ID] AND " +
    //     "[ABINSK_RMRT].[dbo].[RML_JOB].[CATALOG_ID] = [ABINSK_RMRT].[dbo].[RML_CATALOG].[CATALOG_ID] AND " +
    //     "[ABINSK_RMRT].[dbo].[RML_CATALOG].[PRODUCT_TYPE_ID] = [ABINSK_RMRT].[dbo].[RML_PRODUCT_TYPE].[PRODUCT_TYPE_ID] AND " +
    //     "[ABINSK_RMRT].[dbo].[RML_SEMIPRODUCT].[ROLLING_DATE] BETWEEN @startTs AND @finishTs " +
    //     "ORDER BY [ABINSK_RMRT].[dbo].[RML_SEMIPRODUCT].[ROLLING_DATE] ASC;",
    prodList: "SELECT [RML_COIL].[COIL_WGT] AS [Weight], [RML_COIL].[WEIGHING_DATE] AS [Rolling_Date], [RML_PRODUCT_TYPE].[PROFILE_ID] AS [Profile_ID],\n" +
        "[RML_PRODUCT_TYPE].[PRODUCT_TYPE_HIPROF] AS [Profile_Name] FROM [ABINSK_RMRT].[dbo].[RML_COIL], [ABINSK_RMRT].[dbo].[RML_PROGRAM],\n" +
        "[ABINSK_RMRT].[dbo].[RML_JOB], [ABINSK_RMRT].[dbo].[RML_CATALOG], [ABINSK_RMRT].[dbo].[RML_PRODUCT_TYPE]\n" +
        "WHERE [ABINSK_RMRT].[dbo].[RML_COIL].[PROGRAM_ID] = [ABINSK_RMRT].[dbo].[RML_PROGRAM].[PROGRAM_ID] AND\n" +
        "[ABINSK_RMRT].[dbo].[RML_PROGRAM].[JOB_ID] = [ABINSK_RMRT].[dbo].[RML_JOB].[JOB_ID] AND\n" +
        "[ABINSK_RMRT].[dbo].[RML_JOB].[CATALOG_ID] = [ABINSK_RMRT].[dbo].[RML_CATALOG].[CATALOG_ID] AND\n" +
        "[ABINSK_RMRT].[dbo].[RML_CATALOG].[PRODUCT_TYPE_ID] = [ABINSK_RMRT].[dbo].[RML_PRODUCT_TYPE].[PRODUCT_TYPE_ID] AND\n" +
        "[ABINSK_RMRT].[dbo].[RML_COIL].[WEIGHING_DATE] BETWEEN @startTs AND @finishTs\n" +
        "ORDER BY [ABINSK_RMRT].[dbo].[RML_COIL].[WEIGHING_DATE] ASC;\n",
    delayQuery: "SELECT [START_DELAY] as start\n" +
        ",[END_DELAY] as finish\n" +
        "\n" +
        "FROM [ABINSK_RMRT].[dbo].[STP_STOPPAGE]\n" +
        "WHERE [START_DELAY] < @shift_end AND [END_DELAY] > @shift_start",
    planProd: "SELECT * FROM [L2Mill].[dbo].[DevPlan_210_Profiles]",
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
        "FROM [ABINSK_RMRT].[dbo].[RML_SEMIPRODUCT]\n" +
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
            's350': await this.getStats("s350", s350, s350Queries), // Статистика по стану 350
            's210': await this.getStats("s210", s210, s210Queries), // Статистика по стану 210
            shift_start: await this.getShiftStart(), // Получение времени начала смены текущей бригады   
            temp_in: await this.getSPCTemperature(), // Температура воздуха в цеху
            temp_out: await this.getTemperature(), // Температура воздуха на улице
            // current_brigade: await this.getSelectedBrigade(s350, toLocal), // Получение номера активной (выбранной на табло) бригады
            current_brigade: await brigades.getActiveBrigade(s350),
            spc_month: 0, // Прокатано по цеху с начала месяца
            spc_year: 0,  // Прокататно по цеху с начала года
        }
        // Расчет показателей в целом по цеху
        result_data.spc_month = result_data.s350.start_month + result_data.s210.start_month;
        result_data.spc_year = result_data.s350.start_year + result_data.s210.start_year;

        // Получение данных о бригадах (процент выполнения плана и производственные показатели)
        let request = s350.request();
        let statBrigades = await request.query(s350Queries.getStatBrigades).catch(e => console.log(e));
        for (let stat of statBrigades.recordset) {
            result_data.s350.dev_shift[stat.ID] = stat.BWeight350;
            result_data.s210.dev_shift[stat.ID] = stat.BWeight210;
            result_data.s350.plan_perc[stat.ID] = stat.BPercent350;
            result_data.s210.plan_perc[stat.ID] = stat.BPercent210;
        }

        return result_data;
    },
    getStats: async function(stan, pool, queries) {
        await pool.connect();
        try {
            let request = pool.request();
            const today = new Date();
            const monthBegin = new Date(today.getFullYear(), today.getMonth() , 1, -4, 0, 0); // 20 часов последнего дня предыдущего месяца
            request.input("monthBegin", sql.DateTime, monthBegin);
            let result = await request.query(queries.statsQuery).catch(e =>console.log(e)); // Сбор полной статистики по стану
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
                need_reset_timer: false,
                error: false,
                wrong_profile: ''
            }

            // Получение данных о производственых показателях предыдущих бригад
            await this.calcBrigade(false);
            stats.start_year = Math.round(await this.getFromStartYear(stan, pool) / 1000.0); // Получение показателей по станам с начала года
            stats.start_month = Math.round(await this.getFromStartMonth(stan, pool) / 1000.0); // Получение показателей по станам с начала месяца
            let resultCurDelay = await request.query(queries.getCurDelay); // Получение данных о текущей остановке стана

            // Получаем статус ошибки наименования профиля на стане 210
            let err = delays.getError(stan);
            
            // Расчет по текущей остановке стана
            let oldValues = this.getDelayPlan(stan) || { working: false, delay_planned_time: 0 };
            if (resultCurDelay.recordset.length > 0) {
                stats.working = false;
                stats.delay_start_time = new Date(resultCurDelay.recordset[0].delayStart - 10800000);
                stats.delay_planned_time = oldValues.delay_planned_time;
            } else {
                stats.working = true;
                if (oldValues.working === false) {
                    // Обнулить значение предыдущего планового простоя
                    stats.delay_start_time = new Date(0);
                    oldValues.working = true;
                    oldValues.delay_planned_time = 0;
                    this.setDelayPlan(stan, oldValues);
                    stats.need_reset_timer = true;
                } else {
                    stats.need_reset_timer = false;
                }
                if (err.Error) {
                    stats.working = false;
                    stats.error = true;
                    stats.wrong_profile = err.WrongProfile;
                }
            }

            // Заполнение данных по каждому стану
            for(let row of result.recordset) {
                await this._fillStats(pool, queries.delayQuery, row, stats);
            }
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
        //FIXME: Корректировка времени начала и окончания простоя по границам смены
        for (let delay of delays.recordset) {
            // Если простой начался в предыдущей смене, то учитывыаем его с начала смены
            if (delay.start < row.beginTS) {
                delStart = row.beginTS;
            } else {
                delStart = delay.start;
            }

            // Если простой закончился в следующей смене, то учитываем его до конца смены
            if (delay.finish > row.endTS) {
                delEnd = row.endTS;
            } else {
                delEnd = delay.finish;
            }

            // delStart = Math.max(row.beginTS, delay.start);      // Либо время начала смены, либо время начала простоя
            // delEnd = Math.min(row.endTS, delay.finish);         // Либо время конца смены, либо время окончания простоя
            delDuration += Math.max( delEnd - delStart , 0);    // Складываем время всех простоев за смену
        }
        delDuration = Math.min(delDuration, 12 * 3600000);      // Либо вся смена (12 часов), либо сумма всех простоев за смену
        let pad = (n, z = 2) => ('00' + n).slice(-z);           // Форматированный вывод времени простоя в виде '01:22'
        stats.delay_shift[row.brigade] = pad(delDuration/3.6e6 | 0) + ':' + pad((delDuration%3.6e6)/6e4 | 0); // Добавляем в результат отформатированное время суммы простоев
        stats.dev_shift[row.brigade] = Math.round(row.shiftWeight/1000);    // Добавляем в результат вес прокатанного с начала смены в тоннах
        stats.dev_month[row.brigade] = Math.round(row.monthWeight/1000);    // Добавляем в результат вес прокатанного с начала месяца в тоннах
        return row;
    },

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
            let dat = {};
            let hr = {'Percent': 100, 'Weight': 0}
            for (let i=0; i<24; ++i) {
                dat[i] = hr;
            }
            hourlyStore.set('s350', dat);
            hourlyStore.set('s210', dat);
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
            if (_DEBUG) debug.writelog(`saveHourlyPercent (СТАН: [${stan}], ЧАС: [${hour}], ПРОЦЕНТ: [${data[hour].Percent}], ВЕС: [${data[hour].Weight}])`);
            
            switch (stan) {
                case 's350' : {
                    await request.query(s350Queries.setHourStats).catch(e => console.log(e));
                    break;
                }
                case 's210' : {
                    await request.query(s210Queries.setHourStats).catch(e => console.log(e));
                    break;
                }
            }
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

            if (stan === 's350') {
                result = await request.query(s350Queries.getHourStats).catch(e =>console.log(e));
            } else {
                result = await request.query(s210Queries.getHourStats).catch(e =>console.log(e));
            }
            for (let row of result.recordset) {
                if (!isNaN(row.Weight)) {
                    res = {};
                    res['Hour'] = row.Hour;
                    res['Percent'] = row.Percent;
                    res['Weight'] = row.Weight;
                    data.push(res);
                }
            }
            return data;
        }
    },

    // Сохранение текущего часа работы бригады
    putHour: async function(stan, hour, percent=0, weight=0, local=false) {
        // 1. Получаем сохраненное ранее состояние бригады
        let data = await this.readHourlyPercent(stan, local); // После очистки почасового плана приходит пустой объект в data, где нет полей 'Percent' и 'Weight'
        if (!data) {
            return false;
        }

        if (!(hour in data)) { 
            // Если в data нет текущего часа, то создаем его
            data[hour] = {};
        }

        if (isNaN(percent) || isNaN(weight)) {
            data[hour].Percent = 0;
            data[hour].Weight = 0;
        } else {
        // 2. Изменяем значение текущего часа
            data[hour].Percent = percent;
            data[hour].Weight = weight;
        }

        // Записываем состояние по часам в локальное хранилище
        await this.saveHourlyPercent(stan, data, local, hour);
        if (_DEBUG) debug.writelog(`Стан: ${stan}, час: ${hour}, процент: ${percent}, вес: ${weight}`);
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
        if (shiftHour === numHour) {         // Работаем первый час
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
        if (_DEBUG) debug.writelog(`saveShiftStat(${currBrigada}) =>  (percent350: [${perc350}], weight350: [${weig350}], percent210: [${perc210}], weight210: [${weig210}])`);
        await request.query(s350Queries.updateBStats).catch(e => { return false }); 
        return true;
    },


    calcBrigade: async function(toLocal = false) {
        // Расчет данных для текущей бригады
        // Получаем номер текущей бригады из БД (по данным 7-го поста)
        let currBrig = await brigades.getCurrentBrigade(s350);

        // Получаем ранее сохраненный номер текущей бригады (предыдущая бригада)
        let lastBrig = brigades.getLastBrigade();
        
        // Получаем признак сброшенного состояния бригады
        let reseted = brigades.getReseted();

        // Если номер текущей бригады не равен номеру предыдущей бригады
        if (currBrig.ID === lastBrig) {
            // Сбросить флаг "сброшено"
            reseted = false;
            brigades.setReseted(reseted);

            // Расчитать и сохранить производственные показатели бригады за смену
            await this.saveShiftStat(currBrig.ID); 
        } else {
            // Заступила новая бригада, нужно обнулить почасовые показатели
            // Сохранить время начала текущей бригады в БД

            await brigades.saveShiftTime(s350, currBrig.ID, currBrig.BDate);

            reseted = await this.resetHourlyStats(toLocal);
            brigades.setReseted(reseted);

            // Сохранить номер текущей бригады как предыдущей
            lastBrig = currBrig.ID;
            brigades.setLastBrigade(currBrig.ID);
        }
    },

    // Расчитывем средний процент за день
    getDailyPercent: async function(stan) {
        const timeShift = {
            "Day": ['8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
            "Night": ['20', '21', '22', '23', '0', '1', '2', '3', '4', '5', '6', '7', '8']
        }

        let curr = [];
        let table = '';

        await this.calcPercent(stan, toLocal); // Заполняем данные по часам

        let data = {};
        let currentShift = await brigades.getCurrentBrigade(s350);
        let shiftStart = currentShift.BDate; 
        shiftStart = shiftStart.getUTCHours();
        if (shiftStart === 8) {
            // Заступила дневная смена, устанавливаем часы дневной смены
            curr = timeShift.Day;
        } else {
            // Заступила ночная смена, устанавливаем часы ночной смены
            curr = timeShift.Night;
        }
        switch (stan) {
            case 's350' : table = "Hourly350"; break;
            case 's210' : table = "Hourly210"; break;
        }

        // Выполнение запроса для получения сводной статистики по текущей бригаде,
        // рассчитываемой на основании почасового проката и выполнения плана
        const query = `SELECT Count([Hour]) AS [Hours], AVG([Percent]) AS [Percent], SUM([Weight]) AS [Weight] FROM [L2Mill].[dbo].[${table}] WHERE [Hour] IN (${curr});`;
        let request = s350.request();
        let result = await request.query(query).catch(e => console.log(e));

        data['Percent'] = result.recordset[0].Percent;
        data['Weight'] = result.recordset[0].Weight;

        return data;
    },

    // Получение текущего простоя
    getCurrDelay: async function(stan) {
        // Возвращаем продолжительность текущей остановки в миллисекундах и время начала текущей остановки
        // или false - если стан едет
        let data = {};
        let request;
        let query;

        // Получаем время начала текущего простоя
        if (stan === 's350') {
            request = s350.request();
            query = s350Queries.getCurDelay;
        } else {
            request = s210.request();
            query = s210Queries.getCurDelay;
        }

        // Получаем текущую остановку стана
        result = await request.query(query);
        if (result.recordset.length > 0) {
            // Стан стоит, рассчитаем продолжительность остановки
            let today = new Date();
            let delay = Number(result.recordset[0].delayStart) - 10800000;

            data['duration'] = Number(today) - delay;
            data['delayStart'] = new Date(delay);

        } else {
            // Стан едет
            data = false;
        }

        return data;
    },

    getNonPlanDelay: async function(stan) {
        // Получаем ранее сохраненное значение внепланового простоя
        // и данные о текущем простое (currDelay ? {'duration':0, 'delayStart': 'y-m-d hh-mm-ss'} : false)
        let result = 0;
        let currDelay = await this.getCurrDelay(stan);  // Текущий простой
        let planDelay = this.getDelayPlan(stan);        // Плановый простой
        let today = new Date();

        if (!currDelay) {
            // Получить флаг предыдущего состояния стана
            let stopped = delays.getStopped(stan);
            // Если до этого был простой,
            if (stopped === delays.Stopped) {
                // то обнулить значение планового простоя
                this.setDelayPlan(stan, { working: false, delay_planned_time: 0 });
                delays.setStopped(stan, delays.Working);
            }

            if ( (today.getMinutes() === 0) && (today.getSeconds() <= 10) ) {
                // Если текущее время - начало часа, обнулить ранее сохраненное значение внепланового простоя
                delays.setDelayDuration(stan, 0);
                result = 0;
            }
            return result;
        } else {
            // установим признак остановки стана
            delays.setStopped(stan, delays.Stopped);

            // Простой начался в прошлом часу?
            let delayStartHour = currDelay.delayStart.getHours();
            let currHour = today.getHours();
            if (currHour - delayStartHour === 1) {
                // считаем, сколько по времени стояли в прошлом часу
                let startHour = new Date();
                startHour.setMinutes(0);
                startHour.setSeconds(0);
                startHour.setMilliseconds(0);

                // Получаем продолжительность простоя за прошлый час
                let lastHour = Number(startHour) - Number(currDelay.delayStart);
                tmpPlan = planDelay.delay_planned_time - lastHour;
                tmpCurr = currDelay.duration - lastHour;
                
                // Если продолжтельность текущего простоя больше плановой
                if (tmpCurr > tmpPlan) {
                    // Очищаем сохраненное ранее значение, т.к. оно содержит данные за прошлы час
                    delays.setDelayDuration(stan, 0);
                    let nonPlan = tmpCurr - tmpPlan;
                    delays.addDelayDuration(stan, nonPlan, delays.AdditiveValue);
                    result = nonPlan;
                } else {
                    // Стоим в пределах плановой продолжительности
                    // Очищаем сохраненное значение от данных прошлого часа
                    delays.setDelayDuration(stan, 0);
                    result = 0;
                }
            } else {
                // Простой начался в этом часе
                if (currDelay.duration > planDelay.delay_planned_time) {
                    // Стоим дольше, чем планировали
                    // Сохраним текущий простой, как внеплановый
                let nonPlan = currDelay.duration - planDelay.delay_planned_time;
                    delays.addDelayDuration(stan, nonPlan, delays.AdditiveValue);
                    result = delays.getDelayDuration(stan);
                } else {
                    // Стоим в пределах планового простоя, если до этого стояли сверх плана,
                    // то возвращаем ранее сохраненное значение
                    result = delays.getDelayDuration(stan);
                }
            }
        }

        return result;
    },

    // Расчет процента выполнения плана за текущий час
    // и сохранение текущего часа в локальном хранилище или БД
    calcPercent: async function (stan, local){

        // Определяем начало и конец периода расчета
        // (текущее время и начало отсчета часа)
        let finish = new Date();
        finish = this.toLocalDate(finish);
        let start = await this.getStartHour(finish);

        let hour = finish.getUTCHours();
        // Получаем фактически произведенную продукцию за период
        let fact = await this.getHourlyProd(stan, start, finish).catch(e => console.log(e));
        if (!fact) {
            return false;
        }
        // Получаем плановые показатели 
        let plan = await this.getProdPlan(stan).catch(e => console.log(e));
        if (!fact) {
            return false;
        }

        // Получаем признак простоя в настоящий момент
        // Если стан стоит, определяем время начала простоя
        // Смотрим, плановый он, или нет (есть ли запись в простое)
        // Если время планового простоя закончилось, то обнуляем значение планового простоя
        // Смотрим, сколько длится текущий простой (текущее время минус время начала простоя)
        // Если стоим больше, чем было по плану, то это - производственный (внеплановый простой)
        // Обнуляем время планового простоя (this.setDelayPlan(stan, { working: false, delay_planned_time: 0 });
        // Находим продолжительность простоя сверх плана (текущее время - время начала простоя - длительность планого простоя)
        // Прибавляем продолжительность простоя сверх плана к времени проката текущего профиля

        // Нужно сохранять между сессиями значение продолжительности неплановых простоев
        // при очередном простое в самом начале нужно получить значение неплановых простоев,
        // которые уже были в этом часу и время текущего внепланового простоя добавлять к этому значению
        // Скорее всего такой способ не сработает, поэтому нужно каждый простой считать отдельно
        
        // Если простой 
        // Таким же образом определяем, что он неплановый
        // Точно также расчитываем продолжительность текущего простоя
        // Считываем из файла продолжительность простоя, сохраненное в прошлый раз (для текущего часа)
        // Находим разницу между текущей и предыдущей продолжительностями, 
        // Прибавляем эту разницу к предыдущему значению и записываем в файл
        // В начале каждого часа необходимо обнулять это значение
        

        let avg = 0;
        let nonPlanDelay = 0;
        let profile = '';
        let length = '';
        let real_weight = 0;
        let plan_weight = 0;
        let percent = [];
        let profileID = '';
        let profileName = '';

        // Проход по строкам набора fact, выбор наименования профиля, поиск в таблице плана данный профиль и получение плана
        if (stan === "s350") {
            // Для стана 350
            for (let row of fact) {
                // Проверить на наличие записей (при простое возвращается пустой набор)
                profile = row.Profile;
                length = Number(row.Length);
                real_weight = Math.round(row.Weight / 1000); // Пересчитать фактически прокатанное в тонны
                duration = row.Duration;

                // Ищем план для текущего профиля
                for (let pl of plan) {
                    if (pl.Profile === profile) {
                        if (length >= 10000) { plan_weight = pl.Long; break; }
                        if (length >= 8000 && length < 10000) { plan_weight = pl.Middle; break; }
                        if (length < 8000) { plan_weight = pl.Short; break; }
                    }
                }

                // Расчитаем, какую часть часа был фактический прокат
                // К общему времени проката добавляем время производственного (внепланового) простоя

                // Учитываем время внепланового простоя, если он был
                nonPlanDelay = await this.getNonPlanDelay(stan);
                finish = new Date( Number(finish) + nonPlanDelay );
                hourPercent = this.calcHourPart(start, finish);       // сколько процентов в текущем часе работали
                hourPlan = (plan_weight * hourPercent) / 100;         // Сколько тонн должны были прокатать за это время 
                perc = (real_weight * 100) / hourPlan;                // При простое деление на 0!
                avg += perc;
                percent.push(perc);
            }
            // Если разные профиля в течение часа, считаем средний процент за час
            avg = Math.round(avg / percent.length);
        } else {
            // Для стана 210
            for (row of fact) {
                // profileID = row.ProfileID;          // Наименование (1) профиля из таблицы фактического производства
                profileName = row.ProfileName.toUpperCase();      // Наименование (2) профиля из таблицы фактического производства
                profileName = profileName.replace(',', '.');
                real_weight = Math.round(row.Weight / 1000); // Пересчитаем вес в тонны
                duration = row.Duration;

                // Ищем в таблице планового производства Наименование (1)
                // for (let i = 0; i < plan.length; ++i) {
                //     // Ищем по полю fact.ProfileID
                //     if (plan[i].ProfileName === profileID) {
                //         // Нашли
                //         delays.setError(stan, false);
                //         plan_weight = plan[i].Plan;
                //         break;
                //     }
                // }

                if (plan_weight === 0) {
                    // Если не нашли по полю fact.ProfileID, ищем по полю fact.ProfileName
                    for (let i = 0; i < plan.length; ++i) {
                        if (plan[i].ProfileName === profileName) {
                            // Нашли
                            delays.setError(stan, false, '');
                            plan_weight = plan[i].Plan;
                            break;
                        }
                    }
                }

                if (plan_weight === 0) {
                    // Нет такого профиля в плане
                    delays.setError(stan, true, profileName);
                }

                // Учитываем время внепланового простоя, если он был
                nonPlanDelay = await this.getNonPlanDelay(stan);
                finish = new Date( Number(finish) + nonPlanDelay );
                hourPercent = this.calcHourPart(start, finish);       // сколько процентов в текущем часе работали
                hourPlan = (plan_weight * hourPercent) / 100;         // Сколько тонн должны были прокатать за это время 
                perc = (real_weight * 100) / hourPlan;                // При простое деление на 0!
                avg += perc;
                percent.push(perc);
            }
            avg = Math.round(avg / percent.length);
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
        }

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
            if (tmp < 10) strDate += '0';
            strDate += tmp;
            strDate += '-';
            tmp = d.getDate();
            if (tmp < 10) strDate += '0';
            strDate += tmp;
            strDate += ' ';
        }

        tmp = d.getUTCHours();
        if (tmp < 10) strDate += '0';
        strDate += tmp;
        strDate += ':';
        tmp = d.getMinutes();
        if (tmp < 10) strDate += '0';
        strDate += tmp;
        strDate += ":";
        tmp = d.getSeconds();
        if (tmp < 10) strDate += '0';
        strDate += tmp;
        strDate += '.';
        if (d.getMilliseconds() < 100) strDate += '0';
        if (d.getMilliseconds() < 10) strDate += '0';
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

        if (stan === 's350') {
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
        }

        if (stan === 's210') {
            query = s210Queries.planProd;
            let result = await request.query(query);
            if (result.recordset.length > 0) {
                for (row of result.recordset) {
                    r = {}
                    // r['ProfileID'] = row.PROFILE_ID;    // Наименование профиля (1)
                    r['ProfileName'] = row.PROFILE_NAME;    // Наименование профиля
                    r['Plan'] = row.HOURLY;        // План проката на час
                    Data.push(r);
                }
            }
        }
        return Data;
    },

    getProdList: async function(stan, start, finish) {
        // Для каждой строки определить:
        // 1) Время начала проката, 
        // 2) Выделить начало часа, в котором катался профиль
        // 3) Определить долю часа в процентах, 
        // 4) Определить сколько за этот час должны были выкатать соответствующего профиля соответствующей длины 
        // 5) Посчитать, на сколько процентов откатали от того количества, которое должны были выкатать (рассчитанное на шаге 4)
        // 6) Сохранить полученный процент выполнения плана в массив

        // Расчет проката нескольких профилей в течение одного часа
        // Перебираем созданный ранее по всем профилям массив и выбираем строки, у которых 
        // совпадает значение часа, но различается длина и/или профиль
        let prof = [];
        if (stan === "s350") {
            let list350 = s350.request();
            list350.input("startTS", sql.DateTime, start);
            list350.input("finishTS", sql.DateTime, finish);
            let listResult = await list350.query(s350Queries.prodList).catch(e =>console.log(e));
            prof = [];
            for (let r=0; r<listResult.recordset.length; ++r) {
                row = {};
                Data = listResult.recordset[r].DataWeight;
                Profile = listResult.recordset[r].Size;

                // Отлавливаем "немеру", у которой не указана длина пореза (Length = 'ND')
                if (listResult.recordset[r].Length === 'ND') {
                    if (r > 0) {
                        Length = listResult.recordset[r-1].Length;
                    } else {
                        Length = listResult.recordset[r+1].Length;
                    }
                } else {
                    Length = listResult.recordset[r].Length;
                }

                Weight = listResult.recordset[r].Weight;
                if (Data < start) break;

                row['Profile'] = Profile;
                row['Length'] = Length;
                row['Weight'] = Weight;
                row['Data'] = Data;

                if (prof.length === 0) {
                    // Расчет времени проката
                    // Если в этом часу больше ничего не катали, то берем сначала часа
                    LengthTs = Number(Data) - Number(start);
                    row['LengthTs'] = LengthTs;
                } else {
                    LengthTs = Number(Data) - Number(prof[r-1].Data);
                    row['LengthTs'] = LengthTs;
                }

                prof.push(row); // Массив prof содержит все взвешенные пакеты за текущий час
            }

        } else { 
            let list210 = s210.request();
            list210.input("startTS", sql.DateTime, start);
            list210.input("finishTS", sql.DateTime, finish);
            let listResult = await list210.query(s210Queries.prodList).catch(e =>console.log(e));
            prof = [];
            for (let r=0; r<listResult.recordset.length; ++r) {
                row = {};
                Data = listResult.recordset[r].Rolling_Date;
                ProfileID = listResult.recordset[r].Profile_ID;
                ProfileName = listResult.recordset[r].Profile_Name;
                Weight = listResult.recordset[r].Weight;
                if (Data < start) break;

                row['ProfileID'] = ProfileID;
                row['ProfileName'] = ProfileName;
                row['Weight'] = Weight;
                row['Data'] = Data;

                if (prof.length === 0) {
                    // Расчет времени проката
                    // Если в этом часу больше ничего не катали, то берем сначала часа
                    LengthTs = Number(Data) - Number(start);
                    row['LengthTs'] = LengthTs;
                } else {
                    LengthTs = Number(Data) - Number(prof[r-1].Data);
                    row['LengthTs'] = LengthTs;
                }

                prof.push(row); // Массив prof содержит все взвешенные пакеты за текущий час
            }
        }
        return prof;
    },

    getHourlyProd: async function(stan, start, finish) {
        // Для стана 350
        if (stan === 's350') {
            const prof = await this.getProdList(stan, start, finish);
            let len = prof.length;
            if (len > 0) {
                // Ручной расчет проката всех профилей 
                let weight = 0;
                let duration = 0;
                let profile = 0;
                let length = 0;
                let hour = '';
                let hours = [];
                let rw = {};

                // Рассчитываем время фактического проката профиля в течение часа
                for (let w=0; w<len; ++w) {
                    if (profile === 0 && length === 0) {
                        // Первый прокат в этом часе
                        profile = prof[w].Profile;
                        length = prof[w].Length;
                        weight = prof[w].Weight;//
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
        } else {
            // Для стана 210
            const prof = await this.getProdList(stan, start, finish);
            let len = prof.length;
            if (len > 0) {
                let weight = 0;
                let duration = 0;
                let profileID = '';
                let profileName = '';
                let hour = '';
                let hours = [];
                let rw = {};
                for (row of prof) {
                    if (profileID === '' && profileName === '') {
                        // Первый прокат в этом часе
                        profileID = row.ProfileID;
                        profileName = row.ProfileName;
                        weight = row.Weight;
                        duration = row.LengthTs;
                        hour = start.getUTCHours().toString();
                    } else {
                        // Доугой профиль и/ил длина пореза
                        if (profileID != row.ProfileID || profileName != row.ProfileName) {
                            rw = {};
                            rw['Hour'] = hour;
                            rw['ProfileID'] = profileID;
                            rw['ProfileName'] = profileName;
                            rw['Weight'] = weight;
                            rw['Duration'] = duration;
                            hours.push(rw);
                            profileID = row.ProfileID;
                            profileName = row.ProfileName;
                            weight = 0;
                            duration = 0;
                        } else {
                            weight += row.Weight;
                            duration += Number(row.LengthTs);
                        }
                    }
                }
                rw = {};
                rw['Hour'] = hour;
                rw['ProfileID'] = profileID;
                rw['ProfileName'] = profileName;
                rw['Weight'] = weight;
                rw['Duration'] = duration;
                hours.push(rw);     
                // Массив hours содержит данные о продолжительности праката различных профилей в течение часа
                // Если hours путой - вернуть false
                return hours;
            } else {
                return false;
            }
        }
    },

    getFromStartYear: async function(stan, pool) {
    // Подсчет прокатанной продукции с начала года (кг)
        const today = new Date();
        const yy = today.getFullYear()-1
        const stYear = yy + '-12-31 20:00:00'
        const startYear = new Date(stYear);
        let result_data = 0;

        if (stan === 's350') {
            let request = pool.request();
            request.input('startPeriod', startYear);
            let result = await request.query(s350Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }

        if (stan === 's210') {
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

        if (stan === 's350') {
            let request = pool.request();
            request.input('startPeriod', monthBegin);
            let result = await request.query(s350Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }

        if (stan === 's210') {
            let request = pool.request();
            request.input('startPeriod', monthBegin);
            let result = await request.query(s210Queries.prodPeriod).catch(e =>console.log(e));
            result_data = result.recordset[0].Weigth;
        }
        return result_data;
    },
}

module.exports = Model;
