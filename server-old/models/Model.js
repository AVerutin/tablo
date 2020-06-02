const sql = require('mssql');
const mysql = require('mysql2');
const config = require('config');
const fs = require('fs');
const store = require('data-store')({ path: process.cwd() + '/delay_plan.json' });

let s350Queries = {
    brigadeQuery: "SELECT [ID], [BDate] FROM [L2Mill].[dbo].[Brigada] WHERE BCur > 0",
    // Получаем список всех остановок стана 350
    delayQuery: "SELECT [DELAY_DATETIME] as start\n" +
        "      ,[FINISH_DELAY_DATETIME] as finish\n" +
        "\n" +
        "  FROM [L2Mill].[dbo].[L2_DELAY_HALTLFM1]\n" +
        "  WHERE [DELAY_DATETIME] < @shift_end AND [FINISH_DELAY_DATETIME] > @shift_start",
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
    // Получаем текущую остановку стана 350
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
    // Получение списка прокатываемых профилей за выбранный промежуток времени
    getProfiles: "    CREATE TABLE #shift (\n" +
        "        [Id] [numeric](9, 0) IDENTITY(1,1) NOT NULL,\n" +
        "        [Size] [nvarchar](50) NULL,\n" +
        "        [Length] [int] NULL,\n" +
        "        [Weight] [int] NULL,\n" +
        "        [DataWeight] [datetime] NULL);\n" +
        "\n" +
        "INSERT INTO #shift ([Size], [Length], [Weight], [DataWeight])\n" +
        "SELECT\n" +
        "        [AllPack].[Size],\n" +
        "        [AllPack].[Length],\n" +
        "        [AllPack].[Weight],\n" +
        "        [AllPack].[DataWeight]\n" +
        "FROM [L2Mill].[dbo].[AllPack]\n" +
        "-- WHERE [AllPack].[DataWeight] BETWEEN @startTS AND @finishTS\n" +
        "WHERE [AllPack].[DataWeight] BETWEEN '2020-05-21 12:00:00' AND '2020-05-21 12:59:59'\n" +
        "ORDER BY [AllPack].[DataWeight] ASC;\n" +
        "\n" +
        "SELECT\n" +
        "        [Size] as [Size],\n" +
        "        [Length] as [Lenght],\n" +
        "        SUM([Weight]) as [Weight],\n" +
        "        MIN([DataWeight]) as [Start],\n" +
        "        MAX([DataWeight]) as [Finish]\n" +
        "FROM #shift\n" +
        "GROUP BY [Size], [Length]\n" +
        "ORDER BY [Start] ASC;\n" +
        "\n" +
        "DROP TABLE #shift;"
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
        "ORDER BY [START_DELAY] DESC"
}
let espcQueries = {
    temperature: "SELECT outside_temperature FROM operative"
}

let s350 = new sql.ConnectionPool(config.get("s350"));
let s210 = new sql.ConnectionPool(config.get("s210"));
let espc = mysql.createPool(config.get("espc"));

