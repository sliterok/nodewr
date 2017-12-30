
getenergy();
let rollsuccsound = new Audio('/assets/rollsucc.wav');

$(()=>{
	$("input[type=button]:enabled, button:enabled, .btn:enabled").on('mousedown', function (e) {
		if(e.which == 1){
			let ripple = $('<div></div>').appendTo($(this));
			var d = Math.max($(this).width(), $(this).height());
			ripple.css('width', d + 'px');
			ripple.css('height', d + 'px');
			var rect = this.getBoundingClientRect();
			ripple.css('left', e.clientX - rect.left -d/2 + 'px');
			ripple.css('top', e.clientY - rect.top - d/2 + 'px');
			ripple.addClass('ripple');
			window.setTimeout(function(){ripple.remove();}, 600)
		}
	});
	$('#give').click(function(e){
	    if (!ccode) return alertify.error("Вы не выбрали территорию.");
		$.ajax({
	        type: 'POST',
			url: '/give',
	        contentType: "application/json",
			data: JSON.stringify({
				target: ccode,
				targetplid: $('#givenick').val()
			}),
			success: (data)=>{
				alertify.log(parseCountry(data))
			}
		});
	});
	$("#capt").click(function(e){
	    if(!ccode) return alertify.error("Вы не выбрали территорию.");
		if(!e.originalEvent.isTrusted) return;
		$.ajax({
			type: 'POST',
			url: '/roll',
			contentType: "application/json",
			dataType:'json',
			data: JSON.stringify(
			{
				target: ccode,
				captcha: grecaptcha.getResponse()
			}),
			success: (data)=>{
				if(data.result == 'success'){
					mapDisabled = true;
					$('#capt').attr('disabled', '');
					$('#captpause').css('display', '');
					$('#capttext').css('display', 'none');
					window.setTimeout(removedisable,5000);
					alertify.success(parseCountry(data.data));
					rollsuccsound.volume = audioenabled/500;
					rollsuccsound.currentTime = 0;
					rollsuccsound.play();
					if(data.numbers) {
						let words = {
							'2': 'DOUBLE!',
							'3': 'TRIPLE!',
							'4': 'QUADRIPLE!',
							'5': 'PENTIPLE!'
						};
						let alert = $(`<div class="overwatch-alert"><span class="neon">${words[data.numbers]}</span></div>`).appendTo(document.body);
						let aud = $('<audio><source src="/assets/numbers.ogg" type="audio/ogg"></audio>').appendTo(document.body);
						aud[0].volume = audioenabled/500;
						setTimeout(e => {
							aud[0].play();
						}, 400);
						setTimeout(e => {
							alert.remove();
							aud.remove();
						}, 4000);
					}
				}
				else if(data.result == 'note') alertify.log(parseCountry(data.data));
				else if(data.result == 'fail'){
					mapDisabled = true;
					$('#capt').attr('disabled', '');
					$('#captpause').css('display', '');
					$('#capttext').css('display', 'none');
					window.setTimeout(removedisable,5000);
					alertify.error(parseCountry(data.data));
				}
				else if(data.result == 'error') alertify.error(parseCountry(data.data));
				getenergy();
			}
		})
	});
	$('#leavef').click(function() {
		$.ajax({
			type: 'POST',
			url: '/fleave',
			contentType: "application/json",
			success: function(data){
				alertify.log(data);
				getcurrf();
			}
		});
	});
	$('#changefcolorbtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/fcolor',
	        contentType: "application/json",
			data: JSON.stringify(
			{
				color: $('#newfcolor').val()
			}),
			success: function(data){
				alertify.log(data);
			}
		});
	});
	$('#changefnamebtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/fname',
	        contentType: "application/json",
			data: JSON.stringify(
			{
				name: $('#newfname').val()
			}),
			success: function(data){
				alertify.log(data);
			}
		});
	});
	$('#createf').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/fcreate',
	        contentType: "application/json",
			data: JSON.stringify(
			{
				fname: $('#fname').val(),
				color: $('#fcolor').val()
			}),
			success: function(data){
				alertify.log(data);
				getcurrf();
			}
		});
	});
	$('#deletef').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/fremove',
	        contentType: "application/json",
			success: function(data){
				alertify.log(data);
				getcurrf();
			}
		});
	});
	$('#invitetofbtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/finvite',
	        contentType: "application/json",
			data: JSON.stringify(
			{
				pid: $('#invitetof').val()
			}),
			success: function(data){
				alertify.log(data);
				getcurrf();
			}
		});
	});
	$('#changebkgbtn').click(function() {
		togbkg = !togbkg;
		localStorage.setItem("oldbkg", togbkg);
		$('#map').parent().toggleClass('mapeasy');
		$('#map').parent().toggleClass('map');
	});
	$('#soundrange').on("change mousemove", function() {
		var val = $(this).val()/100;
		localStorage.setItem("sound", val);
		audioenabled = val;
		$(this).next().html(val+'%');
	});
	$('#togtopbtn').click(function() {
		togtop = !togtop;
		localStorage.setItem("togtop", togtop);
		$('.top').toggle('slow');
	});
	$('#menubtn').click(function(event) {
		event.stopPropagation();
		$('.auth').fadeOut(500);
		$('#mmenu').fadeIn(500);
	});
	$('#fbtn').click(function(event) {
		event.stopPropagation();
		$('.auth').fadeOut(500);
		$('#fmenu').fadeIn(500);
	});
	$('#faqbtn').click(function(event) {
		event.stopPropagation();
		$('.auth').fadeOut(500);
		$('#faq').fadeIn(500);
	});
	$('#mmenu').click(function(event) {
		event.stopPropagation();
	});
	$('#fmenu').find('*').click(function(event) {
		event.stopPropagation();
	});
	$(window).click(e=>{
		let tgt = $(e.target);
		let counter = 0;
		while(tgt.parent()[0] != document.body && counter < 20) {
			tgt = tgt.parent();
			counter++;
		}
		if($('#mmenu,#faq,#fmenu').has($(e.target)).length < 1 && tgt.next().length > 0){
			$('#mmenu').fadeOut(500);
			$('#faq').fadeOut(500);
			$('#fmenu').fadeOut(500);
		}
	});
	$('#newcolor').keyup(()=>{
		$('#newcolor').attr('style', 'color: '+$('#newcolor').val())
	});
	$('#changecolorbtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/color',
	        contentType: "application/json",
	        dataType:'json',
			data: JSON.stringify(
			{
				color: $('#newcolor').val()
			}),
			success: function(data){
				alertify.log(data);
				$('#mmenu').fadeOut(500);
			},
			error: function(data){
				alertify.log(data.responseText);
				$('#mmenu').fadeOut(500);
			}
		});
	});
	$('#changenamebtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/name',
	        contentType: "application/json",
	        dataType:'json',
			data: JSON.stringify(
			{
				name: $('#newname').val()
			}),
			success: function(data){
				alertify.log(data);
				$('#mmenu').fadeOut(500);
			},
			error: function(data){
				alertify.log(data.responseText);
				$('#mmenu').fadeOut(500);
			}
		});
	});
	$('#changeemojibtn').click(function() {
		$.ajax({
	        type: 'POST',
			url: '/emoji',
	        contentType: "application/json",
	        dataType:'json',
			data: JSON.stringify(
			{
				emoji: $('#newemoji').val()
			}),
			success: function(data){
				alertify.log(data);
				$('#mmenu').fadeOut(500);
			},
			error: function(data){
				alertify.log(data.responseText);
				$('#mmenu').fadeOut(500);
			}
		});
	});
	$('#changeflagbtn').click(function() {
		var preview = document.querySelector('img');
		var file    = $('#newflag')[0].files[0];
		var reader  = new FileReader();

		reader.onloadend = function () {
			var img = reader.result.replace(/^data:image\/[a-z]+;base64,/, "");
			$.ajax({
				type: 'POST',
				url: 'https://imgur-apiv3.p.mashape.com/3/image',
				headers: {
					'X-Mashape-Key': 'P9vmrwUlbRmsh2yRiNSMSPSiaGByp1J5yfOjsnfwTrYaaUCxxY',
					'Authorization': 'Client-ID b9836180c2418d2',
					'Accept': 'application/json'
				},
				contentType: "application/x-www-form-urlencoded",
				dataType: 'json',
				data: { "type": "base64", "image": img },
				success: function(imgur){
					if(imgur.success != true) alertify.error(imgur.data.error);
					else $.ajax({
						type: 'POST',
						url: '/setflag',
						contentType: "application/json",
						dataType:'json',
						data: JSON.stringify(
						{
							imgur: imgur.data.link
						}),
						success: function(data){
							if(data.result == 'success') alertify.success(data.data);
							if(data.result == 'error') alertify.error(data.data);
							$('#mmenu').fadeOut(500);
						},
						error: function(data){
							alertify.log(data.responseText);
							$('#mmenu').fadeOut(500);
						}
					});
				},
				error: function(imgur){
					alertify.error('Imgur: '+imgur.responseJSON.data.error);
				}
			});
		}

		if (file) {
			reader.readAsDataURL(file);
		} else {
			alertify.error('Вы не выбрали файл!');
		}
	});
})
function getcurrf(){
	$.ajax({
        type: 'GET',
		url: '/currf',
        contentType: "application/json",
		success: function(data){
			if(data == 1){
				$('#fuser').css('display', 'none');
				$('#fadmin').css('display', '');
				$('#fnone').css('display', 'none');
				getcurrfusers(true);
			}
			if(data == 0){
				$('#fuser').css('display', '');
				$('#fadmin').css('display', 'none');
				$('#fnone').css('display', 'none');
				getcurrfusers();
			}
			if(data == -1){
				$('#fuser').css('display', 'none');
				$('#fadmin').css('display', 'none');
				$('#fnone').css('display', '');
				getcurrinv();
			}
		}
	});
};
function getcurrinv(){
	let invitesEl = $('#invites');
	$.ajax({
        type: 'GET',
		url: '/currinvites',
        contentType: "application/json",
		success: function(data){
			data = JSON.parse(data);
			if(data.length < 1) invitesEl.html('');
			else for(let i = 0; i<data.length; i++){
				let fid = data[i],
					prev = $('#invites').html(),
					inviteEl = $('<div></div>').appendTo(invitesEl);

				$('<button>Принять</button>').appendTo(inviteEl).click(function() {
					accinv(fid);
				});
				inviteEl.append('<span class="ml-1"></span>');
				$('<button>Отклонить</button>').appendTo(inviteEl).click(function() {
					declinv(fid);
				});
				$.get('/getfname?id='+data[i], (data)=>{
					if(data) inviteEl.prepend(data+'<span class="ml-1"></span>');
					else declinv(fid);
				});
			}
		}
	});
}
function getcurrfusers(admin){
	$.ajax({
        type: 'GET',
		url: '/currfusers',
        contentType: "application/json",
		success: function(userlist){
			userlist = JSON.parse(userlist);
			let parrentEl = $((admin ? '#fadmin' : '#fuser') + ' .factionplayers');
			$('.factionplayers').html('');
			reloadPlayers(userlist, e => {
				for(let i = 0; i<userlist.length; i++){
					let id = userlist[i];
					let playerEl = $(`<div class="invite" id="${id}"></div>`).appendTo(parrentEl);
					let chatName = $(`<span class="chatname ${id}">${players[id].name}</span>`).appendTo(playerEl).mousemove(getPMenu).mouseleave(rmPMenu);
					playerEl.append(' ');
					if(admin) $(`<button class="kickuser" pid="${id}">Кикнуть</button>`).appendTo(playerEl).click(function(e){
						$.ajax({
							type: 'POST',
							url: '/fkick',
							data: JSON.stringify({
								fid: $(e.target).attr('pid')
							}),
							contentType: "application/json",
							success: function(data){
								alertify.log(data);
								getcurrfusers(true);
							}
						});
					});
				}
			});
		}
	});
}
function declinv(id){
	$.ajax({
		type: 'POST',
		url: '/fdecline',
		contentType: "application/json",
		data: JSON.stringify(
		{
			fid: id
		}),
		success: function(data){
			alertify.success(data);
			getcurrf();
		}
	});
}
function accinv(id){
	$.ajax({
		type: 'POST',
		url: '/fjoin',
		contentType: "application/json",
		data: JSON.stringify(
		{
			fid: id
		}),
		success: function(data){
			alertify.success(data);
			getcurrf();
		}
	});
}
let togbkg = false, audioenabled = 100, togtop = true;
if (typeof(Storage) !== "undefined") {

	if(localStorage.getItem("oldbkg") != undefined && localStorage.getItem("oldbkg") == 'true'){
		$('#map').parent().addClass('mapeasy');
		$('#map').parent().removeClass('map');
		togbkg = true;
	}

	if(localStorage.getItem("sound") != undefined) audioenabled = localStorage.getItem("sound");
	$(e => {
        $('#soundrange').val(audioenabled*100).next().html(audioenabled+'%');
	})

	if(localStorage.getItem("togtop") != undefined && localStorage.getItem("togtop") != 'true'){
		togtop = false;
		$('.top').css('display', 'none');
	}
}

