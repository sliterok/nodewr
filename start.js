const crypto = require('crypto'),
	CAPTCHASECRET = require('./captchasecret.js'),
	PASSSECRET = require('./passsecret.js'),
	express = require('express'),
	http2 = require('http2'),
	https = require('https'),
	http = require('http'),
	fs = require('fs'),
	bodyParser = require('body-parser'),
	cookieParser = require('cookie-parser'),
	cookie = require('cookie'),
	nodemailer = require('nodemailer'),
	request = require('request'),
	fetch = require('node-fetch'),
	randomHex = require('random-hex'),
	microtime = require('microtime-fast'),
	url = require('url'),
	app = express(),
	port = 8000,
	escape = require('escape-html'),
	//geoip = require("geoip-lite"),
	RateLimit = require('express-rate-limit'),
	httpProxy = require('http-proxy'),
	cloudflare = require('cloudflare-express'),
	sequelize = require('./sql.js')('orm'),
	t = require('./translation.js'),
	guestSession = 'a40b5ceab506e02f0a6af6c967e8d04262a551c6726892b24dbcc94c43929412cdad54e4441ebbcfb66e951c8e32f0c9117fa5ce05a269f741181f6311d16fc7',
	rollCache = [],
	Op = sequelize.Op;

let connection = require('./sql.js')('sql'),
	sessionip = {},
	socketipid = {},
	online = [],
	updateTime = [Date.now()],
	iptime = [];

//require('express-http2-workaround')({ express:express, http2:http2, app:app });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser());
app.use(express.static('public', {
	maxage: '2h'
}));
app.use(cloudflare.restore());
app.use((req, res, next) => {
	if(req.hostname.indexOf('socket') < 0) next();//wot?
	else return res.sendStatus(500);
});
app.use((req, res, next) => {
	if(req.hostname.indexOf('en.') > -1)
		req.lang = 'en'
	else
		req.lang = 'ru'
	next()
})
//Guest mode
app.use((req, res, next) => {
	let allow = true;
	if(req.cookies.session == guestSession){
		allow = false
		if(req.method == 'GET')
			allow = true
		else if(['/roll', '/write', '/getenergy', '/getthis', '/mine', '/logout'].indexOf(req.url) > -1)
			allow = true;
	}
	if(allow)
		next()
	else
		res.send(403)
})

var proxy = httpProxy.createProxyServer();

/*http.createServer(function(req, res) {
	proxy.web(req, res, {target: 'http://t.me:80'});
}).listen(8080);*/


app.post('/*', (req, res, next) => {
	let ref = req.headers.referer
	if(ref && ['воро.рф', 'xn--b1ayah.xn--p1ai', 'worldroulette.ru', 'en.worldroulette.ru'].indexOf(url.parse(ref).hostname) < 0)
		return res.send(403, 'Invalid origin')
	else 
		return next()
})


const limiter = new RateLimit({
	windowMs: 5000, // 5 sec
	max: 1, // limit each IP to 1 requests per 5 secs
	delayMs: 1000, // disable delaying - full speed until the max limit is reached
	skip: function (req, res) {
		//console.log(req.path);
		if(req.path == '/fcolor' || req.path == '/color' || req.path == '/fremove' || req.path == '/fcreate') 
			return false;
		else 
			return true;
	}
});

//  apply to all requests
app.use(limiter);

function handleDisconnect() {
	connection = require('./sql.js')('sql');

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


async function doCaptcha(req, secret){
	if(!req.body.captcha) return {success: false}
	const params = new URLSearchParams();
	params.append('secret', secret)
	params.append('response', req.body.captcha)
	params.append('remoteip', sessionip[req.cookies.session])
	const captcha = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: params });
	return await captcha.json()
}

async function spamCaptcha(req, secret){
	if(!req.body.captchaV3) return {success: false}
	const params = new URLSearchParams();
	params.append('secret', secret)
	params.append('response', req.body.captchaV3)
	params.append('remoteip', sessionip[req.cookies.session])
	const captcha = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: params });
	return await captcha.json()
}


sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

let User = sequelize.import(__dirname + "/models/users.js")
let Map = sequelize.import(__dirname + "/models/map.js")
let Faction = sequelize.import(__dirname + "/models/factions.js")


app.get('/', async (req, res) => {
	res.setHeader('Cache-Control', 'public, max-age=7200');
	console.log(req.lang)
	/*
	if(req.cookies.firstTime != '1' && typeof res.push === 'function'){ 
	
		//Reserved until express will release fix for http/2
	
		let filenames = ['captcha.js', 'alertify.js', 'chat.css', 'chat.js', 'font-awesome.min.css', 'fuckadblock.js', 'jquery-jvectormap-2.0.3.css', 'jquery-jvectormap-2.0.3.min.js', 'jquery-jvectormap-world-mill-ru.js', 'jquery.js', 'map.js', 'spaceengine.jpg', 'styles.css', 'assets/wr new.png', 'alertify.js', 'socket.io/socket.io.js', 'bootstrap/bootstrap.min.css', 'bootstrap/bootstrap.min.js', 'twemoji.min.js', 'jscolor.min.js', 'jquery.mobile.custom.min.js', 'factions.js'];
		filenames.forEach(el=>{
			if(el.indexOf('.')) return;
			let push = res.push('/'+encodeURI(el));
			push.setHeader('Cache-Control', 'public, max-age=' + (60 * 60 * 2));
			//push.type(el.split('.').pop());
			push.writeHead(200);
			fs.createReadStream(__dirname + '/public/'+el).pipe(push);
		});
	}*/
	if(req.cookies.session) {
		let user = await User.findOne({where: {session: req.cookies.session}});
		if(user && user.session == req.cookies.session)
			if(req.lang == 'en')
				return res.sendFile('en.main.html', {root: __dirname})
			else
				return res.sendFile('main.html', {root: __dirname})
		else 
			res.cookie('session', '', {maxAge: 0, httpOnly: true})
	}
	if(req.lang == 'en')
		return res.sendFile('en.authmemobi.html', {root: __dirname})
	else
		return res.sendFile('authmemobi.html', {root: __dirname})
});

app.post('/register', async (req, res) => {
	let err;
	req.body.name = escape(req.body.name);
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	
	if(!req.body.login || !req.body.pass || !req.body.name || !req.body.captcha)
		err = t[req.lang].notAllFieldsAreFilled
	else if(req.body.login.length > 15 || req.body.pass.length > 50 || req.body.name.length > 35 || req.body.pass.length < 6 || req.body.login.length < 3 || req.body.name.length < 3) 
		err = t[req.lang].lengthError;
	else if(!/^[A-z0-9]*$/.test(req.body.login)) 
		err = t[req.lang].wrongSymbolsInLogin;
	else if(!/^.{3,35}$/.test(req.body.name)) 
		err = t[req.lang].wrongSymbolsInName;
	
	if(err) 
		return res.send({'status': false, 'data': err});
	
	const captcha = await doCaptcha(req, CAPTCHASECRET.login);
	if(captcha.success != true) 
		return res.send({status: false, data: t[req.lang].captchaError})
	
	const user = await User.findOne({where: {login: req.body.login}});
	if(user) 
		return res.send({status: false, data: t[req.lang].loginAlreadyTaken});

	const newPlayer = User.build({
		login: req.body.login,
		name: req.body.name,
		color: randomHex.generate()
	});
	
	let hash = crypto.createHmac('sha512', PASSSECRET);
	hash.update(req.body.pass);
	newPlayer.pass = hash.digest('base64')

	hash = crypto.createHmac('sha512', newPlayer.pass);
	hash.update(crypto.randomBytes(20).toString('hex'));
	newPlayer.session = hash.digest('hex')
	
	const rSave = await newPlayer.save();
	if (rSave.error) 
		res.send({status: false, data: rSave.error});
	else 
		res.send({status: true, data: newPlayer.session});
});

