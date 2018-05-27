let auid,
	Power,
	number,
	me,
	map,
	cdata,
	players = {},
	ccode,
	online,
	plTop,
	mapDisabled = false,
	hitsound = new Audio('/assets/hit.wav');

function init(){

	let pgPromise = new Promise(resolve=>{
		$(document.body).ready(()=>{
			resolve();
		})
	})

	let pArr = [reloadFactions(), reloadMap(true), pgPromise, reloadOnline(), reloadTop(true), getmsg(true), reloadThis()];
	Promise.all(pArr).then(()=>{
		deployMap('world_mill', 'start')
		updateOnline()
		updateMap()
		updateTop()
		updatePlayers()
		pulltochat()
		getcurrf()
		let conq = []
		$('#faq .chatname').each((i, el) => {
			if(Object.keys(players).indexOf(el.classList[1]) < 0) conq.push(parseInt(el.classList[1]))
		})
		reloadPlayers(conq)
	});
}

init();

/**
 * Apply newly downloaded player data into global variable
 * @param {Array} pl Array of players
 */
function applyPlayers(pl){
	console.log(pl);
	$.each(pl, (id, player)=>{
		players[id] = player;
	})
}

/**
 * Download pointed players from server
 * @param   {Array}    ids Array of selected players
 * @param   {function} cb  If function -> executes it
 *                         If true -> doesn't apper new values
 * @returns {[[Type]]} [[Description]]
 */
function reloadPlayers(ids, cb)
{
	
	return $.get(
		"/getplayers?ids="+JSON.stringify(ids), function(data){
			applyPlayers(data);
			if(typeof cb == 'function') cb();
			else if(!cb) updatePlayers();
	}).promise();
}

function reloadThis(){
	return $.post("/getthis", function(data) {
		if(Object.keys(data).length > 0) {
			applyPlayers(data);
			me = data[Object.keys(data)[0]].id;
		} else return location.reload()
	}).promise();
}

/**
 * Update players info from local cache
 * @param {function} cb Callback
 */
function updatePlayers(cb)
{
	let keys = Object.keys(players);
	for(let i = 0; i<keys.length; i++){
		let player = players[keys[i]];
		$('.chatname.'+player.id).html(twemoji.parse(player.name));
		$('.chatcolor.'+player.id).css('background-color', factions[player.fid] ? factions[player.fid].color : player.Color);
	}
	if(cb) cb();
}

/**
 * Sets percents and removes main loading animation
 * @param {number}  percent Percent of completion
 * @param {boolean} first   First time firing?	
 */
function setmainloader(percent, first){
	if(percent < 100 && percent > 0 && first){
		percent += getRandomInt(-10, 10);
	}
	$('.loadscreen .progressbar div span').text(percent+'%');
	//$('.loadscreen .progressbar div').css('width', percent+'%');
	$('.loadscreen .progressbar div').animate({width: percent+'%'});
	if(percent == 100){
		let ls = $('.loadscreen'),
			left = getRandomInt(1, 3), //3 for extra
			right = getRandomInt(0, 1);

		if(left == 1){
			ls.css('margin-left', '100vw');
			if(right == 1) ls.css('margin-left', '-100vw');
		} else if(left == 2){
			ls.css('margin-top', '100vh');
			if(right == 1) ls.css('margin-top', '-100vh');
		} else if(left == 3){
			ls.css('margin-left', '100vw');
			ls.css('margin-top', '100vh');
			if(right == 1){
				ls.css('margin-left', '-100vw');
				ls.css('margin-top', '-100vh');
			}
		}
		window.setTimeout(()=>{
			$('.loadscreen').remove();
		}, 2000)
	}
}

var timeout;
var moving;
number = 0;

