const express = require('express');
const router = express.Router();
const Model = require('../models/Model');
// const oldModel = require('../models/Model_old');
const jwt = require('jsonwebtoken');
const config = require('config');

router.get('/stats', async (req, res) => {
    let data = await Model.getData();
    data.auth = req.auth;
    res.json(data);
});
router.get('/plannedDelays', async (req, res) => {
    let data = {
        's350': Model.getDelayPlan('s350'),
        's210': Model.getDelayPlan('s210')
    };
    res.json(data);
});
router.post('/plannedDelays', async (req, res) => {
    let data = {
        's350': Model.getDelayPlan('s350'),
        's210': Model.getDelayPlan('s210')
    };

    data.s350.delay_planned_time = req.body.s350;
    Model.setDelayPlan('s350', data.s350);

    data.s210.delay_planned_time = req.body.s210;
    Model.setDelayPlan('s210', data.s210);

    res.json(data);
});
router.post('/dev_plan', async (req, res) => {
    if (req.auth) {
        if (req.body) Model.setDevPlan(req.body);
        res.status(200).send();
    } else return res.status(401).send();
});
router.get('/dev_plan', async (req, res) => {
    let result = await Model.getDevPlan(req.query.date);
    res.json(result);
});

router.get('/getSPCTemperature', async (req, res) => {
    let result = await Model.getSPCTemperature();
    res.json(result);
});

router.post('/login', async (req, res) =>{
    if (req.body.pass === config.get('admin_pass')){
        let token = jwt.sign({ user: 'admin' }, config.get('secret'), { expiresIn: 86400 });
        res.status(200).send({ auth: true, token: token });
    }
    else return res.status(401).send({ auth: false, token: null });
});

//////////// TEST MY API ///////////////
router.get('/getProfiles', async(req, res) => {
    let data = await Model.getHourlyProd();
    res.json(data);
})

module.exports = router;
