function guestLogin(){
	const guestSession = 'a40b5ceab506e02f0a6af6c967e8d04262a551c6726892b24dbcc94c43929412cdad54e4441ebbcfb66e951c8e32f0c9117fa5ce05a269f741181f6311d16fc7'
	let d = new Date();
	d.setTime(d.getTime() + (1*24*60*60*1000));
	document.cookie = `session=${guestSession};expires=${d.toUTCString()};domain=.worldroulette.ru;path=/`;
	location.reload()
}

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
function confirm(captcha) {
	$.post($('#isNew').is(':checked') ? '/register' : '/login', {
		login: $('.login').val(), pass: $('.pass').val(), name: $('.name').val(), captcha: captcha
	}, (res, status) => {
		if(status != 'success') alert('Что-то пошло не так!');
		else if(res.status){
			let d = new Date();
			d.setTime(d.getTime() + (1*24*60*60*1000));
			document.cookie = `session=${res.data};expires=${d.toUTCString()};domain=.worldroulette.ru;path=/`;
			appendLoadScreen();
		} else {
			alert(res.data);
			grecaptcha.reset()
		}
	});
}

function captchaFail(){
	grecaptcha.reset();
	window.setTimeout(a => {grecaptcha.execute();}, 1000)
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

$("#isNew").change(function() {
    if($(this).is(':checked')) {
		$('.name').css('visibility', '')
		$('.mbtn').text('Зарегистрироваться')
	} else {
		$('.name').css('visibility', 'hidden')
		$('.mbtn').text('Войти')
	}
})