const crypto = require('crypto'),
	CAPTCHASECRET = require('./captchasecret.js'),
	PASSSECRET = require('./passsecret.js'),
	express = require('express'),
	http2 = require('http2'),
	https = require('https'),
	fs = require('fs'),
	bodyParser = require('body-parser'),
	cookieParser = require('cookie-parser'),
	cookie = require('cookie'),
	nodemailer = require('nodemailer'),
	request = require('request'),
	randomHex = require('random-hex'),
	microtime = require('microtime-fast'),
	app = express(),
	port = 8000,
	escape = require('escape-html'),
	geoip = require("geoip-lite"),
	RateLimit = require('express-rate-limit'),
	cloudflare = require('cloudflare-express');

let connection = require('./sql.js'),
	sessionip = {},
	socketipid = {},
	online = [],
	iptime = [];

require('express-http2-workaround')({ express:express, http2:http2, app:app });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser());
app.use(express.static('public', {
	maxage: '2h'
}));
app.use(cloudflare.restore());
app.use((req, res, next)=>{
	if(req.get('host').indexOf('socket') < 0) next();//wot?
	else return res.sendStatus(500);
});


const limiter = new RateLimit({
	windowMs: 2000, // 1 second
	max: 1, // limit each IP to 5 requests per second
	delayMs: 1000, // disable delaying - full speed until the max limit is reached
	skip: function (req, res) {
		console.log(req.path);
		if(req.path == '/fcolor' || req.path == '/color') return false;
		else return true;
	}
});

//  apply to all requests
app.use(limiter);

function jsParseIt(shit){
	let r;
		try {JSON.parse(shit)}
		catch(e){r = []}
	return r || JSON.parse(shit);
}

Array.prototype.getUnique = function(){ //unique values in array
   var u = {}, a = [];
   for(var i = 0, l = this.length; i < l; ++i){
      if(u.hasOwnProperty(this[i])) {
         continue;
      }
      a.push(this[i]);
      u[this[i]] = 1;
   }
   return a;
}

function handleDisconnect() {
	connection = require('./sql.js');

	connection.connect(function(err) {
		if(err) {
			console.log('error when connecting to db:', err);
			setTimeout(handleDisconnect, 2000);
		}
	});
	connection.on('error', function(err) {
		console.log('db error', err);
		if(err.code === 'PROTOCOL_CONNECTION_LOST') handleDisconnect();
		else throw err;
	});
}

handleDisconnect();
//reconnect on mysql disconnect


// create reusable transporter object using the default SMTP transport
var transporter = nodemailer.createTransport('smtps://adm%40worldroulette.ru:nodewr@smtp.yandex.ru');

app.get('/', function (req, res) {
	res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
	if(req.cookies.firstTime != '1' && typeof res.push === 'function'){
		let filenames = ['captcha.js', 'alertify.js', 'chat.css', 'chat.js', 'font-awesome.min.css', 'fuckadblock.js', 'jquery-jvectormap-2.0.3.css', 'jquery-jvectormap-2.0.3.min.js', 'jquery-jvectormap-world-mill-ru.js', 'jquery.js', 'map.js', 'spaceengine.jpg', 'styles.css', 'assets/wr new.png', 'alertify.js', 'socket.io/socket.io.js', 'bootstrap/bootstrap.min.css', 'bootstrap/bootstrap.min.js', 'twemoji.min.js', 'jscolor.min.js', 'jquery.mobile.custom.min.js', 'factions.js'];
		filenames.forEach(el=>{
			if(el.indexOf('.')) return;
			let push = res.push('/'+encodeURI(el));
			push.setHeader('Cache-Control', 'public, max-age=' + (60 * 60 * 2));
			//push.type(el.split('.').pop());
			push.writeHead(200);
			fs.createReadStream(__dirname + '/public/'+el).pipe(push);
		});
		res.setHeader('Set-Cookie', 'firstTime=1; expires=Fri, 31 Dec 9999 23:59:59 GMT');
	}
	if(req.cookies.session){
		connection.query('SELECT session FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {if (err) throw err;
			if(rows[0] && rows[0].session == req.cookies.session){res.sendFile('main.html' , { root : __dirname});}
			else{
				res.cookie('session', '', { maxAge: 0, httpOnly: true });
				res.sendFile('authme.html' , { root : __dirname});
			}
		});
	} else {
		res.sendFile('authme.html' , { root : __dirname});
	}
});

app.post('/register', function (req, res) {
	let err;
	if(!req.body.login || !req.body.pass || !req.body.name || !req.body.captcha) err = 'Не все поля'
	if(req.body.login.length > 15 || req.body.pass.length > 50 || req.body.name.length > 35 || req.body.pass.length < 6 || req.body.login.length < 3 || req.body.name.length < 3) err = 'Неверная длина одного из параметров';
	if(!/^[A-z0-9]*$/.test(req.body.login)) err = 'Неверные символы в логине.';
	req.body.name = escape(req.body.name);
	if(!/^.{3,35}$/.test(req.body.name)) err = 'Неверные символы в имени.';
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	if(req.body.name == ' ' || req.body.name == '') err = 'Пустое имя';
	if(err) res.send({'status': false, 'data': err});
	else request.post({url:'https://www.google.com/recaptcha/api/siteverify', form: {secret: CAPTCHASECRET, response: req.body.captcha, remoteip: req.cf_ip}}, function(err,httpResponse,body){
		if(!err & JSON.parse(body).success == true) connection.query('SELECT * FROM users WHERE login = '+connection.escape(req.body.login), function(err, rows, fields) {if (err) throw err;
				if(rows[0]) return res.send({'status': false, 'data': 'Login already taken!'});
				connection.query('SELECT * FROM users WHERE name = '+connection.escape(req.body.name), function(err, rows, fields) {if (err) throw err;
					if(rows[0]) return res.send({'status': false, 'data': 'Name already taken!'});
					var hash = crypto.createHmac('sha512', PASSSECRET);
					hash.update(req.body.pass);
					var pass = hash.digest('base64');
					var color = randomHex.generate();
					connection.query('INSERT INTO users (login, name, pass, color, emoji, invites, imgur, email, session, confirm) VALUES ('+connection.escape(req.body.login)+', '+
					connection.escape(req.body.name.replace(/[\s\n\r]+/g,' '))+', '+
					connection.escape(pass)+', '+
					connection.escape(color)+', '+
					connection.escape('')+', '+
					connection.escape('')+', '+
					connection.escape('')+', '+
					connection.escape('')+', '+
					connection.escape('')+', '+
					connection.escape('')+
					')', function(err, rows, fields) {if (err) throw err;
						var hash = crypto.createHmac('sha512', pass);
						hash.update(crypto.randomBytes(20).toString('hex'));
						var session = hash.digest('hex');
						connection.query('UPDATE users SET session = '+connection.escape(session)+'WHERE login = '+connection.escape(req.body.login), function(err, rows, fields) {if (err) throw err;
							res.send({'status': true, 'data': session});
						});
					});
				});
			});
		else res.send('Something went wrong!');
	})
});