function getenergy()
{
	$.post("/getenergy", data=>{
		if(data == 'Wrong session!'){alertify.error(data);}
		if(data > 0) $('#captcha').css('display', 'none');
		else $('#captcha').css('display', '');
		if(typeof grecaptcha !== 'undefined' && grecaptcha.getResponse() != '') grecaptcha.reset();
	});
};
socket.on('attack', function(msg){
	alertify.error([parseCountry(msg)]);
});
socket.on('heal', function(msg){
	alertify.success([parseCountry(msg)]);
});
socket.on('invite', function(msg){
	alertify.success([msg]);
	getcurrinv();
});
socket.on('give', function(msg){
	alertify.success([parseCountry(msg)]);
});
socket.on('online', data=>{
	online = data;
	updateOnline();
});
let clicksound = new Audio('/assets/click.wav');
function removedisable() {
	mapDisabled = false;
	$('#capt').removeAttr("disabled");
	$('#captpause').css('display', 'none');
	$('#capttext').css('display', '');
	clicksound.volume = audioenabled/1000;
	clicksound.currentTime = 0;
	clicksound.play();
}

function reloadOnline(cb){
	return $.get('/online', data=>{
		online = data;
		if(!cb) updateOnline();
	}).promise();
}

function updateOnline(){
	$('#online').text(online.length).parent().off('mousemove mouseleave').mouseleave(rmPMenu).mousemove((e)=>{
		let tooltip = $('.player-tooltip').html('');
		for(let i = 0; i<online.length; i++){
			let pid = online[i];
			tooltip.append(`<div>${twemoji.parse(players[pid].name)}</div>`);
		}
		let x = e.pageX - tooltip.outerWidth()/2,
			y = e.pageY + 20;
		if(x < 0) x = 0;
		else if(x + tooltip.outerWidth() + 1 >= $(window).width()) x = $(window).width() - tooltip.outerWidth() - 1;
		if(y < 0) y = 0;
		else if(y + tooltip.outerHeight() + 1 >= $(window).height()) y = $(window).height() - tooltip.outerHeight() - 1;
		tooltip.css({
			left: x,
			top: y,
			visibility: 'visible',
			opacity: 1
		});
	});
}

function parseCountry(msg){
	return msg.replace(/\[[a-z]{2}\]/gi, function(a){
		return map.regions[a.replace(/[\[\]]/gi, '')].config.name;
	})
}