app.post('/login', async (req, res) => {
	let err;
	if(!req.body.login || !req.body.pass || !req.body.captcha) 
		return res.send({status: false, data: t[req.lang].notAllFieldsAreFilled})
	
	const captcha = await doCaptcha(req, CAPTCHASECRET.login);
	if(captcha.success != true) 
		return res.send({status: false, data: t[req.lang].captchaError});
	
	const user = await User.findOne({where: {login: req.body.login}});
	if(!user) 
		return res.send({status: false, data: t[req.lang].thereIsNoUserWithSuchLogin})

	const hash = crypto.createHmac('sha512', PASSSECRET);
	hash.update(req.body.pass);
	const pass = hash.digest('base64');
	
	if(pass != user.pass)
		return res.send({status: false, data: t[req.lang].passwordIncorrect});
	
	const hashsess = crypto.createHmac('sha512', pass);
	hashsess.update(crypto.randomBytes(20).toString('hex'));
	user.session = hashsess.digest('hex');
	
	
	let rSave = await user.save();
	if (rSave.error) 
		res.send({status: false, data: rSave.error});
	else 
		res.send({status: true, data: user.session});
});

app.post('/logout', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(req.cookies.session == guestSession)
		return res.cookie('session', '', {domain: '.worldroulette.ru', maxAge: 0, httpOnly: true}), res.sendStatus(200)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user) 
		return res.send(t[req.lang].sessionError)
	
	user.session = '';
	await user.save()
	
	res.cookie('session', '', {maxAge: 0, httpOnly: true});
	res.sendStatus(200)
});

app.get('/get', async (req, res) => {
	let single = req.query.reg && req.query.updateTime == updateTime[1] ? true : false
	
	//console.log('single? ', single, ' server: ', updateTime, ' player: ', req.query.updateTime)
	if(single)
		regs = await Map.findAll({
			where: {
				code: req.query.reg
			}
		});
	else
		regs = await Map.findAll();
	
	let sendata = {
			map: {},
			players: {},
			updateTime: updateTime[0]
		},
		reqPlayers = {};

	for(let i = 0; i<regs.length; i++)
	{
		let item = regs[i];
		reqPlayers[item.uid] = true;
		sendata.map[item.code] = {sp: item.sp, uid: item.uid}
	}
	
	const players = await User.findAll({
		where: {
			id: {
				[Op.in]: Object.keys(reqPlayers)
			}
		}
	});
	
	for(let i = 0; i < players.length; i++){
		let p = players[i];
		sendata.players[p.id] = {color: p.color, name: p.name + p.emoji, id: p.id, fid: p.fid};
		if(p.imgur) sendata.players[p.id].imgur = p.imgur
	}
	res.send(sendata);
});

app.post('/getenergy', async (req, res) => {
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError)
	
	res.send(user.power.toString());
});

app.post('/getthis', async (req, res) => {
	if(!req.cookies.session) 
		return res.send('0')
	
	const p = await User.findOne({where: {session: req.cookies.session}});
	if(!p)
		return res.send({})
	
	const rs = {}
	rs[p.id] = {color: p.color, name: p.name + p.emoji, id: p.id, imgur: p.imgur, fid: p.fid}
	if(p.imgur) rs[p.id].imgur = p.imgur
	res.send(rs)
});

app.post('/fcolor', async (req, res) => {
	if(!req.cookies.session) 
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.color) 
		return res.send(t[req.lang].colorError)
	
	if(/^[0-9A-F]{6}$/i.test(req.body.color))
		req.body.color = '#'+req.body.color;
	
	if(/^[0-9A-F]{3}$/i.test(req.body.color)) //convert #123 to #112233
		req.body.color = '#'+req.body.color.charAt(0).repeat(2) + req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2)
	
	if(!/^#[0-9A-F]{6}$/i.test(req.body.color)) 
		return res.send(t[req.lang].colorError);
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	if(!user.fid)
		return res.send(t[req.lang].factionNotFoundError)
	
	const faction = await Faction.findOne({where: {admin: user.id}})
	if(!faction)
		return res.send(t[req.lang].factionPermissionsError)
	
	faction.color = req.body.color;
	await faction.save()
	
	res.send(t[req.lang].succ);
	io.emit('updatefactions', '');
});

app.post('/color', async (req, res) => {
	if(!req.cookies.session) 
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.color) 
		return res.send(t[req.lang].colorError)
	
	if(/^[0-9A-F]{6}$/i.test(req.body.color))
		req.body.color = '#'+req.body.color;
	
	if(/^[0-9A-F]{3}$/i.test(req.body.color)) //convert #123 to #112233
		req.body.color = '#'+req.body.color.charAt(0).repeat(2) + req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2)
	
	if(!/^#[0-9A-F]{6}$/i.test(req.body.color)) 
		return res.send(t[req.lang].colorError)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError)
	
	user.color = req.body.color;
	await user.save();
	
	res.send(t[req.lang].succ);
	io.emit('updateplayers', [user.id]);
});

app.post('/v3', async (req, res) => {
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(user && req.body.captchaV3) {
		const spam = await spamCaptcha(req, CAPTCHASECRET.v3);
		console.log('Name: ', user.name, '; Score: ', spam.score ? spam.score : 'error')
	}
	res.send(200);
})