app.post('/login', (req, res) => {
	let err = null;
	if(!req.body.login || !req.body.pass || !req.body.captcha) err = "Вы не ввели логин/пароль";
	if(!req.body.login) err = "Вы не ввели логин"
	else if(!req.body.pass) err = "Вы не ввели пароль"
	else if(!req.body.captcha) err = "Вы не ввели капчу"
	if(err) return res.send({'status': false, 'data': err})
	request.post({url:'https://www.google.com/recaptcha/api/siteverify', form: {secret: CAPTCHASECRET, response: req.body.captcha, remoteip: req.cf_ip}}, function(err, httpResponse, body){
		if(!err & JSON.parse(body).success == true) connection.query('SELECT pass FROM users WHERE login = '+connection.escape(req.body.login), function(err, rows, fields) {if (err) throw err;
				if(!rows[0]) return res.send({'status': false, 'data': 'Пользователь с таким никнеймом не найден!'})
				let hash = crypto.createHmac('sha512', PASSSECRET);
				hash.update(req.body.pass);
				let pass = hash.digest('base64');
				if(pass == rows[0].pass){
					let hashsess = crypto.createHmac('sha512', pass);
                    hashsess.update(crypto.randomBytes(20).toString('hex'));
					let session = hashsess.digest('hex');
					connection.query(`UPDATE users SET session = ${connection.escape(session)} WHERE login = ` + connection.escape(req.body.login), function(err, rows, fields) {if (err) throw err;
						res.send({'status': true, 'data': session});
					});}
				else res.send({'status': false, 'data': 'Вы неверно ввели пароль!'});
			});
		else res.send('Капча введена неверно!');
	})
});

app.get('/confirm', function (req, res) {
	if(!req.query.a) res.sendStatus(403);
	connection.query('SELECT confirm FROM users WHERE confirm = '+connection.escape(req.query.a), function(err, rows, fields) {if (err) throw err;
		if(rows[0] && rows[0].confirm == req.query.a){
			connection.query('UPDATE users SET confirm = true WHERE confirm = '+connection.escape(req.query.a), function(err, rows, fields) {if (err) throw err;
				res.redirect('/');
			})
		}
	})
})
/*
app.post('/logout', function (req, res) {
	if(!req.body.session || !req.body.login){res.send('No field(s)!');}
	else{
		connection.query('UPDATE users SET session = \'\' WHERE login = '+connection.escape(req.body.login)+'AND session = '+connection.escape(req.body.session), function(err, rows, fields) {if (err) throw err;});
		if(rows[0] && rows[0].session == req.cookies.session){
			res.cookie('session', '', { maxAge: 0, httpOnly: true });
			res.sendFile('authme.html' , { root : __dirname});
		}
	}
});*/
app.post('/get', function (req, res) {
	connection.query('SELECT Country, sp, uid FROM map', function(err, rows, fields) {
		if (err) throw err;
		let sendata = {
				map: {},
				players: {}
			},
			reqPlayers = {};

		for(let i = 0; i<rows.length; i++)
		{
			reqPlayers[rows[i].uid] = true;
			sendata.map[rows[i].Country] = {
				sp: rows[i].sp,
				uid: rows[i].uid
			}
		}

		reqPlayers = Object.keys(reqPlayers).join(', ');
		connection.query(`SELECT Color, name, id, emoji, imgur, fid FROM users WHERE id IN (${reqPlayers})`, function(err, players, fields) {
			if(err) throw err;
			for(let i = 0; i<players.length; i++){
				players[i].name += players[i].emoji;
				delete players[i].emoji;
				sendata.players[players[i].id] = players[i];
			}
			res.send(sendata);
		});
	});
});

app.post('/getenergy', function (req, res) {
	connection.query('SELECT power FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {if (err) throw err;
		if(!rows[0]) res.send('Ошибка сессии!');
		else res.send(rows[0].power.toString());
	});
});

app.post('/getthis', function (req, res) {
	if(!req.cookies.session) res.send('0')
	else connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {
		if (err) throw err;
		if(!rows[0]) res.send('Ошибка сессии!')
		else res.send(rows[0].id+'');
	});
});

app.post('/fcolor', function (req, res) {
	if(!req.cookies.session){res.send('Нет сессии!'); return;}
	if(!req.body.color){res.send('Вы не ввели цвет!'); return;}
	if(/^[0-9A-F]{6}$/i.test(req.body.color)){req.body.color = '#'+req.body.color;}
	if(/^[0-9A-F]{3}$/i.test(req.body.color)){req.body.color = '#'+req.body.color.charAt(0).repeat(2)+req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2) } //convert #123 to #112233
	else if(!/^#[0-9A-F]{6}$/i.test(req.body.color)){res.send('Невалидный цвет!'); return;}
	connection.query('SELECT fid FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) res.send('Ошибка сессии');
		else if(!adm[0].fid)  res.send('Вы не состоите в клане');
		else connection.query('UPDATE factions SET color = '+connection.escape(req.body.color)+' WHERE id = '+connection.escape(adm[0].fid), function(err, rows, fields) {
			io.emit('updatefactions', '');
			res.send('Успех!');
		});
	})
});

app.post('/color', function (req, res) {
	if(!req.cookies.session){res.send('Нет сессии!'); return;}
	if(!req.body.color){res.send('Вы не ввели цвет!'); return;}
	if(/^[0-9A-F]{6}$/i.test(req.body.color)){req.body.color = '#'+req.body.color;}
	if(/^[0-9A-F]{3}$/i.test(req.body.color)){req.body.color = '#'+req.body.color.charAt(0).repeat(2)+req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2) } //convert #123 to #112233
	else if(!/^#[0-9A-F]{6}$/i.test(req.body.color)){res.send('Невалидный цвет!'); return;}
	connection.query('SELECT session, id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {
		if(!user[0]) res.send('Ошибка сессии!')
		else connection.query('UPDATE users SET color = '+connection.escape(req.body.color)+'  WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {
			io.emit('updateplayers', [user[0].id]);
			res.send('Успех!');
		})
	})
});