const Model = {

    getData: async function(){
        return {
            's350': await this.getStats("s350", s350, s350Queries),
            's210': await this.getStats("s210", s210, s210Queries),
            // current_brigade: await this.getCurBrigade(),
            current_brigade: await this.getNextBrigade(),
            temp_in: await this.getSPCTemperature(),
            temp_out: await this.getTemperature(),
        }
    },
    getStats: async function(stan, pool, queries) {
        await pool.connect();
        try {
            let request = pool.request();
            const today = new Date();
            const monthBegin = new Date(today.getFullYear(), today.getMonth() , 1, -1, 0, 0) ;
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
            };

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
                await this._fillStats(pool, queries.delayQuery ,row, stats);
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

        for (let delay of delays.recordset) {
            delStart = Math.max(row.beginTS, delay.start);
            delEnd = Math.min(row.endTS, delay.finish);
            delDuration += Math.max( delEnd - delStart , 0);
        }
        delDuration = Math.min(delDuration, 12 * 3600000);
        let pad = (n, z = 2) => ('00' + n).slice(-z);
        stats.delay_shift[row.brigade] = pad(delDuration/3.6e6|0) + ':' + pad((delDuration%3.6e6)/6e4 | 0);
        stats.dev_shift[row.brigade] = Math.round(row.shiftWeight/1000);
        stats.dev_month[row.brigade] = Math.round(row.monthWeight/1000);
        return row;
    },
    // Определяем номер бригады, которая должна заступить на смену
    getNextBrigade: async function() {

        ////////////////////////////////////////////
        // Тестирование модуля расчета долей часа //
        ////////////////////////////////////////////
        // let timeStart = '2020-05-22 12:45:58.430';
        // this.calcHourPart(timeStart);

        ////////////////////////////////////////////

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

        // По времени смены бригады (8:00 или 20:00) сохранять номер заступающей бригады
        // в переменную newShift, а потом проверять только продолжительность работы
        //  бригады, и если она >= 11 часов и текущее время > времени смены бригады,
        // то current = nextShift

        // Если предыдущая бригада работает >= 12 часов, то необходимо ее сменить
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
            // TODO: Объединить две проверки в одну и учитывать время работы предыдущей бригады
            

            if (now >= timeShift_start && now <= timeShift_finish) {
                // console.log(now.toLocaleString(), 'Запущена проверка номера текущей бригады: ДЕНЬ => НОЧЬ');
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
                fs.appendFile("shift.txt", now.toLocaleString() + ": Смена бригады: " + lastID + " ==> " + current + "!\n", function(error){
                    if(error) console.log('Ошибка записи в файл');
                });
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
                // console.log(now.toLocaleString(), 'Запущена проверка номера текущей бригады: НОЧЬ => ДЕНЬ');
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
                fs.appendFile("shift.txt", now.toLocaleString() + ": Смена бригады: " + lastID + " ==> " + current + "!\n", function(error){
                    if(error) console.log('Ошибка записи в файл');
                });
            }
        } else {
            current = lastID;
        }
        return current;
    },
    // Определение номера бригады от Суховея
    // getCurBrigade: async function(){
    //     await s350.connect();
    //     let request = s350.request();
    //     let result = await request.query(s350Queries.brigadeQuery);
    //     if (result.recordset.length > 0) return result.recordset[0].ID;
    //     else return 0;
    // },
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
    async getProfiles() {
        let data = [
            {
                Profile: "",
                Lenght: 0,
                Weight: 0,
                StartTs: 0,
                FinishTs: 0
            },
            {
                Profile: "",
                Lenght: 0,
                Weight: 0,
                StartTs: 0,
                FinishTs: 0
            }
        ];
        const today = new Date();
        const yyyy = today.getFullYear();
        const mn = today.getMonth() + 1;
        const dd = today.getDate();
        const hh = today.getHours();
        const start = yyyy + '-' + mn + "-" + dd + " " + hh + ":00:00";
        const finish = yyyy + '-' + mn + "-" + dd + " " + hh + ":59:59";


        let request = s350.request();
        // request.input("startTs", sql.DateTime, start);
        // request.input("finishTS", sql.DateTime, finish);
        let result = await request.query(s350Queries.getProfiles);

        let rec = 0;
        if (result.recordset.length > 0) {
            for(let row of result.recordset) {
                data[rec].Profile = row.Size;
                data[rec].Lenght = row.Lenght;
                data[rec].Weight = row.Weight;
                data[rec].StartTs = row.Start;
                data[rec].FinishTs = row.Finish;
                ++rec;
            }
        }
        return data;
    },
    calcHourPart: function(data) {
        now = new Date(data);
        let yy = now.getFullYear();
        let mm = now.getMonth() + 1;
        let dd = now.getDate();
        let hh = now.getHours();
        let startHour = new Date(yy + '-' + mm + '-' + dd + ' ' + hh + ':00:00.000');

        let diffData = now - startHour;
        let percent = Math.round((diffData*100)/3600000, 0);

        console.log(percent);

    }
};

module.exports = Model;