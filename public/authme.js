$("#map").animate({width: '20%', height: '20%', left: '20', top: '20', right: '100%'}, 'slow');
alertify.parent(document.body);
alertify.closeLogOnClick(true);
alertify.logPosition("bottom right");
/**
 * Append loading animation
 */
function appendLoadScreen(){
    $('.loadscreen').css('display', '');
    window.setTimeout(a => $('.loadscreen').css('margin-top', ''), 1);
    window.setTimeout(a => location.reload(true), 501);
}
/**
 * Used as callback for grecaptcha plugin to send user's data
 * @param {string} captcha grecaptcha response
 */
function login(captcha){
	$.post('/login', {
		login: $('#llogin').val(), pass: $('#lpass').val(), captcha: captcha
	}, (res, status) => {
		if(status != 'success'){
            alertify.error('Что-то пошло не так!');
            grecaptcha.reset(lcaptcha);
		}
		else if(res.status){
			let d = new Date();
			d.setTime(d.getTime() + (1*24*60*60*1000));
			document.cookie = `session=${res.data};expires=${d.toUTCString()};domain=.worldroulette.ru;path=/`;
			appendLoadScreen();
		} else {
			grecaptcha.reset(lcaptcha);
			alertify.error(res.data);
		}
	});
}
/**
 * Used as callback for grecaptcha plugin to send user's data
 * @param {string} captcha grecaptcha response
 */
function register(captcha){
	$.post('/register', {
		login: $('#login').val(), pass: $('#pass').val(), name: $('#name').val(), captcha: captcha
	}, (res, status) => {
		if(status != 'success'){
            alertify.error('Что-то пошло не так!');
            grecaptcha.reset(rcaptcha);
		}
		else if(res.status){
			let d = new Date();
			d.setTime(d.getTime() + (1*24*60*60*1000));
			document.cookie = `session=${res.data};expires=${d.toUTCString()};domain=.worldroulette.ru;path=/`;
			appendLoadScreen();
		} else {
			grecaptcha.reset(rcaptcha);
			alertify.error(res.data);
		}
	});
}
/**
 * Regexp check form field
 * @param {object} el    jquery element
 * @param {RegExp} regex regexp of checker
 */
function checkField(el, regex){
    if(regex.test($(el).val())) $(el).css('color', '#009900')
    else $(el).css('color', '#990000')
}
$(".name").keyup(function(){
	checkField($(this), /^.{3,35}$/)
});
$(".login").keyup(function(){
	checkField($(this), /^[A-z0-9]{3,15}$/)
});
$(".pass").keyup(function(){
	checkField($(this), /^.{6,50}$/)
});

let registering = false;
$(".regbtn").click(a => {
    registering = true;
    if(mapzoomed){
        var hh = $(window).height() - $("#reg").height()-20+'px';
        $("#map").animate({height: hh});
    }
    $("#auth").fadeOut(function(){
        $("#reg").fadeIn();
    });
})
$(".logbtn").click(a => {
    registering = false;
    if(mapzoomed){
        var hh = $(window).height() - $("#auth").height()-20+'px';
        $("#map").animate({height: hh});
    }
    $("#reg").fadeOut(function(){
        $("#auth").fadeIn();
    });
})

let mapzoomed = false;
$("#map").click(function(){
	if(!mapzoomed){
		let el;
		if(registering == true) el = $('#reg');
		else el = $('#auth');
		let hh = $(window).height() - el.height()-20+'px';
		$("#map").animate({width: '70vw', height: hh, left: '0', top: '0', right: '0'}, 'slow');
		$(".auth").animate({bottom: '0'}, 'slow');
		$(".auth").css('top', 'initial');
		mapzoomed = true;
	} else {
		$("#map").animate({width: '20%', height: '20%', left: '20', top: '20', right: '100%'}, 'slow');
		$(".auth").animate({top: '40%'}, 'slow');
		$(".auth").css('bottom', '');
		mapzoomed = false;
	}
})
frame0.onresize = function(){
    if(map) map.updateSize();
}
/*
if(!navigator.standalone && navigator.userAgent.indexOf('Android') > -1 && document.cookie.indexOf('firstTime') == -1) $(`
    <div style="height: 100vh;width: 100vw;position: fixed;background: rgba(51, 51, 51, 0.75);z-index: 10000;"><img style="width: 100vw;right: 0;" src="/assets/icons/TAPTest.webp"></div>`)
.prependTo(document.body)
.click(function(e){
    $(this).fadeOut(200);
});*/