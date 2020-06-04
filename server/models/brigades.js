const local = require('data-store')({ path: process.cwd() + '/brigs.json' });
const brigadeQuery = "SELECT [ID], [BDate] FROM [L2Mill].[dbo].[Brigada] WHERE BCur > 0";

const Brigades = {

    // Текущая бригада - для которой рассчитываются производственные показатели
    // Активная бригада - которая выделена на табло как "текущая"

    setSaved: function(saved) {
        // Устанавливает флаг необходимости сохранения состояния бригады в конце смены
        // saved = true - Все изменения сохранены
        local.set('Saved', saved);
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
            if (currMinutes <= 1) {                  // Определение минуты смены бригады  
                let brigDate = currBrig.BDate;
                brigDate = new Date(brigDate = brigDate.setHours(brigDate.getUTCHours()));
                if (Number(today) - Number(brigDate) >= /* 3600000 */ 39600000 ) {  // Определяем время работы бригады, если большее 11 часов, получаем следующую после currBrig
                    let nextBrig = 0;
                    if (currHour == 8 /* 8 */) {
                        nextBrig = this.getNextBrigade(currBrig.ID, "Night");
                    } else {
                        nextBrig = this.getNextBrigade(currBrig.ID, "Day");
                    };
                    // Установить флаг необходимости сохранения состояния и вернуть в вызывающий метод
                    this.setActiveBrigade(nextBrig, true);
                    brig = nextBrig;
                }
            }
        }
        return brig;
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