let maxsp = 3;
app.post('/roll', function (req, res) {
	let ip = sessionip[req.cookies.session];
	let geo = geoip.lookup(ip);
	let allowedCountries = ['RU', 'UA', 'BY', 'KZ'];
	if(!geo.country || allowedCountries.indexOf(geo.country) == -1) res.send(jsonerror('Игра корректно функционирует только в странах СНГ!'));
	else if(!req.cookies.session) res.send(jsonerror('Нет сессии!'));
	else if(!req.body.target) res.send(jsonerror('Нет цели!'));
	else if( iptime.indexOf(sessionip[req.cookies.session]) > -1) res.send(jsonerror('Подождите немного!'));
	else request.post({url:'https://www.google.com/recaptcha/api/siteverify', form: {secret: CAPTCHASECRET, response: req.body.captcha, remoteip: req.cf_ip.slice(7)}}, function(err,httpResponse,body){
		connection.query(`UPDATE users SET power = ${(JSON.parse(body).success ? '15' : 'power')} WHERE session = ${connection.escape(req.cookies.session)}`, function(err, rows, fields) {
			connection.query('SELECT power FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {
				if(!rows[0]) res.send(jsonerror('Неверная сессия!'));
				else if(!rows[0] || rows[0].power < 1) res.send(jsonerror('Нет капчи!'));//Мощность игрока кончилась, капчи нет
				else connection.query('SELECT time - '+Date.now()+' AS time FROM `users` WHERE session = '+connection.escape(req.cookies.session), function(err, timeres) {
					if(timeres[0].time > -5000) return res.send(jsonerror('Подождите немного!'));
					let rand = pad(getRandomInt(1, 10000), 5)//rand число от 0 до 10000 pad - распидорасить его впереди 4 нул
					let sp, numbers;
					if(checkdits(rand.toString().slice(-4).split('')) == true){//если это число кончается на 4 равных цифры
						sp = 4;
						numbers = 4;
					}
					else if(checkdits(rand.toString().slice(-3).split('')) == true){//если это число кончается на 3 равных цифры
						sp = 2;
						numbers = 3;
					}
					else if(checkdits(rand.toString().slice(-2).split('')) == true){//если это число кончается на 2 равных цифры
						sp = 1;
						numbers = 2;
					}
					else
					{
						return connection.query('SELECT sp, uid FROM map WHERE Country = '+connection.escape(req.body.target), function(err, befuser, fields) {//Взять из бд инфу о владельце территории
							connection.query('SELECT name, id, fid FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, nowuser, fields) {//Взять из бд инфу о текщуем пользователе
								if(befuser[0].sp == maxsp && befuser[0].uid == nowuser[0].id) res.send(jsonnote('Территория уже улучшена до максимального уровня'));
								else res.send(jsonfail('Вам выпало '+rand, req.cookies.session));
							});
						});
                    }//Если у этого числа нет одинаковых чисел
					connection.query('SELECT name, id, fid FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, nowuser, fields) {//Взять из бд инфу о текщуем пользователе
						if(!nowuser || !nowuser[0]) res.send(jsonerror('Неверная сессия'))//Нет такой сессии(?!)
						else connection.query('SELECT sp, uid FROM map WHERE Country = '+connection.escape(req.body.target), function(err, befuser, fields) {//Взять из бд инфу о владельце территории
							if(!befuser[0]) return res.send(jsonerror('Такой территории не существует'));//Нет такой терры(?!)
							connection.query('SELECT session, fid FROM users WHERE id = '+connection.escape(befuser[0].uid), function(err, befsess, fields) {//Взять из бд инфу о сессии пред пользователя для уведомления
								if((befuser[0].uid != nowuser[0].id) && ((befsess[0].fid != nowuser[0].fid && (nowuser[0].fid || befsess[0].fid)) || (befsess[0].fid == 0 && nowuser[0].fid == 0)))
								{//Если разные кланы
									if(befuser[0].sp <= sp){ //Если владелец терры меняется(очков силы хватило на захват)
										if(befuser[0].sp == sp){
											connection.query(`UPDATE map SET uid = ${connection.escape(nowuser[0].id)}, sp = 1 WHERE Country = `+connection.escape(req.body.target), (err, rows, fields)=>{})
											res.send(jsonsuccess(`Вам выпало: ${rand} и вы успешно захватили территорию "[${req.body.target}]"`, req.cookies.session, numbers));
										}
										else {
											connection.query(`UPDATE map SET uid = ${connection.escape(nowuser[0].id)}, sp = ${sp} WHERE Country = `+connection.escape(req.body.target), (err, rows, fields)=>{})
											res.send(jsonsuccess(`Вам выпало: ${rand} и вы успешно захватили территорию "[${req.body.target}]"`, req.cookies.session, numbers));
										}
									} else {//Если владелец остается, но сила уменьшается
										sp = befuser[0].sp-sp;
										connection.query(`UPDATE map SET sp = ${connection.escape(sp)} WHERE Country = `+connection.escape(req.body.target), (err, rows, fields)=>{});
										res.send(jsonsuccess(`Вам выпало: ${rand}, но у территории было ${befuser[0].sp} силы, поэтому "[${req.body.target}]" остается у владельца, но имеет силу ${sp}`, req.cookies.session, numbers));
									}
									/* УВЕДОМЛЕНИЯ */
									if(befsess[0].fid) connection.query('SELECT users FROM factions WHERE id = '+connection.escape(befsess[0].fid), function(err, faction, fields) {
										if(!faction[0]) return;
										let fusers = jsParseIt(faction[0].users);
										fusers.splice(fusers.indexOf(befuser[0].uid), 1);//убираем самого себя из клана
										for(var i = 0; i<fusers.length; i++){
											connection.query('SELECT session FROM users WHERE id = '+connection.escape(fusers[i]), function(err, clanusr, fields) {
												io.to(socketipid[sessionip[clanusr[0].session]]).emit('attack', `${nowuser[0].name} атаковал территорию "[${req.body.target}]" вашей фракции`);//Уведомить об атаке людей во фракции
											})
										}
									});
									io.to(socketipid[sessionip[befsess[0].session]]).emit('attack', `${nowuser[0].name} атаковал вашу территорию "[${req.body.target}]"`);
									/* УВЕДОМЛЕНИЯ */
								} else { //Если один клан
									if(befuser[0].sp == maxsp) return res.send(jsonnote('Территория уже улучшена до максимального уровня'));
									sp = befuser[0].sp+sp;
									if(sp > maxsp) sp = maxsp;
									connection.query(`UPDATE map SET sp = ${connection.escape(sp)} WHERE Country = `+connection.escape(req.body.target), (err, rows, fields)=>{
										res.send(jsonsuccess(`Вам выпало: ${rand} и теперь территория "[${req.body.target}]" имеет силу ${sp}`, req.cookies.session, numbers));
									});
									/* УВЕДОМЛЕНИЯ */
									if(befuser[0].uid != nowuser[0].id) io.to(socketipid[sessionip[befsess[0].session]]).emit('heal', `${nowuser[0].name} улучшил вашу территорию "[${req.body.target}]"`);
									/* УВЕДОМЛЕНИЯ */
								}
							})
						})
					})
				})
			})
		})
	})
});

app.post('/fremove', function (req, res) {
	connection.query('SELECT fid FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) res.send('Ошибка сессии');
		else if(!adm[0].fid)  res.send('Вы не состоите в клане');
		else connection.query('SELECT users FROM factions WHERE id = '+connection.escape(adm[0].fid), function(err, faction, fields) {
			//Убрать пользователей из фракции
			if(!faction[0]) return res.send('Такой фракции не существует');
			let fusers = jsParseIt(faction[0].users);
			connection.query(`UPDATE users SET fid = 0 WHERE id IN (${fusers.join(', ')})`, function(err, rows, fields) {
				io.emit('updateplayers', fusers);
				connection.query('DELETE FROM factions WHERE id = '+connection.escape(adm[0].fid), function(err, rows, fields) {if(err) throw(err);
					res.send('Успех!');
					io.emit('updatefactions', '');
				})
			});
		});
		//Убрать приглашения во фракцию
		connection.query(`SELECT invites, id FROM users WHERE invites = "[${adm[0].fid}]" OR invites LIKE "[${adm[0].fid}," OR invites LIKE "%,${adm[0].fid}]" OR invites LIKE "%,${adm[0].fid},%"`, function(err, users, fields){
			for(let i = 0; i<users.length; i++){
				let invites = jsParseIt(users[i].invites);
				invites.splice(invites.indexOf(users[i].fid), 1);
				connection.query(`UPDATE users SET invites = ${connection.escape(JSON.stringify(invites))} WHERE id = `+connection.escape(users[i]));
			}
		})
	})
});

app.post('/fleave', function (req, res) {
	connection.query('SELECT login, color, fid, id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, thisguy, fields) {
		if(err) throw err;
		if(!thisguy || !thisguy[0]) res.send('Ошибка сессии!');
		else if(!thisguy[0].fid) res.send('Вы не состоите в клане!');
		else connection.query('SELECT users, id FROM factions WHERE id = '+connection.escape(thisguy[0].fid), function(err, faction, fields) {
			if(err) throw err;
			connection.query('UPDATE users SET fid = 0 WHERE id = '+connection.escape(thisguy[0].id), function(err, rows, fields) {
				if(err) throw err;
				io.emit('updateplayers', [thisguy[0].id]);
				res.send('Успех!');
			});
			if(!faction || !faction[0]) return;
			let fusers = jsParseIt(faction[0].users);
			fusers.splice(fusers.indexOf(thisguy[0].id), 1);//убираем самого себя из клана
			connection.query('UPDATE factions SET users = '+connection.escape(JSON.stringify(fusers))+' WHERE id = '+connection.escape(faction[0].id), function(err, rows, fields) {})
		})
	})
});

app.post('/fdecline', function (req, res) {
	if(!req.body.fid) res.send('Вы не выбрали клан');
	else if(!req.cookies.session) res.send('Нет сессии!');
	else connection.query('SELECT invites, login FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, thisguy, fields) {
		if(!thisguy[0]) return res.send('Ошибка сессии!');
		let invites = jsParseIt(thisguy[0].invites),
			index = invites.indexOf(req.body.fid);
		if(index < 0) res.send('Вас не приглашали в эту фракцию!');
		else{
			invites.splice(index, 1);
			connection.query('UPDATE users SET invites = '+connection.escape(JSON.stringify(invites))+' WHERE login = '+connection.escape(thisguy[0].login), function(err, rows, fields) {
				res.send('Приглашение отменено');
			})
		}
	});
});

