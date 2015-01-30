var DoubleDrive = require('./double-drive');
var drive = new DoubleDrive({
	userId: "gc8Log4bl4"
});

console.log('drive:', drive);

drive.on('connecting', function() { console.log('connecting...'); });
drive.on('connect', function() { console.log('connected!'); });
drive.on('error', function(e) { console.log('error:', e); });

drive.on('robots', function(robots) {
	console.log('robots:', robots);
	
	process.exit(0);
});