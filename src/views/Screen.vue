<template>
    <div>
        <div id="screen">
            <table>
                <tr class="tab_header">
                    <th colspan="1" class="spc_header">СПЦ:</th>
                    <th colspan="2" class="spc_row">М: {{ spc_month }}</th>
                    <th colspan="2" class="spc_row">Г: {{ spc_year }}</th>
                </tr>
                <tr  class="tab_header">
                    <th class="first-collumn" rowspan="2">{{ clock }}</th>
                    <th colspan="2">t ул: {{ temp_out }}</th>
                    <th colspan="2">t цех: {{ temp_in }}</th>
                </tr>
                <tr>
                    <!-- <th class="tab_header"></th> -->
                    <th :class="{curr_brigade:(current_brigade ===1)}">Бр 1</th>
                    <th :class="{curr_brigade:(current_brigade ===2)}">Бр 2</th>
                    <th :class="{curr_brigade:(current_brigade ===3)}">Бр 3</th>
                    <th :class="{curr_brigade:(current_brigade ===4)}">Бр 4</th>
                </tr>
                <tr>
                    <th colspan="1" class="stan" :class="{working:s350.working}" style="text-align:right;">Стан 350: </th>
                    <th colspan="2" class="stan" :class="{working:s350.working}">М: {{ s350.start_month }}</th>
                    <th colspan="2" class="stan" :class="{working:s350.working}">Г: {{ s350.start_year }}</th>
                </tr>
                <tr class="delay" v-if="(s350.working === false)">
                    <td class="planned_delay" v-if="s350.delay_planned">Плановый простой (Обратный отсчет)</td>
                    <td v-else>Не плановый простой</td>
                    <td colspan="4" :class="{planned_delay:(s350.delay_planned)}" class="timer">{{ s350.delay_timer }}</td>
                </tr>
                <tr v-if="s350.working">
                    <td class="tab_header">Пр-во за смену (т)</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}"> {{ s350.dev_shift[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}"> {{ s350.dev_shift[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}"> {{ s350.dev_shift[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}"> {{ s350.dev_shift[4] }}</td>
                </tr>
                <tr v-if="s350.working">
                    <td class="tab_header">Простой за см</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s350.delay_shift[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s350.delay_shift[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s350.delay_shift[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s350.delay_shift[4] }}</td>
                </tr>
                <tr v-if="s350.working">
                    <td class="tab_header">% вып. плана</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s350.plan_perc[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s350.plan_perc[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s350.plan_perc[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s350.plan_perc[4] }}</td>
                </tr>
                <tr v-if="s350.working">
                    <td class="tab_header">Пр-во с нач. мес.</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s350.dev_month[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s350.dev_month[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s350.dev_month[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s350.dev_month[4] }}</td>
                </tr>
                <tr>
                    <th colspan="1" class="stan" :class="{working:s210.working}" style="text-align:right;">Стан 210:</th>
                    <th colspan="2" class="stan" :class="{working:s210.working}">М: {{ s210.start_month }}</th>
                    <th colspan="2" class="stan" :class="{working:s210.working}">Г: {{ s210.start_year }}</th>
                </tr>
                <tr class="delay" v-if="(s210.working === false) && (s210.error !== true)">
                    <td class="planned_delay" v-if="s210.delay_planned">Плановый простой (Обратный отсчет)</td>
                    <td v-else>Не плановый простой</td>
                    <td colspan="4" :class="{planned_delay:(s210.delay_planned)}" class="timer">{{ s210.delay_timer }}</td>
                </tr>
<!--                    -->
                <tr class="delay" v-if="(s210.error === true)">
                    <td class="error">ВНИМАНИЕ!</td>
                    <td colspan="4" class="error_line"><span class="wrong_profile">НЕВЕРНО УКАЗАН ПРОФИЛЬ: {{ s210.wrong_profile }}</span></td>
                </tr>
<!--                    -->
                <tr v-if="s210.working">
                    <td class="tab_header">Пр-во за смену (т)</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}"> {{ s210.dev_shift[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}"> {{ s210.dev_shift[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}"> {{ s210.dev_shift[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}"> {{ s210.dev_shift[4] }}</td>
                </tr>
                <tr v-if="s210.working">
                    <td class="tab_header">Простой за см</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s210.delay_shift[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s210.delay_shift[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s210.delay_shift[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s210.delay_shift[4] }}</td>
                </tr>
                <tr v-if="s210.working">
                    <td class="tab_header">% вып. плана</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s210.plan_perc[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s210.plan_perc[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s210.plan_perc[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s210.plan_perc[4] }}</td>
                </tr>
                <tr v-if="s210.working">
                    <td class="tab_header">Пр-во с нач. мес.</td>
                    <td :class="{curr_brigade:(current_brigade ===1)}">{{ s210.dev_month[1] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===2)}">{{ s210.dev_month[2] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===3)}">{{ s210.dev_month[3] }}</td>
                    <td :class="{curr_brigade:(current_brigade ===4)}">{{ s210.dev_month[4] }}</td>
                </tr>
            </table>
        </div>
        <div class="container">
            <h1>Планирование простоев</h1>
            <form class="col-12" v-on:submit.prevent>
                <div class="form-group row">
                    <label class="col-9" for="s350.delay_planned_number">Время планируемого простоя стан 350: </label>
                    <input class="form-control col-3" type="time" id="s350.delay_planned_number" v-model.lazy="s350.delay_planned_input">
                </div>
                <div class="form-group row">
                    <label class="col-9"  for="s350.delay_planned_number">Время планируемого простоя стан 210: </label>
                    <input class="form-control col-3" type="time" id="s210.delay_planned_number" v-model.lazy="s210.delay_planned_input">
                </div>
                <button class="btn btn-success" @click="setPlannedDelays">Сохранить</button>
            </form>
        </div>
        </div>
    <!-- </div> -->
</template>

<script>

    export default {
        data: function()  {
            return {
                s350: {
                    dev_shift: [0, 0, 0, 0, 0],
                    delay_shift: [0, 0, 0, 0, 0],
                    plan_perc: [0, 0, 0, 0, 0],
                    dev_month: [0, 0, 0, 0, 0],
                    working: true,
                    delay_start_time: '',
                    delay_planned: false,
                    delay_planned_time: '',
                    start_month: 0,
                    start_year: 0,
                    name: 's350',
                    need_reset_timer: false,
                    error: false,
                    wrong_profile: ''
                },
                s210: {
                    dev_shift: [0, 0, 0, 0, 0],
                    delay_shift: [0, 0, 0, 0, 0],
                    plan_perc: [0, 0, 0, 0, 0],
                    dev_month: [0, 0, 0, 0, 0],
                    working: true,
                    delay_start_time: '',
                    delay_planned: false,
                    delay_planned_time: 0,
                    delay_timer: '',
                    start_month: 0,
                    start_year: 0,
                    name: 's210',
                    need_reset_timer: false,
                    error: false,
                    wrong_profile: ''
                },
                current_brigade: 0,
                temp_in: 0,
                temp_out: 0,
                clock: '',
                dev_plan: {
                    plan_date: '',
                    s350: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
                    s210: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
                },
                pass: '',
                loginError: false,
                auth: false,
                spc_month: 0,
                spc_year: 0,
            }
        },
        name: 'Screen',
        methods: {
            show: function () {
                this.clock = this.formatDate();

                //Clock
                // Таймер каждую секунду при автивном простое
                if (this._timer) clearInterval(this._timer);
                if (!this._timer) {
                    this._timer = setInterval(() => {
                        this.clock = this.formatDateRU();
                        this.updateDelay(this.s350);
                        this.updateDelay(this.s210);
                    }, 1000);
                } 

                 //GetData
                 // Таймер каждые 5 сек при неактивном простое
                if (this._getDataTimer) clearInterval(this._getDataTimer);
                if (!this._getDataTimer) {
                    this._getDataTimer = setInterval(() => {
                        this.getData();
                    }, 5000);
                    if (this.s350.need_reset_timer) {
                        this.s350.delay_planned_input = "00:00";
                        // document.location.reload();
                    } else {
                        if (this.s210.need_reset_timer) {
                            this.s210.delay_planned_input = "00:00";
                            // document.location.reload();
                        }
                    }
                }
            },
            formatDate: function (date, options = {}) {
                let opts = { ...{showDate: true, showTime: true, showSeconds: true, utc: false}, ...options};
                let cd = date || new Date();
                let result = "";
                if (opts.utc) {
                    result = ((opts.showDate) ? this.zeroPadding(cd.getUTCFullYear(), 4) + '-' + this.zeroPadding(cd.getUTCMonth()+1, 2) + '-' + this.zeroPadding(cd.getUTCDate(), 2) : "") +
                        ((opts.showTime) ? ' ' + this.zeroPadding(cd.getUTCHours(), 2) + ':' + this.zeroPadding(cd.getUTCMinutes(), 2) +
                            ((opts.showSeconds) ? ':' + this.zeroPadding(cd.getUTCSeconds(), 2) : "") : "");
                } else {
                    result = ((opts.showDate) ? this.zeroPadding(cd.getFullYear(), 4) + '-' + this.zeroPadding(cd.getMonth()+1, 2) + '-' + this.zeroPadding(cd.getDate(), 2) : "") +
                        ((opts.showTime) ? ' ' + this.zeroPadding(cd.getHours(), 2) + ':' + this.zeroPadding(cd.getMinutes(), 2) +
                            ((opts.showSeconds) ? ':' + this.zeroPadding(cd.getSeconds(), 2) : "") : "");
                }
                return result.trim();
            },

            formatDateRU: function (date) {
                let cd = date || new Date();
                let result = "";

                result = this.zeroPadding(cd.getDate(), 2) + '.' + this.zeroPadding(cd.getMonth()+1, 2) + "." + cd.getFullYear().toString().substr(2,2) + " " +
                     this.zeroPadding(cd.getHours(), 2) + ':' + this.zeroPadding(cd.getMinutes(), 2) + ':' + this.zeroPadding(cd.getSeconds(), 2);

                return result;
            },

            zeroPadding: function (num, digit) {
                let zero = '';
                for (let i = 0; i < digit; i++) {
                    zero += '0';
                }
                return (zero + num).slice(-digit);
            },
            updateDelay: function(stan) {
                let delay = 0;
                if (stan.delay_start_time != 0) { // Если определено время плановой остановки стана
                    delay = (new Date - new Date(stan.delay_start_time)); // Вычисляем время окончания плановой остановки
                    stan.delay_planned = stan.delay_planned_time > delay; // Если время окончания остановки больше, то останов плановый
                    stan.delay_timer = this.formatDate(new Date(Math.abs(stan.delay_planned_time - delay)), {showDate: false, utc: true});
                    if (stan.need_reset_timer) {
                        stan.delay_planned_input = "00:00";
                        // document.location.reload();
                    }
                } else {
                        // stan.delay_planned_input = "00:00";
                }
            },
            async getData () {
                await this.$http({
                    url: process.env.VUE_APP_SERVER_URL + '/api/stats',
                    method: 'get',
                }).then(response => {
                    this.s350 = {...this.s350, ...response.data.s350};
                    this.s210 = {...this.s210, ...response.data.s210};
                    this.current_brigade = response.data.current_brigade;
                    this.temp_out = response.data.temp_out;
                    this.temp_in = response.data.temp_in;
                    this.spc_year = response.data.spc_year;
                    this.spc_month = response.data.spc_month;
                });
            },
            async getPlannedDelays() {
                await this.$http({
                    url: process.env.VUE_APP_SERVER_URL + '/api/plannedDelays',
                    method: 'get',
                }).then(response => {
                    // delay_planned_time - время для счетчика (которое изменяется)
                    // delay_planned_input - время для отображения на веб-форме
                    this.s210.delay_planned_time = response.data.s210.delay_planned_time; // delay_planned_time - Плановое время остановки в милисекундах
                    this.s210.delay_planned_input = this.formatDate(new Date(response.data.s210.delay_planned_time), {utc: true, showDate: false, showSeconds:  false});
                    this.s350.delay_planned_time = response.data.s350.delay_planned_time;
                    this.s350.delay_planned_input = this.formatDate(new Date(response.data.s350.delay_planned_time), {utc: true, showDate: false, showSeconds:  false});
                    if (this.s210.delay_planned_time == 0 ) this.s210.delay_planned_input = '00:00';
                    if (this.s350.delay_planned_time == 0 ) this.s350.delay_planned_input = '00:00';
                });
            },
            async setPlannedDelays() {
                if (this.s210.delay_planned_input)
                    this.s210.delay_planned_time =  (new Date('1970-01-01 ' + this.s210.delay_planned_input + ':00') - 0) + 10800000;
                else
                    this.s210.delay_planned_time = 0;

                if (this.s350.delay_planned_input)
                    this.s350.delay_planned_time =  (new Date('1970-01-01 ' + this.s350.delay_planned_input + ':00') - 0) + 10800000;
                else
                    this.s350.delay_planned_time = 0;

                await this.$http({
                    url: process.env.VUE_APP_SERVER_URL + '/api/plannedDelays',
                    method: 'post',
                    data: {
                        's210': this.s210.delay_planned_time,
                        's350': this.s350.delay_planned_time
                    }
                }).then(response => {
                    this.s210.delay_planned_time = response.data.s210.delay_planned_time;
                    this.s210.delay_planned_input = this.formatDate(new Date(response.data.s210.delay_planned_time), {utc: true, showDate: false, showSeconds:  false});
                    this.s350.delay_planned_time = response.data.s350.delay_planned_time;
                    this.s350.delay_planned_input = this.formatDate(new Date(response.data.s350.delay_planned_time), {utc: true, showDate: false, showSeconds:  false});
                });
            },
            async login(e) {
                e.preventDefault();
                if(this.auth) {
                    this.auth = false;
                    localStorage.removeItem('token');
                } else {
                    self = this;
                    if (this.pass.length > 0) {
                        await this.$http({
                            url: process.env.VUE_APP_SERVER_URL + '/api/login',
                            method: "post",
                            data: {"pass": this.pass}
                        }).then(response => {
                            this.auth = true;
                            localStorage.setItem('token', response.data.token);
                            self.$axios.defaults.headers.common['Authorization'] = response.data.token;
                        }).catch(function (error) {
                            self.loginError = (error.response.status === 401);
                        });
                    }
                }

            },

            async setDevPlan() {
                await this.$http({
                    url: process.env.VUE_APP_SERVER_URL + '/api/dev_plan',
                    method: 'post',
                    data: this.dev_plan
                }).then(response => {
                    this.$bvToast.toast('План сохранен!', {
                        title: `План`,
                        variant: 'success',
                        solid: true,
                        autoHideDelay: 1000,
                    });
                }).catch();
            },

            async getDevPlan() {
                await this.$http({
                    url: process.env.VUE_APP_SERVER_URL + '/api/dev_plan',
                    method: 'get',
                    params: {'date': this.dev_plan.plan_date}
                }).then(response => {
                    this.dev_plan = response.data;
                }).catch();
            },
        },
        mounted() {
            this.auth = this.$AUTH;
            this.dev_plan.plan_date = this.formatDate(undefined ,{showTime: false});
            this.getPlannedDelays();
            this.getData();
            this.getDevPlan();
            this.show();
        }
    }

</script>

<style>
    body {
        margin: 0;
    }

    #screen {
        width: 256px;
        height: 192px;
        font-size: 12px;
        line-height: 12px;
    }

    .delay {
        height: 60px;
        vertical-align: middle;
        text-align: center;
        font-size: 14px;
    }

    .error {
        height: 60px;
        vertical-align: middle;
        text-align: center;
        font-size: 18px;
    }

    .wrong_profile {
        color: darkred;
        font-weight: bold;
    }

    table, td, th {
        border: 1px solid black;
        text-align: center;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        background-color: #fba
    }

    .tab_header{
        background-color: #ffa;
        text-align: center;
    }

    .stan.working{
        background-color: #7f6;
    }
    
    .spc_header {
        background-color: #7f6;
        text-align: right;
    }
    .spc_row {
        background-color: #7f6;
        text-align: center;
    }

    .stan{
        background-color: #f78;
    }

    .curr_brigade{
        background-color: #7d4;
    }

    .active {
        background-color: red;
    }

    .delay .planned_delay {
        background-color: #9ae;
    }

    .delay td {
        background-color: #fa8;
    }

    .delay .timer {
        font-size: 33px;
        font-weight: bold;
        color: #fff;
    }

    .delay .error {
        font-size: 18px;
        font-weight: normal;
        color: #000;
    }

    th.tab_header{
        width: 130px;
        text-align: center;
    }

    tr.tab_header {
        height: 11px;
        line-height: 10px;
    }

    .dev-plan input{
        max-width: 60px;
    }


</style>