app.post('/fjoin', function (req, res) {
	if(!req.body.fid) res.send('Вы не выбрали фракцию')
	else if(!req.cookies.session) res.send('Нет сессии!')
	else connection.query('SELECT invites, login, fid, id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, thisguy, fields) {
		if(!thisguy[0]) return res.send('Ошибка сессии!');
		let invites = jsParseIt(thisguy[0].invites);
		let index = invites.indexOf(req.body.fid);
		if(index < 0) res.send('Вас не приглашали в эту фракцию!');
		else connection.query('SELECT users, color FROM factions WHERE id = '+connection.escape(req.body.fid), function(err, faction, fields) {
			if(!faction[0]) return res.send('Такой фракции не существует!');
			if(thisguy[0].fid) return res.send('Вы уже состоите во фракции');
			invites.splice(index, 1);
			let users = jsParseIt(faction[0].users);
			users.push(thisguy[0].id);
			connection.query('UPDATE factions SET users = '+connection.escape(JSON.stringify(users))+' WHERE id = '+connection.escape(req.body.fid), (err, rows, fields)=>{});
			connection.query('UPDATE users SET invites = '+connection.escape(JSON.stringify(invites))+', fid = '+connection.escape(req.body.fid)+' WHERE session = '+connection.escape(req.cookies.session), (err, rows, fields)=>{});
			res.send('Успех!');
		})
	})
});

app.get('/currfusers', function (req, res) {
	if(!req.cookies.session){res.send('Нет сессии!')}
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {
		if(!user[0]) res.send('Ошибка сессии!');
		else connection.query(`SELECT users FROM factions WHERE users REGEXP '\\\\[${user[0].id}\\\\]|,${user[0].id}\\\\]|,${user[0].id},|\\\\[${user[0].id},'`, function(err, faction, fields) {
			if(!faction || !faction[0]) res.send('Такой фракции не существует!');
			else res.send(faction[0].users);
		})
	})
});

app.post('/fkick', function (req, res) {
	if(!req.cookies.session) res.send('Нет сессии!');
	else connection.query('SELECT login, name, id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) res.send('Ошибка сессии!');
		else if(adm[0].id == req.body.fid) res.send('Вы не можете выгнать самого себя!');
		else connection.query('SELECT id, users FROM factions WHERE admin = '+connection.escape(adm[0].id), function(err, faction, fields) {
			if(!faction[0]) res.send('Такой фракции не существует!');
			else connection.query('SELECT fid FROM users WHERE id = '+connection.escape(req.body.fid), function(err, targetguy, fields) {
				if(!targetguy[0]) res.send('Такого игрока не существует!');
				else if(!targetguy[0].fid) res.send('Игрок не состоит в клане!');
				else if(targetguy[0].fid != faction[0].id) res.send('Игрок состоит не в вашем клане');
				else connection.query('UPDATE users SET fid = "" WHERE id = '+connection.escape(req.body.fid), function(err, rows, fields) {
					if(err) throw err;
					let users = jsParseIt(faction[0].users);
					users.splice(users.indexOf(targetguy[0].id), 1);
					connection.query('UPDATE factions SET users = '+connection.escape(JSON.stringify(users))+' WHERE id = '+connection.escape(faction[0].id), function(err, rows, fields) {
						res.send('Успех!');
					});
					io.emit('updateplayers', [req.body.fid]);
				})
			})
		})
	})
});

app.get('/currinvites', function (req, res) {
	if(!req.cookies.session) res.send('[]');
	else connection.query('SELECT invites FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {
		if(user) res.send(JSON.stringify(jsParseIt(user[0].invites)));
		else res.send('[]');
	})
});

app.post('/finvite', function (req, res) {
	if(!req.body.pid){res.send('Вы не выбрали игрока')}
	else if(!req.cookies.session){res.send('Нет сессии!')}
	else connection.query('SELECT id, name FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) res.send('Ошибка сессии!');
		else if(adm[0].id == req.body.pid) res.send('Вы не можете пригласить себя!');
		else connection.query('SELECT id, users, name FROM factions WHERE admin = '+connection.escape(adm[0].id), function(err, faction, fields) {
			if(!faction[0]) res.send('Такой фракции не существует!');
			else connection.query('SELECT invites, id, name FROM users WHERE id = '+connection.escape(req.body.pid), function(err, invguy, fields) {
				if(!invguy[0]) return res.send('Такого игрока не существует');
				let invites = jsParseIt(invguy[0].invites);
				if(invites.indexOf(faction[0].id) > -1) return res.send('Вы уже приглашали этого игрока!');
				invites.push(faction[0].id);
				connection.query('UPDATE users SET invites = '+connection.escape(JSON.stringify(invites))+' WHERE id = '+connection.escape(invguy[0].id), function(err, rows, fields){if(err) throw err;
					res.send('Вы пригласили игрока '+invguy[0].name);
					io.to(socketipid[sessionip[invguy[0].session]]).emit('invite', `${adm[0].name} пригласил вас во фракцию "${faction[0].name}"`);
				})
			})
		})
	})
});

app.post('/fcreate', function (req, res) {
	if(!req.cookies.session) res.send('Нет сессии!')
	else if(!req.body.fname) res.send('Вы не выбрали название фракции!')
	else if(!req.body.color) res.send('Вы не выбрали цвет фракции!')
	else if(!/^[A-z0-9А-я ]{3,35}$/.test(req.body.fname)) res.send('Неверные символы в названии фракции.')
	else{
		if(req.body.fname.replace(/[ ‎\s\n\r]+/g,' ') == '' || req.body.fname.replace(/[ ‎\s\n\r]+/g,' ') == ' ') return res.send('Вы не выбрали название фракции!');
		else req.body.fname = req.body.fname.replace(/[ ‎\s\n\r]+/g,' ')
		if(/^[0-9A-F]{6}$/i.test(req.body.color)) req.body.color = '#'+req.body.color;
		if(/^[0-9A-F]{3}$/i.test(req.body.color)) req.body.color = '#'+req.body.color.charAt(0).repeat(2)+req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2) //convert #123 to #112233
		else if(!/^#[0-9A-F]{6}$/i.test(req.body.color)) res.send('Невалидный цвет!');
		else connection.query('SELECT name FROM factions WHERE name = '+connection.escape(req.body.fname), function(err, rows, fields) {
			if(rows[0]) res.send('Название уже занято');
			else connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
				if(!adm[0]) res.send('Неверная сессия!');
				else connection.query('SELECT id FROM factions WHERE admin = '+connection.escape(adm[0].id), function(err, rows, fields) {
					if(rows && rows[0] && rows[0].fid) res.send('Вы уже владеете фракцией');
					else connection.query('INSERT INTO factions (name, admin, users, color) VALUES ('+connection.escape(req.body.fname)+', '+connection.escape(adm[0].id)+', '+connection.escape('['+adm[0].id+']')+', '+connection.escape(req.body.color)+')', function(err, rows, fields) {
						connection.query('SELECT id FROM factions WHERE name = '+connection.escape(req.body.fname), function(err, newf, fields) {if(err) throw err;
							connection.query('UPDATE users SET fid = '+connection.escape(newf[0].id)+' WHERE id = '+connection.escape(adm[0].id), (err, rows, fields)=>{
								res.send('Успех!');
								io.emit('updateplayers', [adm[0].id]);
							})
						})
						io.emit('updatefactions', '');
					})
				})
			})
		})
	}
});

