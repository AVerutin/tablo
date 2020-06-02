const express = require('express');
const config = require('config');
const jwt = require('jsonwebtoken');
const router = express.Router();

router.post('/', (req, res) => {
    if (req.body.password === config.get('admin_pass')){
        let token = jwt.sign({ user: 'admin' }, config.get('secret'), { expiresIn: 86400 });
        res.status(200).send({ auth: true, token: token });
    }
    else return res.status(401).send({ auth: false, token: null });
});



module.exports = router;