const local = require('data-store')({ path: process.cwd() + '/brigs.json' });
const sql = require('mssql');
const brigadeQuery = "SELECT [ID], [BDate] FROM [L2Mill].[dbo].[Brigada] WHERE [BCur] > 0";

const Brigades = {

    // Текущая бригада - для которой рассчитываются производственные показатели
    // Активная бригада - которая выделена на табло как "текущая"

    setSaved: function(saved) {
        // Устанавливает флаг необходимости сохранения состояния бригады в конце смены
        // saved = true - Все изменения сохранены
        local.set('Saved', saved);
    },
    
    setReseted: function(reseted) {
        // Установка флага сброса почасовой статистики при заступлении новой смены
        local.set('Reseted', reseted);
    },

    getReseted: function() {
        // Запрос флага сброса почасовой статистики при заступлении новой смены
        return local.get('Reseted');
    },

    isSaved: function() {
        // Возвращает флаг сохранения бригады
        // isSaved = true - Все изменения сохранены
        return local.get('Saved');
    },

    setActiveBrigade: function(brigNum, saved) {
        // Установить активную бригаду
        let brig = {};
        brig['Brigada'] = brigNum;
        brig['Saved'] = saved;
        local.set(brig);
    },

    getLastBrigade: function() {
        // Получить номер бригады с прошедшей смены
        return local.get('Last');
    },

    setLastBrigade: function(last) {
        // Сохраняем номер бригады с предыдущей смены
        if (last != 0) {
            local.set('Last', last);
        }
    },

    setNulled: function(nulled) {
        // Установка флага обнуления сводных данных о вновь заступившей бригаде
        local.set('Nulled', nulled);
    },

    getNulled: function() {
        // Запрос флага обнуления сводных данных о вновь заступившей бригаде
        return local.get('Nulled');
    },

    getActiveBrigade: async function(pool) {
        // Получить номер активной бригады
        let brig = local.get('Brigada');
        const currBrig = await this.getCurrentBrigade(pool);
        if (!brig) {
            // активная бригада не была установлена ранее, получаем номер текущей из БД
            brig = currBrig.ID;
            this.setActiveBrigade(brig, false);
        }

        // Проверяем, не пришло ли время сменить активную бригаду
        const today = new Date();
        const currHour = today.getHours();
        const currMinutes = today.getMinutes();

        if ( (currHour == 8) || (currHour == 20) ) { // Определение часа смены бригады
            if (currMinutes <= 10) {                  // Определение минуты смены бригады  
                let brigDate = currBrig.BDate;
                brigDate = new Date(brigDate = brigDate.setHours(brigDate.getUTCHours()));
                if (Number(today) - Number(brigDate) >= 39600000) {  // Определяем время работы бригады, если большее 11 часов, получаем следующую после currBrig
                    let nextBrig = 0;
                    if (currHour == 8) {
                        nextBrig = this.getNextBrigade(currBrig.ID, "Night");
                    } else {
                        nextBrig = this.getNextBrigade(currBrig.ID, "Day");
                    };
                    // Установить флаг необходимости сохранения состояния и вернуть в вызывающий метод
                    this.setActiveBrigade(nextBrig, true);
                    brig = nextBrig;
                    this.setLastBrigade(currBrig.ID);
                    let nulled = this.getNulled();
                    if (!nulled) {
                        this.resetActiveBrigade(pool, brig);
                        this.setNulled(true);
                    }
                }
            }
        } else {
            this.setNulled(false);
        }
        return brig;
    },

    resetActiveBrigade: async function(pool, brig) {
        // Сброс производственных показателей активной бригады в начале рабочей смены
        let request = pool.request();
        const sqlQuery = "UPDATE [L2Mill].[dbo].[BrigadaStats] SET [BPercent210] = 100, [BWeight210] = 0, [BPercent350] = 100, " +
            "[BWeight350] = 0 WHERE [ID] = @currBrig;";
        request.input('currBrig', brig);
        await request.query(sqlQuery).catch(e => console.log(e));

    },

    getCurrentBrigade: async function(pool) {
        // Получить номер текущей бригады
        let res;
        let request = pool.request();
        let result = await request.query(brigadeQuery).catch(e => console.log(e));
        if (result.recordset.length > 0) {
            for (row of result.recordset) {
                res = row;
            }
        }
        return res;
    },

    getShiftTime: function() {
        return local.get('ShiftTime');
    },

    setShiftTime: function(shiftTime) {
        local.set('ShiftTime', shiftTime);
    },

    saveShiftTime: async function(pool, BNum, BData) {
        this.setShiftTime(BData);
        const BNames = ['', 'Бригада №1', 'Бригада №2', 'Бригада №3', 'Бригада №4'];
        const sqlQuery = "INSERT INTO [L2Mill].[dbo].[BrigadaShift] ([BNumber], [BName], [BDate]) VALUES (\n" +
                "@bnum, @bname, @bdata);";
        let request = pool.request();
        request.input('bnum', BNum);
        request.input('bname', BNames[BNum]);
        request.input('bdata', BData);
        try {
            await request.query(sqlQuery);
        } catch (err) {
            console.log(err.message);
        }
    },

    // setSh

    getNextBrigade: function(brig, shift) {
        // Получить номер следующей бригады, которая заступит на смену
        // brig - номер бригады, которая сейчас работает
        // shift - тип текущей смены ("Day" или "Night")
        let next = 0;
        switch (shift) {
            case "Day": {
                switch (brig) {
                    case 1 :
                        next = 4;
                        break;
                    case 2 :
                        next = 1;
                        break;
                    case 3 :
                        next = 2;
                        break;
                    case 4 :
                        next = 3;
                        break;
                }
                break;
            };
            case "Night": {
                switch (brig) {
                    case 1 :
                        next = 3;
                        break;
                    case 2 :
                        next = 4;
                        break;
                    case 3 :
                        next = 1;
                        break;
                    case 4 :
                        next = 2;
                        break;
                }
                break;
            };
        };
        return next;

    },

    getPrevBrigade: function(brig, shift) {
        // Получить номер предыдущей бригады, которая работала перед текущей бригадой
        // brig - номер бригады, которая сейчас работает
        // shift - тип текущей смены ("Day" или "Night")
        let prev = 0;
        switch (shift) {
            case "Day": {
                switch (brig) {
                    case 1 :
                        prev = 3;
                        break;
                    case 2 :
                        prev = 4;
                        break;
                    case 3 :
                        prev = 1;
                        break;
                    case 4 :
                        prev = 2;
                        break;
                }
                break;
            };
            case "Night": {
                switch (brig) {
                    case 1 :
                        prev = 2;
                        break;
                    case 2 :
                        prev = 3;
                        break;
                    case 3 :
                        prev = 4;
                        break;
                    case 4 :
                        prev = 1;
                        break;
                }
                break;
            };
        };
        return prev;

    }


};

module.exports = Brigades;