app.post('/name', function (req, res) {
	if(!req.cookies.session) return res.send('Нет сессии!');
	if(!req.body.name) return res.send('Пустой запрос!');
	req.body.name = escape(req.body.name);
	if(!/^[\wа-я]{3,35}$/gi.test(req.body.name)) return res.send('Неверные символы в имени.');
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	if(req.body.name == ' ' || req.body.name == '') res.send('Пустой запрос');
	else connection.query('SELECT name FROM users WHERE name = '+connection.escape(req.body.name), function(err, rows, fields) {
		if(rows[0]) res.send('Имя уже занято!')
		else connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {
			if(!user[0]){res.send('Неверная сессия!')}
			else connection.query('UPDATE users SET name = '+connection.escape(req.body.name)+' WHERE session = '+connection.escape(req.cookies.session), (err, rows, fields)=>{
				io.emit('updateplayers', [user[0].id]);
				res.send('Ваше имя изменено на '+req.body.name);
			})
		})
	})
});

app.post('/emoji', function (req, res) {
	if(!req.cookies.session) return res.send('Нет сессии!');
	req.body.emoji = escape(req.body.emoji);
    req.body.emoji = req.body.emoji.replace(/[ ‎\s\n\r]+/gm,' ');
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {
		if(!user[0]) return res.send('Неверная сессия!')
		let winners = {13: 1, 648: 3, 675: 2, 945: 2, 1954: 1, 1231: 5, 806: 1, 908: 1, 2193: 1, 2242: 1, 1667: 1},
			keys = Object.keys(winners),
			index = keys.indexOf(user[0].id.toString());
		if(index < 0) res.send('Вы еще ни разу не захватили мир');
		else if(winners[keys[index]]*2 < req.body.emoji.length) res.send('Emoji больше чем захватов мира');
		else connection.query('UPDATE users SET emoji = '+connection.escape(req.body.emoji)+' WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {
			res.send('Ваша emoji изменена на '+req.body.emoji);
			io.emit('updateplayers', [user[0].id]);
		})
	})
});


app.post('/fname', function (req, res) {
	if(!req.cookies.session) return res.send('Нет сессии!');
	if(!req.body.name) return res.send('Вы не ввели название фракции!');
	if(!/^[A-z0-9А-я ]{3,35}$/.test(req.body.name)) return res.send('Неверные символы в имени.');
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	if(req.body.name == '' || req.body.name == ' ') return res.send('Пустое название');
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) return res.send('Ошибка сессии!');
		connection.query('SELECT id FROM factions WHERE admin = '+connection.escape(adm[0].id), function(err, faction, fields) {
			if(!faction[0] || faction[0] == '') res.send('Такой фракции не существует');
			else connection.query(`SELECT id FROM factions WHERE id <> ${faction[0].id} AND name = `+connection.escape(req.body.name), function(err, anotherFaction, fields) {
				if(anotherFaction[0]) return res.send('Название уже занято');
				connection.query('UPDATE factions SET name = '+connection.escape(req.body.name)+' WHERE admin = '+connection.escape(adm[0].id), function(err, rows, fields) {
					res.send('Успех!');
					io.emit('updatefactions', '');
				});
			})
		})
	})
});

app.get('/getfname', function(req, res){
	if(!req.cookies.session) res.send('Нет сессии!');
	else connection.query('SELECT name FROM factions WHERE id = '+connection.escape(req.query.id), function(err, faction, fields) {
		if(faction[0]) res.send(faction[0].name);
		else res.send(undefined);
	})
});

app.get('/factions', function(req, res){
	connection.query('SELECT color, id, name FROM factions', function(err, factions, fields) {
		let rs = {};
		for(let i = 0; i<factions.length; i++){
			let faction = factions[i];
			rs[faction.id] = {color: faction.color, name: faction.name};
		}
		res.send(JSON.stringify(rs));
	})
});

app.post('/give', function (req, res) {
	if(!req.cookies.session) res.send('Нет сессии!')
	else if(!req.body.target) res.send('Вы не выбрали страну!');
	else if(!req.body.targetplid) res.send('Нет указан игрок!');
	else connection.query('SELECT id, name FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, oldusr, fields) {if (err) throw err;//get login of curr user
		if(!oldusr[0]) res.send('Неверная сессия!')
		else connection.query('SELECT uid FROM map WHERE Country = '+connection.escape(req.body.target), function(err, rows, fields) {if (err) throw err;//get login of target's owner
			if(!rows[0]) res.send('Такой территории не существует!');
			else if(rows[0].uid != oldusr[0].id) res.send('Эта территория принадлежит не вам!');
			else connection.query('SELECT color, name, fid, session FROM users WHERE id = '+connection.escape(req.body.targetplid), function(err, nowuser, fields) {if (err) throw err;//get target player's info
				if(!nowuser[0] || !nowuser[0].name || !nowuser[0].color) res.send('Не надо пожалусто');
				else if(!nowuser[0]) res.send('Такого пользователя не существует!');
				else connection.query('SELECT color FROM factions WHERE id = '+connection.escape(nowuser[0].fid), function(err, nowclan, fields) {if (err) throw err; //Взять из бд инфу о цвете клана
					if(nowclan && nowclan[0] && nowclan[0].color != '' && nowuser[0].fid) nowuser[0].color = nowclan[0].color
					connection.query(`UPDATE map SET uid = ${connection.escape(req.body.targetplid)} WHERE Country = `+connection.escape(req.body.target), function(err, a, fields) {
						res.send(`Территория "[${req.body.target}]" теперь принадлежит игроку ${nowuser[0].name}`);
						io.emit('updatemap', '');
						if(nowuser[0].session != '' && nowuser[0].session){
							io.to(socketipid[sessionip[nowuser[0].session]]).emit('attack', `${oldusr[0].name} передал вам территорию "[${req.body.target}]"`);//Уведомить об атаке
						}
					})
				})
			})
		})
	})
})

app.get('/currf', function (req, res) {
	connection.query('SELECT id, fid FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, adm, fields) {
		if(!adm[0]) res.send('Ошибка сессии');
		else if(!adm[0].fid)  res.send('-1');
		else connection.query('SELECT admin FROM factions WHERE id = '+connection.escape(adm[0].fid), function(err, faction, fields) {
			if(!faction || !faction[0]) res.send('0');
			else if(faction[0].admin == adm[0].id) res.send('1');
			else res.send('0');
		})
	})
});


app.get('/getplayers', function (req, res) {
	if(!IsJsonString(req.query.ids)) return res.sendStatus(500);
	let ids = JSON.parse(req.query.ids)
	if(ids.length < 1) return res.sendStatus(500);
	for(let i = 0; i<ids.length; i++){
		let el = parseInt(ids[i])
		if(typeof el != 'number' || !isNaN(el)) return res.sendStatus(500)
		else ids[i] = el + ''
	}
	connection.query(`SELECT Color, name, id, emoji, imgur, fid FROM users WHERE id IN (${ids.join(', ')})`, function(err, players, fields) {
		let rs = {};
		if(!players) return res.send(rs);
		for(let i = 0; i<players.length; i++){
			let el = players[i]
			el.name += el.emoji;
			delete el.emoji;
			if(!el.imgur) delete el.imgur;
			if(!el.fid) delete el.fid;
			rs[el.id] = el;
		}
		res.send(rs);
	})
});

