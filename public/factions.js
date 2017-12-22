let factions;

$(()=>{
	socket.on('updatefactions', ()=>{
		reloadFactions(()=>{
			updateMap();
			updatePlayers();
		})
	})
});
/**
 * Download factions info from the server
 * @param   {function} cb Callback function
 * @returns {function} Promise
 */
function reloadFactions(cb){
	return $.get("/factions", function(data){
		factions = JSON.parse(data);
		if(cb) cb();
	}).promise();
}
