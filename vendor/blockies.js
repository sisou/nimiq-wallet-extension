(function() {
	// The random number is a js implementation of the Xorshift PRNG
	var randseed = new Array(4); // Xorshift: [x, y, z, w] 32 bit values

	function seedrand(seed) {
		for (var i = 0; i < randseed.length; i++) {
			randseed[i] = 0;
		}
		for (var i = 0; i < seed.length; i++) {
			randseed[i%4] = ((randseed[i%4] << 5) - randseed[i%4]) + seed.charCodeAt(i);
		}
	}

	function rand() {
		// based on Java's String.hashCode(), expanded to 4 32bit values
		var t = randseed[0] ^ (randseed[0] << 11);

		randseed[0] = randseed[1];
		randseed[1] = randseed[2];
		randseed[2] = randseed[3];
		randseed[3] = (randseed[3] ^ (randseed[3] >> 19) ^ t ^ (t >> 8));

		return (randseed[3]>>>0) / ((1 << 31)>>>0);
	}

	// Colors from https://github.com/flyswatter/jazzicon/blob/master/colors.js
	var colors = [
		'hsl(182,  99%, 28%)', // '#01888C', // teal
		'hsl( 28, 100%, 49%)', // '#FC7500', // bright orange
		'hsl(189,  94%, 19%)', // '#034F5D', // dark teal
		'hsl( 15,  99%, 49%)', // '#F73F01', // orangered
		'hsl(341,  97%, 54%)', // '#FC1960', // magenta
		'hsl(341,  82%, 43%)', // '#C7144C', // raspberry
		'hsl( 48, 100%, 48%)', // '#F3C100', // goldenrod
		'hsl(204,  89%, 52%)', // '#1598F2', // lightning blue
		'hsl(219,  76%, 51%)', // '#2465E1', // sail blue
		'hsl( 39,  98%, 48%)', // '#F19E02', // gold
	];

	// From https://github.com/flyswatter/jazzicon/blob/master/index.js
	var wobble = 30;
	function hueShift(colors) {
		var amount = (rand() * 30) - (wobble / 2);
		return colors.map(function(hsl) {
			var hue = parseInt(hsl.substr(4, 3).trim());
			hue += amount;
			if(hue > 360) hue -= 360; else if(hue < 0) hue += 360;
			return 'hsl(' + hue + hsl.substr(7);
		});
	}

    function createColor(colors) {
        var skip = rand();
        var idx = Math.floor(colors.length * rand());
        var color = colors.splice(idx,1)[0];
		return color;
	}

	function createImageData(size) {
		var width = size; // Only support square icons for now
		var height = size;

		var dataWidth = Math.ceil(width / 2);
		var mirrorWidth = width - dataWidth;

		var data = [];
		for(var y = 0; y < height; y++) {
			var row = [];
			for(var x = 0; x < dataWidth; x++) {
				// this makes foreground and background color to have a 43% (1/2.3) probability
				// spot color has 13% chance
				row[x] = Math.floor(rand()*2.3);
			}
			var r = row.slice(0, mirrorWidth);
			r.reverse();
			row = row.concat(r);

			for(var i = 0; i < row.length; i++) {
				data.push(row[i]);
			}
		}

		return data;
	}

	function buildOpts(opts, remainingColors) {
		var newOpts = {};

		newOpts.seed = opts.seed || Math.floor((Math.random()*Math.pow(10,16))).toString(16);

		seedrand(newOpts.seed);

		newOpts.size = opts.size || 8;
		newOpts.scale = opts.scale || 4;
		newOpts.color = opts.color || createColor(remainingColors);
		newOpts.bgcolor = opts.bgcolor || createColor(remainingColors);
		newOpts.spotcolor = opts.spotcolor || createColor(remainingColors);

		return newOpts;
	}

	function renderIcon(opts, canvas) {
		var remainingColors = hueShift(colors.slice());

		var opts = buildOpts(opts || {}, remainingColors);

		var imageData = createImageData(opts.size);
		var width = Math.sqrt(imageData.length);

		canvas.width = canvas.height = opts.size * opts.scale;

		var cc = canvas.getContext('2d');
		cc.fillStyle = opts.bgcolor;
		cc.fillRect(0, 0, canvas.width, canvas.height);
		cc.fillStyle = opts.color;

		for(var i = 0; i < imageData.length; i++) {

			// if data is 0, leave the background
			if(imageData[i]) {
				var row = Math.floor(i / width);
				var col = i % width;

				// if data is 2, choose spot color, if 1 choose foreground
				cc.fillStyle = (imageData[i] == 1) ? opts.color : opts.spotcolor;

				cc.fillRect(col * opts.scale, row * opts.scale, opts.scale, opts.scale);
			}
		}
		return canvas;
	}

	function createIcon(opts) {
		var canvas = document.createElement('canvas');

		renderIcon(opts, canvas);

		return canvas;
	}

	var api = {
		create: createIcon,
		render: renderIcon
	};

	if (typeof module !== "undefined") {
		module.exports = api;
	}
	if (typeof window !== "undefined") {
		 window.blockies = api;
	}

})();