function checkdits(arr){
	var res = true;
	for(var i = 0; i<arr.length-1; i++)
	{
		if(arr[i+1] != arr[i]){res = false}
	}
	return res;
}

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function getRandomInt(min, max)
{
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function jsonerror(data){
	return JSON.stringify({result: 'error', data: data});
}
function jsonfail(data, kdsession){
	if(kdsession) {
		//console.log('iptime: ' + iptime);
		let ip = sessionip[kdsession];
		iptime.push(ip);
		setTimeout(()=>{iptime.splice(iptime.indexOf(ip), 1)}, 5000);
		connection.query('UPDATE users SET power = power-1, time = '+Date.now()+' WHERE session = '+connection.escape(kdsession), function(err, rows, fields) {if (err) throw err;});
	}
	return JSON.stringify({result: 'fail', data: data});
}
function jsonsuccess(data, kdsession, numbers){
	if(kdsession) {
		let ip = sessionip[kdsession];
		iptime.push(ip);
		setTimeout(()=>{iptime.splice(iptime.indexOf(ip), 1)}, 5000);
		connection.query('UPDATE users SET power = power-1, time = '+Date.now()+' WHERE session = '+connection.escape(kdsession), function(err, rows, fields) {if (err) throw err;});
	}
	io.emit('updatemap', '');
	const rs = {result: 'success', data: data};
	if(numbers) rs.numbers = numbers;
	return JSON.stringify(rs);
}
function jsonnote(data){
	return JSON.stringify({result: 'note', data: data});
}


function getname(session, func){
	connection.query('SELECT name FROM users WHERE session = '+connection.escape(session), function(err, rows, fields) {if (err) throw err;
		if(rows[0] && rows[0].name){func(rows[0].name)}
		else{func(null)}
	});
}
function getlogin(session, func){
	connection.query('SELECT login FROM users WHERE session = '+connection.escape(session), function(err, rows, fields) {if (err) throw err;
		if(rows[0] && rows[0].login){func(rows[0].login)}
		else{func(null)}
	});
}
function getid(session, func){
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(session), function(err, rows, fields) {if (err) throw err;
		if(rows[0] && rows[0].id){func(rows[0].id)}
		else{func(null)}
	});
}
function getcolor(session, func){
	connection.query('SELECT color FROM users WHERE session = '+connection.escape(session), function(err, rows, fields) {if (err) throw err;
		if(rows[0] && rows[0].color){func(rows[0].color)}
		else{func(null)}
	});
}


var chatblocked = false;

app.post('/write', function (req, res) {
	if(!req.body.msg) return res.send('Пустое сообщение');
	if(!req.cookies.session) return res.send('Вы не авторизованы!');
	let msg;
	if(req.body.msg.length > 200) msg = req.body.msg.substr(0, 200);
	else msg = req.body.msg;
	if(msg.replace(/[ ‎\s\n\r]+/g,' ') == '' || msg.replace(/[ ‎\s\n\r]+/g,' ') == ' ') return;
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields){
		if(!rows[0]) return res.send('Неверная сессия');
		fs.readFile('chat.json', (err, data) => {
			if (err) throw err;
			if(!IsJsonString(data)) return res.sendStatus(503);
			let content = JSON.parse(data);
			msg = msg.replace(/[ ‎\s\n\r]+/g,' ');
			msg = msg.replace(/\n/g, ' ');
			msg = escape(msg);
			msg = msg.replace(/((?:http|https):\/\/)?([-a-zа-я0-9.]{2,256}\.([a-zа-я]{1,10}))(?:\/[-a-zа-я0-9@:%_\+.~#?&//=]*)?/gi, function(href,protocol,site,tld){
				if(tldList.indexOf(tld.toLocaleLowerCase()) > -1) return `<a href="${protocol ? href : 'https://'+href}" target="_blank">${href.length > 30 ? href.substr(0, 30)+'...' : href}</a>`;
				else return href;
			});
			let to;
			msg = msg.replace(/^\/msg ([0-9]{1,5}) (.+)$/i, function(a,b,c){
				to = b;
				return c;
			})
			if(to) content[microtime.now()] = {msg: msg, id: rows[0].id, to: to};
			else content[microtime.now()] = {msg: msg, id: rows[0].id};
			let keys = Object.keys(content);
			if(keys.length > 100){
				var newobj = {};
				var index = keys.length-100;
				for(var i = index; i<keys.length; i++){
					newobj[keys[i]] = content[keys[i]];
				}
				content = newobj;
			}
			if(chatblocked !== true){
				chatblocked = true;
				fs.writeFile('chat.json', JSON.stringify(content), (err) => {if (err) throw err;
					io.emit('updatechat', keys[keys.length-2]);
					res.send('');
					chatblocked = false;
				});
			} else {
				res.sendStatus(503);
			}
		});
	})
})

app.post('/chat', function (req, res) {
	getid(req.cookies.session, function(uid){
		let id = uid || -1;
		fs.readFile('chat.json', function(err, data) {
			if(!data || !IsJsonString(data)) return;
			let content = JSON.parse(data),
				keys = Object.keys(content),
				index;
			if(req.body.last) index = keys.indexOf(req.body.last);
			else index = 0;
			let newobj = {
				chat: {},
				players: {}
			};
			reqPlayers = {};
			for(let i = ++index; i<keys.length; i++){
				if(content[keys[i]].to && content[keys[i]].to != id && content[keys[i]].id != id){
					continue;
				}
				reqPlayers[content[keys[i]].to] = true;
				reqPlayers[content[keys[i]].id] = true;
				newobj.chat[keys[i]] = content[keys[i]];
			}

			delete reqPlayers[undefined];
			reqPlayers = Object.keys(reqPlayers).join(', ');
			connection.query(`SELECT Color, name, id, emoji, imgur, fid FROM users WHERE id IN (${reqPlayers})`, function(err, players, fields) {
				if(err) throw err;
				for(let i = 0; i<players.length; i++){
					players[i].name += players[i].emoji;
					delete players[i].emoji;
					newobj.players[players[i].id] = players[i];
				}
				res.send(newobj);
			});
		})
	})
})

app.get('/top', function (req, res) {
	connection.query('SELECT uid, sp FROM map', function(err, terrs, fields) {
		connection.query('SELECT login, name, emoji FROM users', function(err, users, fields) {
			let top = {},
				topSorted = [];

			const topLength = 5;
			for(let i = 0; i<terrs.length; i++){
				top[terrs[i].uid] = top[terrs[i].uid] ? top[terrs[i].uid] + terrs[i].sp : terrs[i].sp;
			}

			let keysSorted = Object.keys(top).sort((a,b)=>{return top[b]-top[a]})
			for(let i = 0; i<topLength; i++){
				topSorted[i] = {id: keysSorted[i], score: top[keysSorted[i]]};
			}
			res.send(JSON.stringify(topSorted));
		});
	});
});

app.post('/setflag', function (req, res) {
	if(!req.cookies.session) return res.send(jsonerror('Нет сессии!'));
	if(!req.body.imgur) return res.send(jsonerror('Ошибка imgur!'));
	connection.query('SELECT id FROM users WHERE session = '+connection.escape(req.cookies.session), function(err, user, fields) {if (err) throw err;
		if(!user[0]) return res.send('Неверная сессия!');
		req.body.imgur = req.body.imgur.replace('http://', 'https://');
		request({
			method: 'HEAD',
			uri: req.body.imgur
		}, (err, response, body)=>{
			if(response.statusCode != 200 || response.headers['content-type'].indexOf('image/') < 0 ||  response.headers.server != 'cat factory 1.0'){
				res.send(jsonerror('Ошибка imgur!'));
			} else connection.query('UPDATE users SET imgur = '+connection.escape(req.body.imgur)+' WHERE session = '+connection.escape(req.cookies.session), function(err, rows, fields) {
				if (err) throw err;
				res.send('Ваш герб обновлен!');
				io.emit('updateplayers', [user[0].id]);
			})
		})
	})
});

/*SOCKETS_____________________________________________
*/


var LEX = require('greenlock-express');
var lex = LEX.create({
	server: 'https://acme-v01.api.letsencrypt.org/directory',
	challenges: {
		'http-01': require('le-challenge-fs').create({ webrootPath: '/var/www/html/.well-known/acme-challenge' })
	},
	store: require('le-store-certbot').create({ webrootPath: '/var/www/html/.well-known/acme-challenge' }),
	approveDomains: approveDomains
});