function deployMap(projection, start){
	if(map && map.remove) map.remove()
	map = new jvm.Map({
		map: projection,
		regionsSelectable: true,
		backgroundColor: 'transparent',
		regionsSelectableOne: true,
		zoomMax: '18',
		zoomOnScrollSpeed: '1',
		container: $('#map'),
		series: {
			regions: [{
				attribute: 'fill'
			}]
		},
		regionStyle: {
			selected: {
				stroke: '#000000',
				'stroke-width': '1', //0.5
			}
		},
		zoomButtons: false,
		onRegionSelected: function (event, region, isSelected, Arrselected)
		{
			if(Arrselected[0] == 'RU') {
				deployMap('ru_fd_mill');
				$('#map .leave').show();
			} else if(Arrselected[0]) {
				ccode = Arrselected[0];
				let uid = cdata[ccode].uid,
					enemy = players[uid],
					thisp = players[me];

				if((uid != me) && ((enemy.fid != thisp.fid && (thisp.fid || enemy.fid)) || (enemy.fid == 0 && thisp.fid == 0))){
					$('#capttext').text('Захватить');
				} else {
					$('#capttext').text('Улучшить');
					if(!cdata[ccode].sp == 7){
						$('#capt').attr('disabled', '');
						$('#capttext').text('Макс. сила');
					} else if(!mapDisabled) {
						$('#capt').removeAttr("disabled");
					}
				}

				hitsound.volume = audioenabled/1000;
				hitsound.currentTime = 0;
				hitsound.play();
			}
		},
		onRegionTipShow: function (event, label, code)
		{
			let uid = cdata[code].uid;
			let player = players[uid];
			label.html(`<div style="text-align: center">${player.imgur ? `<img class="player-flag" src="${player.imgur.replace('"', '')}">` : ''}<div class="player-profile">${label.html()} <span class="flag-icon flag-icon-${code.length < 3 ? code : code.substr(0, 2)}"></span> ${code}<br> <span data-name-color="${Math.floor((uid % 10)/2)}">${twemoji.parse(player.name)} [${uid}]</span></br>${factions[player.fid] ? `Фракция: ${factions[player.fid].name}</br>` : ''} Сила: ${romanize(cdata[code].sp)}</div></div>`);
		}
	});
	$('#map').hide();
	$('#map').mousedown((e)=>{
		if(e.which == 2){
			console.log(e);
			return false;
		}
	})
	if(!start) updateMap();
}

/**
 * Download map from the server
 * Default to appear values onto the map
 * @param   {boolean} cb don't appear new values
 * @returns {function} promise
 */
function reloadMap(cb){
	return $.post("/get", data => {
		console.log(data);
		if(data.map){
			applyPlayers(data.players);
			cdata = data.map;
		}
		else cdata = data;
		if(!cb) updateMap();
	}).promise();
}

/**
 * Update map values locally
 * Also changes button text
 */
function updateMap() {
	let mapData = {};
	for(let index in cdata){
		let el = cdata[index];
		mapData[index] = factions[players[el.uid].fid] ? factions[players[el.uid].fid].color : players[el.uid].Color;
	}
	map.series.regions[0].setValues(mapData);

	if(ccode){
		let uid = cdata[ccode].uid,
			enemy = players[uid],
			thisp = players[me];

		if((uid != me) && ((enemy.fid != thisp.fid && (thisp.fid || enemy.fid)) || (enemy.fid == 0 && thisp.fid == 0))){
			$('#capttext').text('Захватить');
		} else {
			$('#capttext').text('Улучшить');
			if(!cdata[ccode].sp == 7){
				$('#capt').attr('disabled', '');
				$('#capttext').text('Макс. сила');
			} else if(!mapDisabled) {
				$('#capt').removeAttr("disabled");
			}
		}
	}
	$('#map').show();
	map.updateSize();
	setmainloader(100);
}

/**
 * Downloads top values from server
 * @param   {boolean}  cb don't appear new values
 * @returns {function} promise
 */
function reloadTop(cb){
	return jQuery.get("/top", data=>{
		plTop = JSON.parse(data);
		if(!cb) updateTop();
	}).promise();
}


/**
 * Update top values locally
 */
function updateTop() {
	$('.mapdib.top').html('');
	for(let el in plTop){
		let pl = plTop[el],
			pid = pl.id;
		if(!pid) return;
		console.log(factions[players[pid].fid], players[pid]);
		$('.mapdib.top').append(`
			<div>
				<span class="chatcolor ${pid}" style="float: none; background-color: ${players[pid].fid ? factions[players[pid].fid] ? factions[players[pid].fid].color : players[pid].Color : players[pid].Color}">&nbsp;&nbsp;&nbsp;&nbsp;</span>&nbsp;
				<span class="chatname ${pid}">${twemoji.parse(players[pid].name)}</span>&nbsp;
				${pl.score}&nbsp;силы
			</div>`);
	}
}

socket.on('updatemap', function(msg){
	reloadMap();
	reloadTop();
});

screening = false;
$(window).keyup(e => {
	if(e.keyCode == 44 && !screening){
		screening = true;
		let bwidth = $('#map').width(),
			bheight = $('#map').height(),
			width = 3840,
			height = 2160,
			img = new Image();
		c = $('<canvas id="cvs" />').appendTo(document.body).hide();
		$('#map').width(width);
		$('#map').height(height);
		map.updateSize();
		img.onload = function() {
			c.attr('width', width);
			c.attr('height', height);
			let date = (new Date()).toUTCString(),
				ctx = c[0].getContext('2d');
			ctx.drawImage(img, 0, 0);

			ctx.lineWidth = 1;
			ctx.font = "30px Arial";
			ctx.textAlign="start";
			ctx.fillStyle = '#ffffff';
			ctx.fillText(date, 15, height-15);
			ctx.strokeText(date, 15, height-15);

			if($('.mapdib.top').children().length == 1){
				ctx.font = "120px Arial";
				ctx.textAlign="center";
				let bestPlayer = $('.mapdib.top').find('.chatname').text();
				ctx.fillStyle = $('.mapdib.top').find('.chatcolor').css('background-color');
				ctx.fillText(bestPlayer, width/2, height/4);
				ctx.lineWidth = 3;
				ctx.strokeText(bestPlayer, width/2, height/4);
			}
			c[0].toBlob(function(blob) {
				saveAs(blob, "WorldRoulette_map_"+Date.now()+".png");
				c.remove();
				screening = false;
			});
		};
		img.src = "data:image/svg+xml;charset=utf-8,"+(new XMLSerializer).serializeToString($('#map').find('svg')[0]);
		$('#map').width(bwidth);
		$('#map').height(bheight);
		map.updateSize();
	}
});

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function romanize(num) {
  var lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1},
	  roman = '',
	  i;
  for ( i in lookup ) {
	while ( num >= lookup[i] ) {
	  roman += i;
	  num -= lookup[i];
	}
  }
  return roman;
}
