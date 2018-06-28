const lang = {
	en: {
		minerStart: 'Start miner',
		minerStop: 'Stop miner',
		accept: 'Accept',
		decline: 'Отклонить',
		kick: 'Kick',
		fileNotSpecified: 'You haven\'t specified the file!',
		landNotSpecified: 'You haven\'t specified the land!',
		hardReload: 'CTRL+SHIFT+R or CTRL+F5',
		faction: 'Faction',
		defence: 'Defence',
		attack: 'Attack',
		heal: 'Upgrade'
	},
	ru: {
		minerStart: 'Начать майнинг',
		minerStop: 'Остановить майнинг',
		accept: 'Принять',
		decline: 'Отклонить',
		kick: 'Кикнуть',
		fileNotSpecified: 'Вы не выбрали файл!',
		landNotSpecified: 'Вы не выбрали территорию!',
		hardReload: 'CTRL+SHIFT+R или CTRL+F5',
		faction: 'Фракция',
		defence: 'Сила',
		attack: 'Захватить',
		heal: 'Улучшить'
	}
}
let dict
if(document.domain.indexOf('en') > -1)
	dict = lang.en
else
	dict = lang.ru