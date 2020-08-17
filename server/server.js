const express = require('express');
const config = require('config');
const path = require('path');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bodyParser = require("body-parser");

const app = express();

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(function (req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[0]
    if ( token == null ) req.auth = false;
    else {
        jwt.verify(token, config.get('secret'), (err, user) => {
            req.auth = !err;
        })
    }
    next();
});

//app.use('/login', require('./routes/login'));
app.use('/api', require('./routes/api'));
app.use('/', express.static(path.join(__dirname, '../dist')));

var _port = config.get('port');
//app.listen(8080);
app.listen(_port, () => {
    console.log('Server is running on port ' + _port);
});

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(morgan('dev'));