app.post('/roll', async (req, res) => {
	//return false
	if(rollCache.indexOf(req.cookies.session) > -1) await new Promise(resolve => setTimeout(resolve, 200));
	let n = rollCache.push(req.cookies.session)
	
	const ip = sessionip[req.cookies.session];
	if(!ip)
		return res.send(jsonerror(t[req.lang].noSessionIP, n))
	/*const geo = geoip.lookup(ip);
	const allowedCountries = ['RU', 'UA', 'BY', 'KZ', 'LV', 'LT', 'EE'];*/
	
	if(!req.cookies.session)
		return res.send(jsonerror(t[req.lang].sessionError, n));
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(jsonerror(t[req.lang].sessionError, n));
	
	const captcha = await doCaptcha(req, CAPTCHASECRET.default);
	if(!captcha.success && user.power < 1)
		return res.send(jsonerror(t[req.lang].captchaError, n)); // У игрока нет силы и капча не решена
	if(captcha.success)
		user.power = 15, user.mine = 0, await user.save();
	
	/*if(!geo.country || allowedCountries.indexOf(geo.country) == -1) 
		return res.send(jsonerror('Игра корректно функционирует только в странах СНГ!', n));*/
	if(!req.body.target) 
		return res.send(jsonerror(t[req.lang].targetError, n));
	if(iptime.indexOf(ip) > -1) 
		return res.send(jsonerror(t[req.lang].timeoutError, n));
	
	if(Date.now() - user.time < 1000)
		return res.send(jsonerror(t[req.lang].timeoutError, n));
	
	const target = await Map.findOne({where: {code: req.body.target}});
		if(!target) return res.send(jsonerror(t[req.lang].targetError, n));
	
	const owner = await User.findById(target.uid);
	
	const action = (user.id != owner.id && (user.fid != owner.fid || (user.fid == 0 && owner.fid == 0))) ? 'attack' : 'heal'
	
	let maxsp = Math.ceil((-Math.pow((target.area / 17098242) - 1, 2) + 1) * 10) //пиздец, вот график y = -(x-1)^2 + 1
	//console.log(target.area, maxsp)
	if(maxsp < 3) maxsp = 3;
	if(target.sp >= maxsp && action == 'heal')
		return res.send(jsonnote(t[req.lang].maxspError, n));
	
	iptime.push(ip);
	setTimeout(e => {
		iptime.splice(iptime.indexOf(ip), 1)
	}, 1000);
	
	const rand = pad(getRandomInt(0, 9999), 4); // rand - число от 0 до 10000 pad - распидорасить его впереди 3 нуля
	const numbers = checkdigits(rand);
	let sp = Math.pow(2, numbers - 1);
	
	/* new captcha
	
	
	const params = new URLSearchParams();
	params.append('secret', CAPTCHASECRET.v3)
	params.append('remoteip', sessionip[req.cookies.session])
	const v3 = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: params });
	const v3json = await v3.json()
	console.log(v3json);
	
	*/
	
	if(!numbers) {
		user.power -= 1;
		user.time = Date.now();
		rollCache.splice(n-1);
		await user.save()
		return res.send({result: 'fail', data: `${t[req.lang].captureNumbers} ${rand}`});
	}
		
	user.totalsp += sp;
	
	if(action == 'attack') {
		if(sp >= target.sp){
			if(sp == target.sp) 
				target.sp = 1;
			else if(sp > target.sp)
				target.sp = sp < maxsp ? sp : maxsp;
			
			target.uid = user.id;

			await target.save()
			res.send({result: 'success', data: `${t[req.lang].captureNumbers} ${rand}, ${t[req.lang].captureSuccess} "[${req.body.target}]"`});
			
			connection.query(`INSERT INTO timelapse(time, code, uid) VALUES (${Date.now()}, "${req.body.target}", ${user.id})`, function(err, rows, fields) {
				if(!err) console.log(`${req.body.target} was captured by ${user.id}`);
			});
			
		} else if(sp < target.sp){
			target.sp -= sp;
			
			await target.save()
			res.send({result: 'success', data: `${t[req.lang].captureNumbers} ${rand}, ${t[req.lang].captureDefence} "[${req.body.target}]" ${t[req.lang].captureDefenceLoweredTo} ${target.sp}`});
		}
		
		io.to(socketipid[sessionip[owner.session]]).emit('attack', `${user.name} ${t[req.lang].captureAttackedYourLand} "[${req.body.target}]"`);//Уведомить об атаке хозяина территории
				
		if(owner.token)
			await sendPush('WorldRoulette', `${user.name} ${t[req.lang].captureAttackedYourLand} "[${req.body.target}]"`, owner)
		
		if(owner.fid) {
			const ownerFaction = await Faction.findById(owner.fid);
			const factionUsers = jsParseIt(ownerFaction.users);
			//console.log(ownerFaction, factionUsers)
			factionUsers.splice(factionUsers.indexOf(owner.id), 1);//убираем самого себя из клана
			
			const players = await User.findAll({
				where: {
					id: {
						[Op.in]: factionUsers
					}
				}
			});
			
			for(let i = 0; i < players.length; i++){
				const factionUser = players[i];
				
				io.to(socketipid[sessionip[factionUser.session]]).emit('attack', `${user.name} ${t[req.lang].captureAttackedYourLand} "[${req.body.target}]"`);//Уведомить об атаке людей во фракции
				
				if(factionUser.token)
					await sendPush('WorldRoulette', `${user.name} ${t[req.lang].captureAttackedYourLand} "[${req.body.target}]"`, factionUser)
			}
			
		}
		
	} else if (action == 'heal'){
		sp = target.sp + sp
		if(sp > maxsp)
			sp = maxsp;
		
		target.sp = sp
		
		await target.save()
		res.send({result: 'success', data: `${t[req.lang].captureNumbers} ${rand} ${t[req.lang].captureLandPower1} "[${req.body.target}]" ${t[req.lang].captureLandPower2} ${sp}`});
		if(owner.id != user.id) {
			io.to(socketipid[sessionip[owner.session]]).emit('heal', `${user.name} ${t[req.lang].captureUpgradedLand} "[${req.body.target}]"`);
		}
	}
	
	rollCache.splice(n-1);
	
	updateTime.unshift(Date.now());
	
	user.power -= 1;
	user.time = Date.now();
	await user.save();
	
	io.emit('updatemap', req.body.target);
});

app.post('/mine', async (req, res) => {
	if(!req.cookies.session)
		return res.send(jsonerror(t[req.lang].sessionError));
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(jsonerror(t[req.lang].sessionError));
	
	const r1 = await fetch(`https://api.coinhive.com/user/balance?secret=${CAPTCHASECRET.coinhive}&name=${user.id}`);
	const balance = await r1.json()
	
	//console.log('user.id: ', user.id, ' balance: ', balance)
	
	if(!balance.success)
		return res.send(jsonerror(t[req.lang].sessionError))
	
	if(balance.balance < 512)
		return res.send(jsonnote('Недостаточно подтвержденных хешей!'));
	
	
	const params = new URLSearchParams();
	params.append('secret', CAPTCHASECRET.coinhive)
	params.append('name', user.id)
	params.append('amount', balance.balance)
	const r2 = await fetch('https://api.coinhive.com/user/withdraw', { method: 'POST', body: params });
	const op = await r2.json()
	if(!op.success)
		return res.send(jsonnote(op.error))
	
	if(user.mine > 100)
		return res.send(jsonerror(t[req.lang].miningLimitError))
	if(user.power < 10)
		user.power += 1, user.mine += 1, await user.save(), res.send(JSON.stringify({result: 'success', data: '+1 энергия!'}))
	else
		res.send(JSON.stringify({result: 'success', data: 'Вы не можете майнить больше 10 энергии, но спасибо!'}))
})

