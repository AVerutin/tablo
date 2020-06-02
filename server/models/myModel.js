// Подключение используемых модулей
const sql = require('mssql');
const mysql = require('mysql2');
const config = require('config');
const hourlyStore = require('data-store')( {path: process.cwd() + '/hourly.json' } );

// Запросы для стана 350
let s350Queries = {

};

// Запрросы для стана 210
let s210Queries = {

};

// Запрос для получения температуры на улице
let espcQueries = {
    temperature: "SELECT outside_temperature FROM operative"
}

// Объявление подключений к базам данных
let s350 = new sql.ConnectionPool(config.get("s350"));
let s210 = new sql.ConnectionPool(config.get("s210"));
let espc = mysql.createPool(config.get("espc"));

// Описание модели API
const myModel = {

    getSelectedBrigade: async function() {
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

    // Подсчет прокатанной продукции с начала года (кг)
    getFromStartYear: async function(stan, pool) {
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

    // Подсчет прокатанной продукции с начала месяца (кг)
    getFromStartMonth: async function(stan, pool) {
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
    
    // Преобразование даты из формата Date() в строку
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

    // Получение всех взвешенных пакетов за период времени
    // Если начало и конец периода времени не указано (startTs и finishTs),
    // то данные берутся с начала текущего часа по настоящий момент времени
    // Результирующий набор prof содержит:
    // row['Profile'] - Наименование профиля
    // row['Length'] - Длина пореза
    // row['Weight'] - Взвешенный вес (кг)
    // row['Data'] - Дата и время взвешивания
    // row['LengthTs'] - Продолжительность времени проката
    getProdList: async function(startTs=false, finishTs=false) {
        let tmp350 = s350.request();
        if (!startTs) {
            let today = new Date();
            today = Number(today) + 3 * 3.6e6; // Плюс 3 часа для перевода на местное время
            today = new Date(today);
            let hourBegin = new Date(today.getFullYear(), today.getMonth(), today.getDate(), today.getHours(), 0, 0, 0);
            hourBegin = new Date(hourBegin);
        } else {
            if (typeof(startTs) == 'string') { startTs = new Date(startTs) };
            if (typeof(finishTs) == 'string') { finishTs = new Date(finishTs) };
            today = new Date(Number(finishTs)+3*3.6e6);     // FIXME: Даты приходят на 3 часа меньше
            hourBegin = new Date(Number(startTs)+3*3.6e6);  // FIXME: Даты приходят на 3 часа меньше
        }

        tmp350.input("startTS", sql.DateTime, hourBegin);
        tmp350.input("finishTS", sql.DateTime, today);
        let tmpResult = await tmp350.query(s350Queries.tmpQuery).catch(e =>console.log(e));
        let prof = [];
        for (let r=0; r<tmpResult.recordset.length; ++r) {
            row = {};
            Profile = tmpResult.recordset[r].Size;
            Length = tmpResult.recordset[r].Length;
            Weight = tmpResult.recordset[r].Weight;
            Data = tmpResult.recordset[r].DataWeight;

            row['Profile'] = Profile;   // Наименование профиля
            row['Length'] = Length;     // Длина пореза
            row['Weight'] = Weight;     // Взвешенный вес (кг)
            row['Data'] = Data;         // Дата и время взвешивания
            if (prof.length == 0) {
                // Расчет времени проката
                // Если в этом часу ещё ничего не катали, то берем сначала часа
                LengthTs = Number(Data) - Number(hourBegin);
                row['LengthTs'] = LengthTs; // Расчет продолжительности времени прроката
            } else {
                LengthTs = Number(Data) - Number(prof[r-1].Data);
                row['LengthTs'] = LengthTs; // Расчет продолжительности времени прроката
            };
            // Массив prof содержит все взвешенные пакеты за текущий час
            prof.push(row); 
        };
        return prof;
    },

    // Получение совокупного времени проката профилей в течение указанного периода времени
    // Если начало и конец периода времени не указано (startTs и finishTs),
    // то данные берутся с начала текущего часа по настоящий момент времени
    // Результирующий набор prof содержит:
    // rw['Hour'] - Час
    // rw['Profile'] - Наименование профиля
    // rw['Length'] - Длина пореза
    // rw['Weight'] - Совокупная масса прокатанного за период времени
    // rw['Duration'] - Совокупное время проката
    getHourlyProd: function(startTs=false, finishTs=false) {
        const prof = await this.getProdList(startTs, finishTs);
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
                hour = hourBegin.getUTCHours().toString();
            } else {
                // Доугой профиль и/ил длина пореза
                if (profile != prof[w].Profile || length != prof[w].Length) {
                    rw = {};
                    rw['Hour'] = hour;          // Час
                    rw['Profile'] = profile;    // Наименование профиля
                    rw['Length'] = length;      // Длина пореза
                    rw['Weight'] = weight;      // Совокупный масса прокатанного
                    rw['Duration'] = duration;  // Совокупное время проката
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

        return hours;
    },
    // Получение почасового плана производства продукции
    // в соответствии с профилем проката и длиной пореза
    getProdPlan: async function(stan) {
        let Data = [];
        let request = s350.request();
        let query; 

        if (stan == '350') {
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

        if (stan == '210') {
            query = s210Queries.planProd;
            let result = await request.query(query);
            if (result.recordset.length > 0) {
                for (row of result.recordset) {
                    r = {}
                    r['Profile'] = row.PROFILE;         // Наименование профиля
                    r['Plan'] = row.HOURLY;        // План для короткого пореза (6'000 - 7'999 мм)
                    Data.push(r);
                }
            }
        }

        return Data;
    },
    
    // Сохранение подготовленного состояния по всем часам работы бригады
    saveHourlyPercent: function(stan, data) {
        // Сохранение состояния по часам
        hourlyStore.set(stan, data);
    },

    // Получение данных о всех часах работы текущей бригады
    readHourlyPercent: function(stan) {
        data = hourlyStore.get(stan);
        if (!data) {
            data = {};
        };
        return data;
    },

    // Сохранение текущего часа работы бригады
    putHour: function(stan, hour, value) {
        // 1. Получаем сохраненное ранее состояние бригады
        var data = this.readHourlyPercent(stan);
        // 2. Изменяем значение текущего часс
        h = String(hour);
        data[h] = value;
        // Записываем состояние по часам в локальное хранилище
        this.saveHourlyPercent(stan, data);
    },
    
}

// Экспорт модели API в роутер
module.exports = myModel;