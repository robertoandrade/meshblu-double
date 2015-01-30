var DoubleDrive = require('./double-drive');
var drive = new DoubleDrive({
	userId: "a3fb91cd00ac9f5f76677ccfb1f6161750f401fd",
	public_key: 'doubledemo'
});

console.log('drive:', drive);

drive.on('connecting', function() { console.log('connecting...'); });
drive.on('connect', function() { console.log('connected!', drive.socketIsConnected()); });
drive.on('error', function(e) { 
	console.log('error:', e);
	
	process.exit(0);
});

drive.on('robots', function(robots) {
	console.log('robots[%s]:', robots.length, robots);
	
	process.exit(0);
});