app.post('/fremove', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	if(!user.fid)
		return res.send(t[req.lang].factionPermissionsError)
	
	const faction = await Faction.findOne({where: {admin: user.id}})
	if(!faction)
		return res.send(t[req.lang].factionPermissionsError)
	
	const invitedPlayers = await User.findAll({
		where: {
			[Op.or]: [
				{
					invites: `[${faction.id}]`
				},
				{
					invites: {
						[Op.like]: `[${faction.id},%`
					}
				},
				{
					invites: {
						[Op.like]: `%,${faction.id},%`
					}
				},
				{
					invites: {
						[Op.like]: `%,${faction.id}]`
					}
				}
			]
		}
	});
	
	for(let i = 0; i < invitedPlayers.length; i++){
		let player = invitedPlayers[i]
		let invites = jsParseIt(player.invites);
		invites.splice(invites.indexOf(player.fid), 1);
		player.invites = JSON.stringify(invites)
		await player.save()
	}
	
	let fusers = jsParseIt(faction.users);
	const players = await User.findAll({
		where: {
			id: {
				[Op.in]: fusers
			}
		}
	});
	
	for(let i = 0; i < players.length; i++){
		let player = players[i]
		player.fid = 0
		await player.save()
	}
	io.emit('updateplayers', fusers);
	await faction.destroy()
	io.emit('updatefactions', '');
	res.send(t[req.lang].succ);
});

app.post('/fleave', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	const faction = await Faction.findById(user.fid);
	if(!faction)
		return res.send(t[req.lang].factionNotFoundError);
	
	user.fid = 0
	await user.save()
	
	let fusers = jsParseIt(faction.users);
	fusers.splice(fusers.indexOf(user.id), 1);//убираем самого себя из клана
	
	faction.users = JSON.stringify(fusers)
	await faction.save()
	
	io.emit('updateplayers', [user.id]);
	res.send(t[req.lang].succ);
});

app.post('/fdecline', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.fid)
		return res.send(t[req.lang].factionSpecifiedWrong)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	let invites = jsParseIt(user.invites),
		index = invites.indexOf(req.body.fid);
	if(index < 0)
		return res.send(t[req.lang].factionNotInvitedError);
	
	invites.splice(index, 1);
	user.invites = JSON.stringify(invites);
	
	await user.save()
	
	res.send(t[req.lang].factionInviteDeclined);
});

app.post('/fjoin', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.fid)
		return res.send(t[req.lang].factionSpecifiedWrong)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	if(user.fid)
		return res.send(t[req.lang].factionAlreadyUser)
	
	let invites = jsParseIt(user.invites);
	let index = invites.indexOf(req.body.fid);
	if(index < 0)
		return res.send(t[req.lang].factionNotInvitedError);
	
	const faction = await Faction.findById(req.body.fid);
	if(!faction)
		return res.send(t[req.lang].factionSpecifiedWrong)
	
	invites.splice(index, 1);
	let users = jsParseIt(faction.users);
	users.push(user.id);
	
	faction.users = JSON.stringify(users);
	user.invites = JSON.stringify(invites);
	user.fid = req.body.fid;
	
	await faction.save()
	await user.save()
	
	res.send(t[req.lang].succ);
});

app.get('/currfusers', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	const faction = await Faction.findById(user.fid);
	if(!faction)
		return res.send(t[req.lang].factionNotFoundError);
	
	res.send(faction.users);
});

app.post('/fkick', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	if(user.id == req.body.fid)
		return res.send(t[req.lang].factionKickYourselfError);
	
	const faction = await Faction.findOne({where: {admin: user.id}})
	if(!faction)
		return res.send(t[req.lang].factionPermissionsError)
	
	const kickUser = await User.findById(req.body.fid);
	if(!kickUser)
		return res.send(t[req.lang].noSuchPlayer);
	if(kickUser.fid != faction.id)
		return res.send(t[req.lang].factionNotListedError);
	
	kickUser.fid = ''
	await kickUser.save()
	
	let users = jsParseIt(faction.users);
	users.splice(users.indexOf(kickUser.id), 1);
	
	faction.users = JSON.stringify(users)
	await faction.save()
	
	res.send(t[req.lang].succ)
	io.emit('updateplayers', [req.body.fid]);
});

app.get('/currinvites', async (req, res) => {
	if(!req.cookies.session)
		return res.send('[]');
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send('[]');
	
	res.send(JSON.stringify(jsParseIt(user.invites)));
});

app.post('/finvite', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.pid)
		return res.send(t[req.lang].playerNotSpecified)
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	if(user.id == req.body.pid)
		return res.send(t[req.lang].factionInviteYourselfError);
	
	const faction = await Faction.findOne({where: {admin: user.id}})
	if(!faction)
		return res.send(t[req.lang].factionPermissionsError)
	
	const newUser = await User.findById(req.body.pid);
	if(!newUser)
		return res.send(t[req.lang].noSuchPlayer);
	
	
	let invites = jsParseIt(newUser.invites);
	if(invites.indexOf(faction.id) > -1)
		return res.send(t[req.lang].factionAlreadyInvited);
	invites.push(faction.id);
	newUser.invites = JSON.stringify(invites)
	await newUser.save()
	
	res.send(`${t[req.lang].factionYouHaveInvited} ${newUser.name}`);
	io.to(socketipid[sessionip[newUser.session]]).emit('invite', `${user.name} ${t[req.lang].factionYouWasInvited} "${faction.name}"`);
});

app.post('/fcreate', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.fname)
		return res.send(t[req.lang].factionNoNameSpecified)
	
	if(!req.body.color)
		return res.send(t[req.lang].factionNoColorSpecified)
	
	if(!/^[A-z0-9А-я ]{3,35}$/.test(req.body.fname))
		return res.send(t[req.lang].wrongSymbolsInName)
	
	if(req.body.fname.replace(/[ ‎\s\n\r]+/g,' ') == '' || req.body.fname.replace(/[ ‎\s\n\r]+/g,' ') == ' ')
		return res.send(t[req.lang].wrongSymbolsInName)
	
	req.body.fname = req.body.fname.replace(/[ ‎\s\n\r]+/g,' ')
	
	if(/^[0-9A-F]{6}$/i.test(req.body.color))
		req.body.color = '#'+req.body.color;
	if(/^[0-9A-F]{3}$/i.test(req.body.color))
		req.body.color = '#'+req.body.color.charAt(0).repeat(2)+req.body.color.charAt(1).repeat(2)+req.body.color.charAt(2).repeat(2) //convert #123 to #112233
	else if(!/^#[0-9A-F]{6}$/i.test(req.body.color))
		return res.send(t[req.lang].colorError);
	
	const anotherFactionByName = await Faction.findOne({where: {name: req.body.name}})
	if(anotherFactionByName)
		return res.send(t[req.lang].nameIsAlreadyTaken);
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	const anotherFactionByAdmin = await Faction.findOne({where: {admin: user.id}})
	if(anotherFactionByAdmin)
		return res.send(t[req.lang].factionAlreadyCreated)
	
	const newFaction = Faction.build({
		name: req.body.fname,
		admin: user.id,
		users: `[${user.id}]`,
		color: req.body.color
	});
	
	const rSave = await newFaction.save();
	if (rSave.error) 
		return res.send(t[req.lang].unknownError);
	io.emit('updatefactions', '');
	
	user.fid = rSave.id
	await user.save()
	
	res.send(t[req.lang].succ);	
	io.emit('updateplayers', [user.id]);
});

