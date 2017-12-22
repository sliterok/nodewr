let lastmsgtime,
	tcont,
	chatmsg,
	keyarr = [];
$(()=>{
	chatmsg = $('#chatmsg')
});


function sendMessage(){
	let text = chatmsg.val();
	if(text == '') return;

	$.ajax({
		type: 'POST',
		url: '/write',
		contentType: "application/json",
		data: JSON.stringify({ msg: text }),
		success: data => {
			if(data) alertify.error(data);
		},
		error: xhr => {
			if(xhr.status == 503) {
				setTimeout(()=>{
					sendmsg(text)
				}, 1000);
			}
		}
	});
	chatmsg.val('')
}
$(window).keypress(e => {
	console.log(e);
	if(e.keyCode == 13) sendMessage()
});
/**
 * Load new messages
 */
function getmsg() {
	$.ajax({
		type: 'POST',
		url: '/chat',
		contentType: "application/json",
		data: JSON.stringify({last: lastmsgtime}),
		success: data => {
			if(data) pulltochat(data);
			else alertify.error('Чат сломался!')
		}
	});
}

socket.on('updatechat', function(data){
	lastmsgtime = data;
	getmsg();
});
socket.on('updateplayers', function(msg){
	reloadPlayers(msg, updateMap);
});
function pulltochat(content) //Расположение контента чата
{
	if (!content) return alertify.error('Чат сломался');
	applyPlayers(content.players);
	content = content.chat;
	let keys = Object.keys(content);
	for(let i = 0; i<keys.length; i++){
		let key = keys[i],
			item = content[key];
		if($('#chatwindow').children().first().data('msgTime') == key) return;
		if($('#chatwindow').find(key).length != 0) continue;
		if(!lastmsgtime) lastmsgtime = key;
		if($('#chatwindow').children().length > 300) $('#chatwindow').children().last().remove();
		let el = $(`<div class="msg" data-msg-time="${key}"></div>`).prependTo('#chatwindow');
		if(item.id == 13) el.css('background-color', '#322');
		if(item.id == players[me].id && item.to) el.css('background-color', '#4b4b4b');
		if(item.to == players[me].id && item.to) el.css('background-color', '#174b35');
		item.msg = twemoji.parse(item.msg);
		let replaces = 0;
		item.msg = item.msg.replace(/\$[0-9]{1,5}/g, function(a, b){
			if(replaces > 10) return a;
			replaces++;
			if(players[me] && players[me].id && a.substr(1) == players[me].id) el.css('background-color', '#223');
			var id = parseInt(a.substr(1));
			if(players[id]){
				var name = players[id].name;
				name = twemoji.parse(name);
				if(name == '') return a;
				else return `<span class='chatname ${id}' data-name-color='${Math.floor((id % 10)/2)}'>${name}</span>`;
			}
			else return a;
		});
		replaces = 0;
		item.msg = item.msg.replace(/\$[A-Z]{2}/gi, function(a, b){
			if(replaces > 10) return;
			replaces++;
			return `<img class="flag-icon chat-flag" data-code="${a.substr(1).toUpperCase()}" onerror="$(this).replaceWith('${a}');" src='https://worldroulette.ru/flags/4x3/${a.substr(1).toLowerCase()}.svg'></img>`;
		});
		let name = twemoji.parse(players[item.id].name),
			date = new Date(parseInt(key.substring(0, key.length-3)));
		el.html(': ');
		let msgel = $('<span>'+item.msg+'</span>').appendTo(el);
		msgel.find('img.emoji').mouseleave(rmPMenu).mousemove(e=>{
			let url = e.target.src,
				tooltip = $('.player-tooltip');
			tooltip.html(`<img src="${url}">`);
			let x = e.pageX - tooltip.outerWidth()/2,
				y = e.pageY - tooltip.outerHeight() - 15;
			if(x < 0) x = 0;
			else if(x + tooltip.outerWidth() + 1 >= $(window).width()) x = $(window).width() - tooltip.outerWidth() - 1;
			if(y < 0) y = $(window).height() - tooltip.outerHeight() - 1;
			tooltip.css({
				left: x,
				top: y,
				visibility: 'visible',
				opacity: 1
			});
		});
		msgel.find('a[href]').mouseleave(rmPMenu).each((i, el)=>{
			let tgt = $(el),
				url = tgt.context.href.replace(/http:\/\//gi, 'https://'),
				tooltip = $('.player-tooltip');

			$.ajax(url, {
				method: 'HEAD',
				success: (data, status, xhr)=>{
					if(xhr.getResponseHeader('Content-Type').indexOf('image') < 0) return;
					tgt.css('color', '#8bce95');
					tgt.mousemove(e=>{
						tooltip.html(`<img style="max-width: 60vw; max-height: 49vh;" src="${url}">`);
						let x = e.pageX - tooltip.outerWidth()/2,
							y = e.pageY - tooltip.outerHeight() - 15;
						if(x < 0) x = 0;
						else if(x + tooltip.outerWidth() + 1 >= $(window).width()) x = $(window).width() - tooltip.outerWidth() - 1;
						if(y < 0) y = $(window).height() - tooltip.outerHeight() - 1;
						tooltip.css({
							left: x,
							top: y,
							visibility: 'visible',
							opacity: 1
						});
					})
				}
			})
		});
		if(item.to){
			let nameto = twemoji.parse(players[item.to].name);
			el.prepend(`<span type="msg" class="chatname ${item.to}" data-name-color="${Math.floor((item.to % 10)/2)}">${nameto}</span>`);
			el.prepend(`<span type="msg" class="chatname ${item.id}" data-name-color="${Math.floor((item.id % 10)/2)}">${name}</span> > `);
		} else {
			el.prepend(`<span class="chatname ${item.id}" data-name-color="${Math.floor((item.id % 10)/2)}">${name}</span>`);
			el.append(`<span class="chatcolor ${item.id}" style="background-color: ${factions[players[item.id].fid] ? factions[players[item.id].fid].color : players[item.id].Color}">&nbsp;&nbsp;&nbsp;&nbsp;</span>`);
		}
		el.append(`<span title="${date} ${key.substring(key.length-6, key.length-3)} msec ${key.substring(key.length-3)} nanosec" class="msgdate"> ${addZero(date.getHours())}:${addZero(date.getMinutes())}:${addZero(date.getSeconds())}</span>`);
		let elmsg = $('.chatname.'+item.id);
		el.hide().fadeIn(400);
	}
	$('.chat-flag').off('hover');
	$('.chat-flag').mousemove((e)=>{
		let tgt = $(e.target),
			code = tgt.data('code'),
			uid = cdata[code].uid,
			player = players[uid],
			tooltip = $('.player-tooltip');
		tooltip.html(`<div style="text-align: center">${player.imgur ? `<img class="player-flag" src="${player.imgur}">` : ''}<div class="player-profile">${map.regions[code].config.name} <span class="flag-icon flag-icon-${code}"></span> ${code}<br> <span data-name-color="${Math.floor((uid % 10)/2)}">${twemoji.parse(player.name)} [${uid}]</span></br>${factions[player.fid] ? `Фракция: ${factions[player.fid].name}</br>` : ''} Сила: ${romanize(cdata[code].sp)}</div></div>`);
		let x = e.pageX - tooltip.outerWidth()/2
		if(x - tooltip.outerWidth()/2 < 0) x = 0;
		else if(x + tooltip.outerWidth() + 1 >= $(window).width()) x = $(window).width() - tooltip.outerWidth() - 1;
		tooltip.css({
			left: x,
			top: e.pageY - tooltip.outerHeight() - 15,
			visibility: 'visible',
			opacity: 1
		});
	}).mouseleave((e)=>{
		$('.player-tooltip').css({
			visibility: '',
			opacity: '',
			left: '',
			top: ''
		});
	});
	$('.chatname').off('mousemove mouseleave contextmenu taphold click mouseenter').mousemove(getPMenu).mouseleave(e=>{updateMap();rmPMenu();}).mouseenter(e=>{
		let mapData = {},
			tgt = $(e.target),
			id = tgt[0].classList[1];

		for(let index in cdata){
			let el = cdata[index];
			mapData[index] = factions[players[el.uid].fid] ? factions[players[el.uid].fid].color : players[el.uid].Color;
			if(id == el.uid) {
				let clr = lightenColor(mapData[index].substr(1, 6), 20);
				if(clr == 'ffffff') clr = lightenColor(mapData[index].substr(1, 6), -20);
				mapData[index] = '#'+clr;
			}
		}
		map.series.regions[0].setValues(mapData);
	}).on('taphold contextmenu', e=>{
		e.preventDefault();
		let ctxmenu = $('.player-menu');
		$('.player-menu').data('pid', $(e.target)[0].classList[1]);
		ctxmenu.css({
			left: e.pageX || $(e.target).offset().left + $(e.target).width(),
			top: e.pageY || $(e.target).offset().top + $(e.target).height(),
			display: 'initial',
			opacity: 1
		});
	}).click(event=>{
		if($('.player-menu').css('display') == 'block') return false;
		let tgt = $(event.target);
		if(tgt.hasClass('emoji')) tgt = tgt.parent();
		if(tgt.attr('type') == 'msg'){
			chatmsg.val(`/msg ${tgt[0].classList[1]} `);
		} else {
			chatmsg.val(`$${tgt[0].classList[1]}, `);
		}
		chatmsg.focus();
	});
}

function getPMenu(e){
	let tgt = $(e.target),
		id = tgt[0].classList[1],
		player = players[id],
		tooltip = $('.player-tooltip');
	if(!player) return
	let name = twemoji.parse(player.name);
	tooltip.html(`${player.imgur ? `<img class="player-flag" style="border: 2px solid ${factions[player.fid] ? factions[player.fid].color : player.Color}" src="${player.imgur}">` : ''}<div class="player-profile"><span data-name-color="${Math.floor((id % 10)/2)}">${name}</span><br>${factions[player.fid] ? `Фракция: ${factions[player.fid].name}</br>` : ''}ID: ${id}</div>`);
	let x = e.pageX - tooltip.outerWidth()/2;
	if(x < 0) x = 0;
	else if(x + tooltip.outerWidth() + 1 >= $(window).width()) x = $(window).width() - tooltip.outerWidth() - 1;
	tooltip.css({
		left: x,
		top: e.pageY - tooltip.outerHeight() - 15,
		visibility: 'visible',
		opacity: 1
	});
}

function rmPMenu(){
	$('.player-tooltip').css({
		visibility: '',
		opacity: '',
		left: '',
		top: ''
	});
}


function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}

function lightenColor(color, percent) {
	let num = parseInt(color,16),
		amt = Math.round(2.55 * percent),
		R = (num >> 16) + amt,
		B = (num >> 8 & 0x00FF) + amt,
		G = (num & 0x0000FF) + amt;

	return (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
};
