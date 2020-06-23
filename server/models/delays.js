const local = require('data-store')({ path: process.cwd() + '/delay_noplan.json' });

const Delays = {
    AbsoluteValue: 1,
    AdditiveValue: 2,
    Stopped: 3,
    Working: 4,
    // Модуль для работы с внеплановыми простоями

    getDelayDuration: function(stan) {
        // Получить продолжительность сохраненного простоя
        let value = local.get(stan);
        if (!value) {
            value = {};
        }
        if (!value.Duration) {
            value.Duration = 0;
            this.setDelayDuration(stan, 0);
        };
        return value.Duration;
    },

    setDelayDuration: function(stan, duration) {
        // Сохранить продолжительность простоя
        let value = local.get(stan);
        if (!value) {
            value = {};
        }
        if (duration !== false) {
            value['Duration'] = duration;
        } else {
            value['Duration'] = 0;
        }
        local.set(stan, value);
    },

    getStopped: function(stan) {
        // Получение признака остановки стана
        let value = local.get(stan);
        if (!value) {
            value = {};
        }
        if (!value.Stopped) {
            value['Stopped'] = this.Working;
            this.setStopped(stan, this.Working);
        }
        return value.Stopped;
    },

    setStopped: function(stan, stopped) {
        // Установка признака остановки стана
        let value = local.get(stan);
        if (!value) {
            value = {};
        }
        if (stopped !== false) {
            value.Stopped = stopped;
        } else {
            value.Stopped = 0;
        }
        local.set(stan, value);
    },

    getError: function(stan) {
        let value = local.get(stan);
        if (!value) {
            value = {};
            value.Error = false;
            local.set(stan, value);
        }
        if (!value.Error) {
            value.Error = false;
            local.set(stan, value);
        }

        return value.Error;
    },

     setError: function(stan, error) {
        let value = local.get(stan);
        if (!value) {
            value = {};
        }
        value.Error = error;
        local.set(stan, value);
     },

    addDelayDuration: function(stan, duration, valueType) {
        // Увеличение продолжительности простоя на указанную величину
        // В качестве параметра функция принимает полную величину простоя и увеливает на разницу 
        // с предыдущим значением
        let result = false;

        if (duration) {
            let oldValue = this.getDelayDuration(stan);
            let newValue = 0;
            if (!oldValue) {
                oldValue = 0;
            }

            switch (valueType) {
                case 1: {
                    // Передано абсолютное значение продожительностти простоя
                    newValue = oldValue + duration;
                    this.setDelayDuration(stan, newValue);
                    result = true;
                    break;
                }
                case 2: {
                    // Передано составное значение продолжительности простоя
                    if (duration > oldValue) {
                        newValue = oldValue + (duration - oldValue);
                        this.setDelayDuration(stan, newValue);
                        result = true;
                        break;
                    } else {
                        result = false;
                        break;
                    }
                }
                default: {
                    result = false;
                    break;
                }
            }
        }
        return result;
    }
};

module.exports = Delays;