app.post('/name', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	if(!req.body.name)
		return res.send(t[req.lang].wrongSymbolsInName);
	
	req.body.name = escape(req.body.name);
	
	if(!/^[\wа-я]{3,35}$/gi.test(req.body.name))
		return res.send(t[req.lang].wrongSymbolsInName);
	
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	
	if(req.body.name == ' ' || req.body.name == '')
		return res.send(t[req.lang].wrongSymbolsInName);
	
	
	const anotherUser = await User.findOne({where: {name: req.body.name}})
	if(anotherUser)
		return res.send(t[req.lang].nameIsAlreadyTaken);
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	user.name = req.body.name
	await user.save()
	
	io.emit('updateplayers', [user.id]);
	res.send(t[req.lang].succ);
});

app.post('/emoji', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	req.body.emoji = escape(req.body.emoji);
    req.body.emoji = req.body.emoji.replace(/[ ‎\s\n\r]+/gm,' ');
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	let winners = {13: 1, 648: 3, 675: 2, 945: 2, 1954: 1, 1231: 5, 806: 1, 908: 2, 2193: 1, 2242: 1, 1667: 1, 2481: 1, 2510: 1, 1690: 1, 2534: 1},
		keys = Object.keys(winners),
		index = keys.indexOf(user.id.toString());
	
	if(index < 0)
		return res.send(t[req.lang].emojiWorldTakeoverError);
	if(winners[keys[index]]*2 < req.body.emoji.length)
		return res.send(t[req.lang].emojiInsufficientTakeovers);
	
	user.emoji = req.body.emoji;
	await user.save()
	
	res.send(t[req.lang].succ);
	io.emit('updateplayers', [user.id]);
});


app.post('/fname', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	if(!req.body.name) 
		return res.send(t[req.lang].factionNewNameError);
	if(!/^[A-z0-9А-я ]{3,35}$/.test(req.body.name)) 
		return res.send(t[req.lang].wrongSymbolsInName);
	
    req.body.name = req.body.name.replace(/[ ‎\s\n\r]+/g,' ');
	
	if(req.body.name == '' || req.body.name == ' ')
		return res.send(t[req.lang].wrongSymbolsInName);
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError);
	
	const faction = await Faction.findOne({where: {admin: user.id}})
	if(!faction)
		return res.send(t[req.lang].factionPermissionsError)
	
	const anotherFaction = await Faction.findOne({where: {name: req.body.name}})
	if(anotherFaction)
		return res.send(t[req.lang].nameIsAlreadyTaken);
	
	faction.name = req.body.name;
	await faction.save()
	
	res.send(t[req.lang].succ)
	io.emit('updatefactions', '');
});

app.get('/getfname', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	
	const faction = await Faction.findById(req.query.id);
	
	if(faction)
		res.send(faction.name)
	else
		res.send(undefined)
});

app.get('/factions', async (req, res) => {
	const factions = await Faction.findAll();
	
	let rs = {};
	
	for(let i = 0; i<factions.length; i++){
		let faction = factions[i];
		rs[faction.id] = {color: faction.color, name: faction.name};
	}
	
	res.send(JSON.stringify(rs));
});

app.post('/give', async (req, res) => {
	if(!req.cookies.session)
		return res.send(t[req.lang].sessionError)
	if(!req.body.target)
		return res.send(t[req.lang].targetError);
	if(!req.body.targetplid)
		return res.send(t[req.lang].playerNotSpecified);
	
	const oldOwner = await User.findOne({where: {session: req.cookies.session}});
	if(!oldOwner) 
		return res.send(t[req.lang].sessionError);
	
	const newOwner = await User.findById(req.body.targetplid);
	if(!newOwner) 
		return res.send(t[req.lang].noSuchPlayer);
	
	const target = await Map.findOne({where: {code: req.body.target}});
	if(!target)
		return res.send(t[req.lang].targetError);
	if(target.uid != oldOwner.id)
		return res.send(t[req.lang].wrongOwner);
	
	target.uid = newOwner.id;
	await target.save()
	res.send(`"[${req.body.target}]" ${t[req.lang].given} ${newOwner.name}`);
	
	if(newOwner.session){
		io.to(socketipid[sessionip[newOwner.session]]).emit('attack', `${oldOwner.name} ${t[req.lang].gaveYou} "[${req.body.target}]"`);//Уведомить об атаке
	}
	
	updateTime.unshift(Date.now());
	io.emit('updatemap', req.body.target);

	connection.query(`INSERT INTO timelapse(time, code, uid) VALUES (${Date.now()}, "${req.body.target}", ${req.body.targetplid})`, function(err, rows, fields) {
		if(!err) console.log(`${req.body.target} was given to ${req.body.targetplid}`);
	});
})

app.get('/currf', async (req, res) => {
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user) 
		return res.send('-1');
	
	if(!user.fid)
		return res.send('-1');
	
	const faction = await Faction.findById(user.fid);
	
	if(faction.admin == user.id)
		res.send('1');
	else
		res.send('0');
});


app.get('/getplayers', async (req, res) => {
	let ids = jsParseIt(req.query.ids)
	if(ids.length < 1) 
		return res.sendStatus(500);
	
	for(let i = 0; i < ids.length; i++){
		let id = parseInt(ids[i])
		if(typeof id != 'number' || isNaN(id))
			return res.sendStatus(500)
		else ids[i] = id
	}
	
	const players = await User.findAll({
		where: {
			id: {
				[Op.in]: ids
			}
		}
	});
	if(!players) 
		return res.send({});
	
	let sendata = {};
	
	for(let i = 0; i < players.length; i++){
		let p = players[i];
		sendata[p.id] = {color: p.color, name: p.name + p.emoji, id: p.id, fid: p.fid};
		if(p.imgur) sendata[p.id].imgur = p.imgur
	}
	res.send(sendata);
});