function approveDomains(opts, certs, cb) {
	if (certs) {
		opts.domains = ['worldroulette.ru'];
		opts.email = 'adm@worldroulette.ru';
		opts.agreeTos = true;
	} else {
		opts.email = 'adm@worldroulette.ru';
		opts.agreeTos = true;
	}

	cb(null, { options: opts, certs: certs });
}
http2.createServer(lex.httpsOptions, lex.middleware(app)).listen(443);
var server = https.createServer(lex.httpsOptions).listen(444);

var io = require('socket.io')(server);

/*io.use(function (socket, next) {
    var data = socket.request;
    if(!data.headers.cookie)
        return next('No cookie given.', false);
    cookieParser(data, {}, function(parseErr) {
        if(parseErr)  return next('Error parsing cookies.', false);
        let sessionID = (data.secureCookies && data.secureCookies[expressSidKey]) ||
                        (data.signedCookies && data.signedCookies[expressSidKey]) ||
                        (data.cookies && data.cookies[expressSidKey]);
        socket.handshake.sid = sessionID; // Add it to the socket object
    });
});*/

io.on('connection', function (socket) {
	if(!socket.request.headers.cookie) return;
	let ip = socket.request.connection.remoteAddress.substr(7),
		session = cookie.parse(socket.request.headers.cookie).session;
	if(session) {
		connection.query('SELECT id FROM users WHERE session = '+connection.escape(session), function(err, user, fields) {
			if(user && user[0]){
				socketipid[ip] = socket.id;
				sessionip[session] = ip;
				online.push(user[0].id);
				//console.log('added: ', user[0].id, 'now: ', online);
    			io.emit('online', online);
				socket.on('disconnect', function() {
					delete socketipid[ip];
					delete sessionip[session];
					online.splice(online.indexOf(user[0].id), 1);
					//console.log('removed: ', user[0].id, 'now: ', online);
					io.emit('online', online);
				});
			}
		});
	}
});

app.get('/online', function (req, res) {
	res.send(online);
});

/*SOCKETS_____________________________________________
*/

app.use(function(req, res, next) {
  res.status(404).sendFile('/var/www/html/404.html');
});

function IsJsonString(str) {
	try {
		JSON.parse(str);
	} catch (e) {
		return false;
	}
	return true;
}

const tldList =["aaa","aarp","abarth","abb","abbott","abbvie","abc","able","abogado","abudhabi","ac","academy","accenture","accountant","accountants","aco","active","actor","ad","adac","ads","adult","ae","aeg","aero","aetna","af","afamilycompany","afl","africa","ag","agakhan","agency","ai","aig","aigo","airbus","airforce","airtel","akdn","al","alfaromeo","alibaba","alipay","allfinanz","allstate","ally","alsace","alstom","am","americanexpress","americanfamily","amex","amfam","amica","amsterdam","analytics","android","anquan","anz","ao","aol","apartments","app","apple","aq","aquarelle","ar","aramco","archi","army","arpa","art","arte","as","asda","asia","associates","at","athleta","attorney","au","auction","audi","audible","audio","auspost","author","auto","autos","avianca","aw","aws","ax","axa","az","azure","ba","baby","baidu","banamex","bananarepublic","band","bank","bar","barcelona","barclaycard","barclays","barefoot","bargains","baseball","basketball","bauhaus","bayern","bb","bbc","bbt","bbva","bcg","bcn","bd","be","beats","beauty","beer","bentley","berlin","best","bestbuy","bet","bf","bg","bh","bharti","bi","bible","bid","bike","bing","bingo","bio","biz","bj","black","blackfriday","blanco","blockbuster","blog","bloomberg","blue","bm","bms","bmw","bn","bnl","bnpparibas","bo","boats","boehringer","bofa","bom","bond","boo","book","booking","boots","bosch","bostik","boston","bot","boutique","box","br","bradesco","bridgestone","broadway","broker","brother","brussels","bs","bt","budapest","bugatti","build","builders","business","buy","buzz","bv","bw","by","bz","bzh","ca","cab","cafe","cal","call","calvinklein","cam","camera","camp","cancerresearch","canon","capetown","capital","capitalone","car","caravan","cards","care","career","careers","cars","cartier","casa","case","caseih","cash","casino","cat","catering","catholic","cba","cbn","cbre","cbs","cc","cd","ceb","center","ceo","cern","cf","cfa","cfd","cg","ch","chanel","channel","chase","chat","cheap","chintai","chloe","christmas","chrome","chrysler","church","ci","cipriani","circle","cisco","citadel","citi","citic","city","cityeats","ck","cl","claims","cleaning","click","clinic","clinique","clothing","cloud","club","clubmed","cm","cn","co","coach","codes","coffee","college","cologne","com","comcast","commbank","community","company","compare","computer","comsec","condos","construction","consulting","contact","contractors","cooking","cookingchannel","cool","coop","corsica","country","coupon","coupons","courses","cr","credit","creditcard","creditunion","cricket","crown","crs","cruise","cruises","csc","cu","cuisinella","cv","cw","cx","cy","cymru","cyou","cz","dabur","dad","dance","data","date","dating","datsun","day","dclk","dds","de","deal","dealer","deals","degree","delivery","dell","deloitte","delta","democrat","dental","dentist","desi","design","dev","dhl","diamonds","diet","digital","direct","directory","discount","discover","dish","diy","dj","dk","dm","dnp","do","docs","doctor","dodge","dog","doha","domains","dot","download","drive","dtv","dubai","duck","dunlop","duns","dupont","durban","dvag","dvr","dz","earth","eat","ec","eco","edeka","edu","education","ee","eg","email","emerck","energy","engineer","engineering","enterprises","epost","epson","equipment","er","ericsson","erni","es","esq","estate","esurance","et","eu","eurovision","eus","events","everbank","exchange","expert","exposed","express","extraspace","fage","fail","fairwinds","faith","family","fan","fans","farm","farmers","fashion","fast","fedex","feedback","ferrari","ferrero","fi","fiat","fidelity","fido","film","final","finance","financial","fire","firestone","firmdale","fish","fishing","fit","fitness","fj","fk","flickr","flights","flir","florist","flowers","fly","fm","fo","foo","food","foodnetwork","football","ford","forex","forsale","forum","foundation","fox","fr","free","fresenius","frl","frogans","frontdoor","frontier","ftr","fujitsu","fujixerox","fun","fund","furniture","futbol","fyi","ga","gal","gallery","gallo","gallup","game","games","gap","garden","gb","gbiz","gd","gdn","ge","gea","gent","genting","george","gf","gg","ggee","gh","gi","gift","gifts","gives","giving","gl","glade","glass","gle","global","globo","gm","gmail","gmbh","gmo","gmx","gn","godaddy","gold","goldpoint","golf","goo","goodhands","goodyear","goog","google","gop","got","gov","gp","gq","gr","grainger","graphics","gratis","green","gripe","group","gs","gt","gu","guardian","gucci","guge","guide","guitars","guru","gw","gy","hair","hamburg","hangout","haus","hbo","hdfc","hdfcbank","health","healthcare","help","helsinki","here","hermes","hgtv","hiphop","hisamitsu","hitachi","hiv","hk","hkt","hm","hn","hockey","holdings","holiday","homedepot","homegoods","homes","homesense","honda","honeywell","horse","hospital","host","hosting","hot","hoteles","hotmail","house","how","hr","hsbc","ht","htc","hu","hughes","hyatt","hyundai","ibm","icbc","ice","icu","id","ie","ieee","ifm","ikano","il","im","imamat","imdb","immo","immobilien","in","industries","infiniti","info","ing","ink","institute","insurance","insure","int","intel","international","intuit","investments","io","ipiranga","iq","ir","irish","is","iselect","ismaili","ist","istanbul","it","itau","itv","iveco","iwc","jaguar","java","jcb","jcp","je","jeep","jetzt","jewelry","jio","jlc","jll","jm","jmp","jnj","jo","jobs","joburg","jot","joy","jp","jpmorgan","jprs","juegos","juniper","kaufen","kddi","ke","kerryhotels","kerrylogistics","kerryproperties","kfh","kg","kh","ki","kia","kim","kinder","kindle","kitchen","kiwi","km","kn","koeln","komatsu","kosher","kp","kpmg","kpn","kr","krd","kred","kuokgroup","kw","ky","kyoto","kz","la","lacaixa","ladbrokes","lamborghini","lamer","lancaster","lancia","lancome","land","landrover","lanxess","lasalle","lat","latino","latrobe","law","lawyer","lb","lc","lds","lease","leclerc","lefrak","legal","lego","lexus","lgbt","li","liaison","lidl","life","lifeinsurance","lifestyle","lighting","like","lilly","limited","limo","lincoln","linde","link","lipsy","live","living","lixil","lk","loan","loans","locker","locus","loft","lol","london","lotte","lotto","love","lpl","lplfinancial","lr","ls","lt","ltd","ltda","lu","lundbeck","lupin","luxe","luxury","lv","ly","ma","macys","madrid","maif","maison","makeup","man","management","mango","market","marketing","markets","marriott","marshalls","maserati","mattel","mba","mc","mcd","mcdonalds","mckinsey","md","me","med","media","meet","melbourne","meme","memorial","men","menu","meo","metlife","mg","mh","miami","microsoft","mil","mini","mint","mit","mitsubishi","mk","ml","mlb","mls","mm","mma","mn","mo","mobi","mobile","mobily","moda","moe","moi","mom","monash","money","monster","montblanc","mopar","mormon","mortgage","moscow","moto","motorcycles","mov","movie","movistar","mp","mq","mr","ms","msd","mt","mtn","mtpc","mtr","mu","museum","mutual","mv","mw","mx","my","mz","na","nab","nadex","nagoya","name","nationwide","natura","navy","nba","nc","ne","nec","net","netbank","netflix","network","neustar","new","newholland","news","next","nextdirect","nexus","nf","nfl","ng","ngo","nhk","ni","nico","nike","nikon","ninja","nissan","nissay","nl","no","nokia","northwesternmutual","norton","now","nowruz","nowtv","np","nr","nra","nrw","ntt","nu","nyc","nz","obi","observer","off","office","okinawa","olayan","olayangroup","oldnavy","ollo","om","omega","one","ong","onl","online","onyourside","ooo","open","oracle","orange","org","organic","orientexpress","origins","osaka","otsuka","ott","ovh","pa","page","pamperedchef","panasonic","panerai","paris","pars","partners","parts","party","passagens","pay","pccw","pe","pet","pf","pfizer","pg","ph","pharmacy","philips","phone","photo","photography","photos","physio","piaget","pics","pictet","pictures","pid","pin","ping","pink","pioneer","pizza","pk","pl","place","play","playstation","plumbing","plus","pm","pn","pnc","pohl","poker","politie","porn","post","pr","pramerica","praxi","press","prime","pro","prod","productions","prof","progressive","promo","properties","property","protection","pru","prudential","ps","pt","pub","pw","pwc","py","qa","qpon","quebec","quest","qvc","racing","radio","raid","re","read","realestate","realtor","realty","recipes","red","redstone","redumbrella","rehab","reise","reisen","reit","reliance","ren","rent","rentals","repair","report","republican","rest","restaurant","review","reviews","rexroth","rich","richardli","ricoh","rightathome","ril","rio","rip","rmit","ro","rocher","rocks","rodeo","rogers","room","rs","rsvp","ru","ruhr","run","rw","rwe","ryukyu","sa","saarland","safe","safety","sakura","sale","salon","samsclub","samsung","sandvik","sandvikcoromant","sanofi","sap","sapo","sarl","sas","save","saxo","sb","sbi","sbs","sc","sca","scb","schaeffler","schmidt","scholarships","school","schule","schwarz","science","scjohnson","scor","scot","sd","se","seat","secure","security","seek","select","sener","services","ses","seven","sew","sex","sexy","sfr","sg","sh","shangrila","sharp","shaw","shell","shia","shiksha","shoes","shop","shopping","shouji","show","showtime","shriram","si","silk","sina","singles","site","sj","sk","ski","skin","sky","skype","sl","sling","sm","smart","smile","sn","sncf","so","soccer","social","softbank","software","sohu","solar","solutions","song","sony","soy","space","spiegel","spot","spreadbetting","sr","srl","srt","st","stada","staples","star","starhub","statebank","statefarm","statoil","stc","stcgroup","stockholm","storage","store","stream","studio","study","style","su","sucks","supplies","supply","support","surf","surgery","suzuki","sv","swatch","swiftcover","swiss","sx","sy","sydney","symantec","systems","sz","tab","taipei","talk","taobao","target","tatamotors","tatar","tattoo","tax","taxi","tc","tci","td","tdk","team","tech","technology","tel","telecity","telefonica","temasek","tennis","teva","tf","tg","th","thd","theater","theatre","tiaa","tickets","tienda","tiffany","tips","tires","tirol","tj","tjmaxx","tjx","tk","tkmaxx","tl","tm","tmall","tn","to","today","tokyo","tools","top","toray","toshiba","total","tours","town","toyota","toys","tr","trade","trading","training","travel","travelchannel","travelers","travelersinsurance","trust","trv","tt","tube","tui","tunes","tushu","tv","tvs","tw","tz","ua","ubank","ubs","uconnect","ug","uk","unicom","university","uno","uol","ups","us","uy","uz","va","vacations","vana","vanguard","vc","ve","vegas","ventures","verisign","versicherung","vet","vg","vi","viajes","video","vig","viking","villas","vin","vip","virgin","visa","vision","vista","vistaprint","viva","vivo","vlaanderen","vn","vodka","volkswagen","volvo","vote","voting","voto","voyage","vu","vuelos","wales","walmart","walter","wang","wanggou","warman","watch","watches","weather","weatherchannel","webcam","weber","website","wed","wedding","weibo","weir","wf","whoswho","wien","wiki","williamhill","win","windows","wine","winners","wme","wolterskluwer","woodside","work","works","world","wow","ws","wtc","wtf","xbox","xerox","xfinity","xihuan","xin","कॉम","セール","佛山","慈善","集团","在线","한국","大众汽车","点看","คอม","ভারত","八卦","موقع","বাংলা","公益","公司","香格里拉","网站","移动","我爱你","москва","қаз","католик","онлайн","сайт","联通","срб","бг","бел","קום","时尚","微博","淡马锡","ファッション","орг","नेट","ストア","삼성","சிங்கப்பூர்","商标","商店","商城","дети","мкд","ею","ポイント","新闻","工行","家電","كوم","中文网","中信","中国","中國","娱乐","谷歌","భారత్","ලංකා","電訊盈科","购物","クラウド","ભારત","通販","भारत","网店","संगठन","餐厅","网络","ком","укр","香港","诺基亚","食品","飞利浦","台湾","台灣","手表","手机","мон","الجزائر","عمان","ارامكو","ایران","العليان","امارات","بازار","پاکستان","الاردن","موبايلي","بھارت","المغرب","ابوظبي","السعودية","كاثوليك","سودان","همراه","عراق","مليسيا","澳門","닷컴","政府","شبكة","بيتك","გე","机构","组织机构","健康","ไทย","سورية","рус","рф","珠宝","تونس","大拿","みんな","グーグル","ελ","世界","書籍","ਭਾਰਤ","网址","닷넷","コム","天主教","游戏","vermögensberater","vermögensberatung","企业","信息","嘉里大酒店","嘉里","مصر","قطر","广东","இலங்கை","இந்தியா","հայ","新加坡","فلسطين","政务","xperia","xxx","xyz","yachts","yahoo","yamaxun","yandex","ye","yodobashi","yoga","yokohama","you","youtube","yt","yun","za","zappos","zara","zero","zip","zippo","zm","zone","zuerich","zw"];