function checkdigits(num){
	num = num.toString()
	let l = num.length - 1,
		combo = 0;
	if(num[l] == num[l-1]) combo = 1;
	if(combo == 1 && num[l] == num[l-2]) combo = 2;
	if(combo == 2 && num[l] == num[l-3]) combo = 3;
	if(combo == 3 && num[l] == num[l-4]) combo = 4;
	if(combo == 4 && num[l] == num[l-5]) combo = 5;
	if(combo == 5 && num[l] == num[l-6]) combo = 6;
	return combo;
}

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function getRandomInt(min, max)
{
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function jsonerror(data, n){
	if(n)
		rollCache.splice(n-1)
	return JSON.stringify({result: 'error', data: data});
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

app.post('/write', async (req, res) => {
	if(!req.body.msg) 
		return res.send(t[req.lang].emptyMessage);
	if(!req.cookies.session) 
		return res.send(t[req.lang].sessionError)
	
	let msg;
	
	if(req.body.msg.length > 200) msg = req.body.msg.substr(0, 200);
	else msg = req.body.msg;
	
	if(msg.replace(/[ ‎\s\n\r]+/g,' ') == '' || msg.replace(/[ ‎\s\n\r]+/g,' ') == ' ') return;
	
	let fileName = 'chat.json'
	if(req.lang == 'en')
		fileName = 'en.chat.json'
	
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user)
		return res.send(t[req.lang].sessionError)
	
	fs.readFile(fileName, async (err, data) => {
		if (err) throw err;
		
		if(!IsJsonString(data)) return res.sendStatus(503);
		
		let content = JSON.parse(data);
		msg = msg.replace(/[ ‎\s\n\r]+/g,' ');
		msg = msg.replace(/\n/g, ' ');
		msg = escape(msg);
		msg = msg.replace(/((?:http|https):\/\/)?([-a-zа-я0-9.]{1,256}\.([a-zа-я]{1,10}))(?:\/[-a-zа-я0-9@:%_\+.~#?&//=]*)?/gi, function(href,protocol,site,tld){
			if(tldList.indexOf(tld.toLocaleLowerCase()) > -1) return `<a href="${protocol ? href : 'https://'+href}" target="_blank">${href.length > 30 ? href.substr(0, 30)+'...' : href}</a>`;
			else return href;
		});
		
		let to;
		msg = msg.replace(/^\/msg ([0-9]{1,5}) (.+)$/i, function(a,b,c){
			to = b;
			return c;
		})
		if(to) content[microtime.now()] = {msg: msg, id: user.id, to: to};
		else content[microtime.now()] = {msg: msg, id: user.id};
		
		let keys = Object.keys(content);
		if(keys.length > 100){
			var newobj = {};
			var index = keys.length-100;
			for(var i = index; i<keys.length; i++){
				newobj[keys[i]] = content[keys[i]];
			}
			content = newobj;
		}
		
		if(chatblocked != true){
			chatblocked = true;
			fs.writeFile(fileName, JSON.stringify(content), (err) => {
				if (err) throw err;
				io.emit('updatechat', keys[keys.length-2]);
				res.send('');
				chatblocked = false;
			});
		} else 
			res.sendStatus(503);
	});
})

app.get('/chat', async (req, res) => {
	const user = await User.findOne({where: {session: req.cookies.session}});
	let id = user.uid || -1;
	
	let fileName = 'chat.json'
	if(req.lang == 'en')
		fileName = 'en.chat.json'
	
	fs.readFile(fileName, async (err, data) => {
		if(!data || !IsJsonString(data)) return;
		let content = JSON.parse(data),
			keys = Object.keys(content),
			index;

		if(req.query.last)
			index = keys.indexOf(req.query.last);
		else
			index = 0;
		
		let sendata = {
			chat: {},
			players: {}
		};
		
		let reqPlayers = {};
		for(let i = ++index; i<keys.length; i++){
			if(content[keys[i]].to && content[keys[i]].to != id && content[keys[i]].id != id)
				continue;
			reqPlayers[content[keys[i]].to] = true;
			reqPlayers[content[keys[i]].id] = true;
			sendata.chat[keys[i]] = content[keys[i]];
		}

		delete reqPlayers[undefined];
		
		const players = await User.findAll({
			where: {
				id: {
					[Op.in]: Object.keys(reqPlayers)
				}
			}
		});
	
		for(let i = 0; i < players.length; i++){
			let p = players[i];
			sendata.players[p.id] = {color: p.color, name: p.name + p.emoji, id: p.id, fid: p.fid};
			if(p.imgur)
				sendata.players[p.id].imgur = p.imgur
		}
		res.send(sendata);
	})
})

app.get('/top', async (req, res) => {
	const terrs = await Map.findAll();
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

app.post('/setflag', async (req, res) => {
	req.body.imgur = req.body.imgur.replace('http://', 'https://');
	if(!req.cookies.session) 
		return res.send(jsonerror(t[req.lang].sessionError));
	if(!/^https:\/\/i.imgur.com\/\w{7}\.(jpg|png|mp4|gif|jpeg)$/.test(req.body.imgur)) 
		return res.send(jsonerror(t[req.lang].imgurError))
	
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user) 
		return res.send(jsonerror(t[req.lang].sessionError));
	
	const r = await fetch(req.body.imgur, {method: 'HEAD'})
	if(!r.ok || r.headers.get('content-type').indexOf('image/') < 0 && r.headers.get('server') != 'cat factory 1.0')
		return res.send(jsonerror(t[req.lang].imgurError))
	
	user.imgur = req.body.imgur;
	await user.save()
	
	res.send(t[req.lang].imageUpdateSuccess);
	io.emit('updateplayers', [user.id]);
});

app.get('/timelapse', async (req, res) => {
	connection.query('SELECT * FROM timelapse ORDER BY time ASC', (err, data, fields) => {
		res.send(data);
	})
})

app.post('/pushToken', async (req, res) => {
	const user = await User.findOne({where: {session: req.cookies.session}});
	if(!user) 
		return res.send(t[req.lang].sessionError);
	
	tokens = jsParseIt(user.token);
	tokens.push(req.body.token);
	user.token = JSON.stringify(tokens);
	await user.save()
	res.send(t[req.lang].subscriptionSuccess)
})

async function sendPush(title, body, user){
	console.log('Push to: ', user.name, ' Title: ', title, ' Body: ', body)
	const tokens = jsParseIt(user.token)
	if(tokens.length < 1)
		return 'token error'
	
	console.log(JSON.stringify(tokens))
	
	const r = await fetch('https://fcm.googleapis.com/fcm/send', {
		method: 'POST', 
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'key=AAAAmlC9PFI:APA91bFlv16FLid70w5bMVxCyE47kgdKy2uFjSjcSYdaFOvJO30nFwJuQgpPkAj0XG0Xsfg3eitalDs6kG6Vwv29cPSG6j6cYak_H_Zy6yABwS5Q0jaDh_vMNKDjrSA1Vfuq39Ze4qLZ'
		}, 
		body: JSON.stringify({
			registration_ids: tokens,
			notification: {
				title: title,
				body: body,
				icon: "https://worldroulette.ru/assets/wr%20new%20sq.png",
				click_action: "https://worldroulette.ru/"
			}
		})
	});
	const json = await r.json()
	for(let i = json.results.length - 1; i >= 0; i--){
		if(json.results[i].error == 'NotRegistered')
			tokens.splice(i, 1),
			json.results.splice(i, 1);
	}
	user.token = JSON.stringify(tokens);
	await user.save()
	console.log(json)
	return json;
}

/*SOCKETS_____________________________________________
*/


var LEX = require('greenlock-express');
var lex = LEX.create({
	server: 'https://acme-v02.api.letsencrypt.org/directory',
	version: 'draft-11',
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
//console.log(lex.httpsOptions)
https.createServer(lex.httpsOptions, lex.middleware(app)).listen(443);
/*
const httpToHttps = require('http');
httpToHttps.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);*/

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

io.on('connection', async socket => {
	if(!socket.request.headers.cookie) return;
	let ip = socket.request.connection.remoteAddress.substr(7),
		session = cookie.parse(socket.request.headers.cookie).session;
	if(!session) return;
	
	const user = await User.findOne({where: {session: session}});
	if(!user) return;
	
	socketipid[ip] = socket.id;
	sessionip[session] = ip;
	online.push(user.id);
	io.emit('online', await getOnline());
	
	socket.on('disconnect', async e => {
		delete socketipid[ip];
		delete sessionip[session];
		
		online.splice(online.indexOf(user.id), 1);
		io.emit('online', await getOnline());
	});
});

app.get('/online', async (req, res) => {
	res.send(await getOnline());
});

async function getOnline(){
	let sendata = {
			online: [],
			players: {}
		},
		reqPlayers = {};

	for(let i = 0; i < online.length; i++)
	{
		let item = online[i];
		reqPlayers[item] = true;
	}
	
	const players = await User.findAll({
		where: {
			id: {
				[Op.in]: Object.keys(reqPlayers)
			}
		}
	});
	
	for(let i = 0; i < players.length; i++){
		let p = players[i];
		sendata.players[p.id] = {color: p.color, name: p.name + p.emoji, id: p.id, fid: p.fid};
		if(p.imgur) sendata.players[p.id].imgur = p.imgur
		sendata.online.push(p.id)
	}
	return sendata;
}

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

function jsParseIt(shit){
	let r;
		try {JSON.parse(shit)}
		catch(e){r = []}
	return r || JSON.parse(shit);
}

const tldList =["aaa","aarp","abarth","abb","abbott","abbvie","abc","able","abogado","abudhabi","ac","academy","accenture","accountant","accountants","aco","active","actor","ad","adac","ads","adult","ae","aeg","aero","aetna","af","afamilycompany","afl","africa","ag","agakhan","agency","ai","aig","aigo","airbus","airforce","airtel","akdn","al","alfaromeo","alibaba","alipay","allfinanz","allstate","ally","alsace","alstom","am","americanexpress","americanfamily","amex","amfam","amica","amsterdam","analytics","android","anquan","anz","ao","aol","apartments","app","apple","aq","aquarelle","ar","aramco","archi","army","arpa","art","arte","as","asda","asia","associates","at","athleta","attorney","au","auction","audi","audible","audio","auspost","author","auto","autos","avianca","aw","aws","ax","axa","az","azure","ba","baby","baidu","banamex","bananarepublic","band","bank","bar","barcelona","barclaycard","barclays","barefoot","bargains","baseball","basketball","bauhaus","bayern","bb","bbc","bbt","bbva","bcg","bcn","bd","be","beats","beauty","beer","bentley","berlin","best","bestbuy","bet","bf","bg","bh","bharti","bi","bible","bid","bike","bing","bingo","bio","biz","bj","black","blackfriday","blanco","blockbuster","blog","bloomberg","blue","bm","bms","bmw","bn","bnl","bnpparibas","bo","boats","boehringer","bofa","bom","bond","boo","book","booking","boots","bosch","bostik","boston","bot","boutique","box","br","bradesco","bridgestone","broadway","broker","brother","brussels","bs","bt","budapest","bugatti","build","builders","business","buy","buzz","bv","bw","by","bz","bzh","ca","cab","cafe","cal","call","calvinklein","cam","camera","camp","cancerresearch","canon","capetown","capital","capitalone","car","caravan","cards","care","career","careers","cars","cartier","casa","case","caseih","cash","casino","cat","catering","catholic","cba","cbn","cbre","cbs","cc","cd","ceb","center","ceo","cern","cf","cfa","cfd","cg","ch","chanel","channel","chase","chat","cheap","chintai","chloe","christmas","chrome","chrysler","church","ci","cipriani","circle","cisco","citadel","citi","citic","city","cityeats","ck","cl","claims","cleaning","click","clinic","clinique","clothing","cloud","club","clubmed","cm","cn","co","coach","codes","coffee","college","cologne","com","comcast","commbank","community","company","compare","computer","comsec","condos","construction","consulting","contact","contractors","cooking","cookingchannel","cool","coop","corsica","country","coupon","coupons","courses","cr","credit","creditcard","creditunion","cricket","crown","crs","cruise","cruises","csc","cu","cuisinella","cv","cw","cx","cy","cymru","cyou","cz","dabur","dad","dance","data","date","dating","datsun","day","dclk","dds","de","deal","dealer","deals","degree","delivery","dell","deloitte","delta","democrat","dental","dentist","desi","design","dev","dhl","diamonds","diet","digital","direct","directory","discount","discover","dish","diy","dj","dk","dm","dnp","do","docs","doctor","dodge","dog","doha","domains","dot","download","drive","dtv","dubai","duck","dunlop","duns","dupont","durban","dvag","dvr","dz","earth","eat","ec","eco","edeka","edu","education","ee","eg","email","emerck","energy","engineer","engineering","enterprises","epost","epson","equipment","er","ericsson","erni","es","esq","estate","esurance","et","eu","eurovision","eus","events","everbank","exchange","expert","exposed","express","extraspace","fage","fail","fairwinds","faith","family","fan","fans","farm","farmers","fashion","fast","fedex","feedback","ferrari","ferrero","fi","fiat","fidelity","fido","film","final","finance","financial","fire","firestone","firmdale","fish","fishing","fit","fitness","fj","fk","flickr","flights","flir","florist","flowers","fly","fm","fo","foo","food","foodnetwork","football","ford","forex","forsale","forum","foundation","fox","fr","free","fresenius","frl","frogans","frontdoor","frontier","ftr","fujitsu","fujixerox","fun","fund","furniture","futbol","fyi","ga","gal","gallery","gallo","gallup","game","games","gap","garden","gb","gbiz","gd","gdn","ge","gea","gent","genting","george","gf","gg","ggee","gh","gi","gift","gifts","gives","giving","gl","glade","glass","gle","global","globo","gm","gmail","gmbh","gmo","gmx","gn","godaddy","gold","goldpoint","golf","goo","goodhands","goodyear","goog","google","gop","got","gov","gp","gq","gr","grainger","graphics","gratis","green","gripe","group","gs","gt","gu","guardian","gucci","guge","guide","guitars","guru","gw","gy","hair","hamburg","hangout","haus","hbo","hdfc","hdfcbank","health","healthcare","help","helsinki","here","hermes","hgtv","hiphop","hisamitsu","hitachi","hiv","hk","hkt","hm","hn","hockey","holdings","holiday","homedepot","homegoods","homes","homesense","honda","honeywell","horse","hospital","host","hosting","hot","hoteles","hotmail","house","how","hr","hsbc","ht","htc","hu","hughes","hyatt","hyundai","ibm","icbc","ice","icu","id","ie","ieee","ifm","ikano","il","im","imamat","imdb","immo","immobilien","in","industries","infiniti","info","ing","ink","institute","insurance","insure","int","intel","international","intuit","investments","io","ipiranga","iq","ir","irish","is","iselect","ismaili","ist","istanbul","it","itau","itv","iveco","iwc","jaguar","java","jcb","jcp","je","jeep","jetzt","jewelry","jio","jlc","jll","jm","jmp","jnj","jo","jobs","joburg","jot","joy","jp","jpmorgan","jprs","juegos","juniper","kaufen","kddi","ke","kerryhotels","kerrylogistics","kerryproperties","kfh","kg","kh","ki","kia","kim","kinder","kindle","kitchen","kiwi","km","kn","koeln","komatsu","kosher","kp","kpmg","kpn","kr","krd","kred","kuokgroup","kw","ky","kyoto","kz","la","lacaixa","ladbrokes","lamborghini","lamer","lancaster","lancia","lancome","land","landrover","lanxess","lasalle","lat","latino","latrobe","law","lawyer","lb","lc","lds","lease","leclerc","lefrak","legal","lego","lexus","lgbt","li","liaison","lidl","life","lifeinsurance","lifestyle","lighting","like","lilly","limited","limo","lincoln","linde","link","lipsy","live","living","lixil","lk","loan","loans","locker","locus","loft","lol","london","lotte","lotto","love","lpl","lplfinancial","lr","ls","lt","ltd","ltda","lu","lundbeck","lupin","luxe","luxury","lv","ly","ma","macys","madrid","maif","maison","makeup","man","management","mango","market","marketing","markets","marriott","marshalls","maserati","mattel","mba","mc","mcd","mcdonalds","mckinsey","md","me","med","media","meet","melbourne","meme","memorial","men","menu","meo","metlife","mg","mh","miami","microsoft","mil","mini","mint","mit","mitsubishi","mk","ml","mlb","mls","mm","mma","mn","mo","mobi","mobile","mobily","moda","moe","moi","mom","monash","money","monster","montblanc","mopar","mormon","mortgage","moscow","moto","motorcycles","mov","movie","movistar","mp","mq","mr","ms","msd","mt","mtn","mtpc","mtr","mu","museum","mutual","mv","mw","mx","my","mz","na","nab","nadex","nagoya","name","nationwide","natura","navy","nba","nc","ne","nec","net","netbank","netflix","network","neustar","new","newholland","news","next","nextdirect","nexus","nf","nfl","ng","ngo","nhk","ni","nico","nike","nikon","ninja","nissan","nissay","nl","no","nokia","northwesternmutual","norton","now","nowruz","nowtv","np","nr","nra","nrw","ntt","nu","nyc","nz","obi","observer","off","office","okinawa","olayan","olayangroup","oldnavy","ollo","om","omega","one","ong","onl","online","onyourside","ooo","open","oracle","orange","org","organic","orientexpress","origins","osaka","otsuka","ott","ovh","pa","page","pamperedchef","panasonic","panerai","paris","pars","partners","parts","party","passagens","pay","pccw","pe","pet","pf","pfizer","pg","ph","pharmacy","philips","phone","photo","photography","photos","physio","piaget","pics","pictet","pictures","pid","pin","ping","pink","pioneer","pizza","pk","pl","place","play","playstation","plumbing","plus","pm","pn","pnc","pohl","poker","politie","porn","post","pr","pramerica","praxi","press","prime","pro","prod","productions","prof","progressive","promo","properties","property","protection","pru","prudential","ps","pt","pub","pw","pwc","py","qa","qpon","quebec","quest","qvc","racing","radio","raid","re","read","realestate","realtor","realty","recipes","red","redstone","redumbrella","rehab","reise","reisen","reit","reliance","ren","rent","rentals","repair","report","republican","rest","restaurant","review","reviews","rexroth","rich","richardli","ricoh","rightathome","ril","rio","rip","rmit","ro","rocher","rocks","rodeo","rogers","room","rs","rsvp","ru","ruhr","run","rw","rwe","ryukyu","sa","saarland","safe","safety","sakura","sale","salon","samsclub","samsung","sandvik","sandvikcoromant","sanofi","sap","sapo","sarl","sas","save","saxo","sb","sbi","sbs","sc","sca","scb","schaeffler","schmidt","scholarships","school","schule","schwarz","science","scjohnson","scor","scot","sd","se","seat","secure","security","seek","select","sener","services","ses","seven","sew","sex","sexy","sfr","sg","sh","shangrila","sharp","shaw","shell","shia","shiksha","shoes","shop","shopping","shouji","show","showtime","shriram","si","silk","sina","singles","site","sj","sk","ski","skin","sky","skype","sl","sling","sm","smart","smile","sn","sncf","so","soccer","social","softbank","software","sohu","solar","solutions","song","sony","soy","space","spiegel","spot","spreadbetting","sr","srl","srt","st","stada","staples","star","starhub","statebank","statefarm","statoil","stc","stcgroup","stockholm","storage","store","stream","studio","study","style","su","sucks","supplies","supply","support","surf","surgery","suzuki","sv","swatch","swiftcover","swiss","sx","sy","sydney","symantec","systems","sz","tab","taipei","talk","taobao","target","tatamotors","tatar","tattoo","tax","taxi","tc","tci","td","tdk","team","tech","technology","tel","telecity","telefonica","temasek","tennis","teva","tf","tg","th","thd","theater","theatre","tiaa","tickets","tienda","tiffany","tips","tires","tirol","tj","tjmaxx","tjx","tk","tkmaxx","tl","tm","tmall","tn","to","today","tokyo","tools","top","toray","toshiba","total","tours","town","toyota","toys","tr","trade","trading","training","travel","travelchannel","travelers","travelersinsurance","trust","trv","tt","tube","tui","tunes","tushu","tv","tvs","tw","tz","ua","ubank","ubs","uconnect","ug","uk","unicom","university","uno","uol","ups","us","uy","uz","va","vacations","vana","vanguard","vc","ve","vegas","ventures","verisign","versicherung","vet","vg","vi","viajes","video","vig","viking","villas","vin","vip","virgin","visa","vision","vista","vistaprint","viva","vivo","vlaanderen","vn","vodka","volkswagen","volvo","vote","voting","voto","voyage","vu","vuelos","wales","walmart","walter","wang","wanggou","warman","watch","watches","weather","weatherchannel","webcam","weber","website","wed","wedding","weibo","weir","wf","whoswho","wien","wiki","williamhill","win","windows","wine","winners","wme","wolterskluwer","woodside","work","works","world","wow","ws","wtc","wtf","xbox","xerox","xfinity","xihuan","xin","कॉम","セール","佛山","慈善","集团","在线","한국","大众汽车","点看","คอม","ভারত","八卦","موقع","বাংলা","公益","公司","香格里拉","网站","移动","我爱你","москва","қаз","католик","онлайн","сайт","联通","срб","бг","бел","קום","时尚","微博","淡马锡","ファッション","орг","नेट","ストア","삼성","சிங்கப்பூர்","商标","商店","商城","дети","мкд","ею","ポイント","新闻","工行","家電","كوم","中文网","中信","中国","中國","娱乐","谷歌","భారత్","ලංකා","電訊盈科","购物","クラウド","ભારત","通販","भारत","网店","संगठन","餐厅","网络","ком","укр","香港","诺基亚","食品","飞利浦","台湾","台灣","手表","手机","мон","الجزائر","عمان","ارامكو","ایران","العليان","امارات","بازار","پاکستان","الاردن","موبايلي","بھارت","المغرب","ابوظبي","السعودية","كاثوليك","سودان","همراه","عراق","مليسيا","澳門","닷컴","政府","شبكة","بيتك","გე","机构","组织机构","健康","ไทย","سورية","рус","рф","珠宝","تونس","大拿","みんな","グーグル","ελ","世界","書籍","ਭਾਰਤ","网址","닷넷","コム","天主教","游戏","vermögensberater","vermögensberatung","企业","信息","嘉里大酒店","嘉里","مصر","قطر","广东","இலங்கை","இந்தியா","հայ","新加坡","فلسطين","政务","xperia","xxx","xyz","yachts","yahoo","yamaxun","yandex","ye","yodobashi","yoga","yokohama","you","youtube","yt","yun","za","zappos","zara","zero","zip","zippo","zm","zone","zuerich","zw"];
