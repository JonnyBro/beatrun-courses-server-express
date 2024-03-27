const express = require("express"),
	path = require("path"),
	session = require("express-session"),
	logger = require("morgan"),
	fs = require("fs"),
	passport = require("passport"),
	SteamStrategy = require("passport-steam").Strategy;

const { JsonDB, Config } = require("node-json-db");

const config = require("./config");
const db = new JsonDB(new Config(`data/${config.production ? "main" : "test"}_db`, true, true, "/"));

if (!fs.existsSync("public/courses/")) fs.mkdirSync("public/courses/");
if (!fs.existsSync("data/")) fs.mkdirSync("data/");

// Express App

const indexRouter = require("./routes/index"),
	keyRouter = require("./routes/key"),
	adminRouter = require("./routes/admin"),
	apiRouter = require("./routes/api");

const app = express();

passport.serializeUser((user, done) => {
	done(null, user._json);
});

passport.deserializeUser((obj, done) => {
	done(null, obj);
});

passport.use(
	new SteamStrategy(
		{
			realm: config.domain,
			returnURL: `${config.domain}/auth/return`,
			apiKey: config.steamKey,
		},
		(identifier, profile, done) => {
			return done(null, profile);
		},
	),
);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
	session({
		secret: config.cookieSecret,
		name: "U_SESSION",
		resave: true,
		saveUninitialized: true,
		cookie: {
			maxAge: 3600000,
		},
	}),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/key", keyRouter);
app.use("/admin", adminRouter);
app.use("/api", apiRouter);
app.get("/auth", passport.authenticate("steam"), () => {});
app.get("/auth/return", passport.authenticate("steam", { failureRedirect: "/" }), (req, res) => res.redirect("/key"));
app.get("/auth/logout", (req, res, next) => {
	req.logout(function (err) {
		if (err) return next(err);

		res.redirect("/key");
	});
});

// catch 404 and forward to error handler
// app.use(function (req, res, next) {
// 	next(createError(404));
// });

// // Error Handler
// app.use(function (err, req, res) {
// 	// render the error page
// 	res.status(err.status || 500);
// 	res.render("error");
// });

// Locals
db.getData("/admins").then(data => {
	app.locals.admins = data;
});

app.locals = {
	config: config,
	db: db,
	log: log,
	sanitize: sanitize,
	getKey: getKey,
	isRatelimited: isRatelimited,
	isMultiAccount: isMultiAccount,
	isCourseFileValid: isCourseFileValid,
	generateRandomString: generateRandomString,
};

/**
 * Gets a user's key from the database.
 *
 * Checks if the user already has a key, and returns it if so.
 * Otherwise generates a new one.
 *
 * @param {Object} user The user object.
 * @returns {Promise<String>} The user's key.
 */
async function getKey(user) {
	const keys = await db.getData("/keys");
	const key = keys[user.steamid];

	if (key) {
		await log(`[KEY] User logged in (SteamID: ${user.steamid}, Key ${key}).`);
		return key;
	} else return await _createKey(user);
}

/**
 * Creates a new unique key for the given user and saves it to the database.
 *
 * @param {Object} user The OpenID Steam user object.
 * @returns {Promise<String>} The new unique key generated for the user.
 */
async function _createKey(user) {
	const keys = await db.getData("/keys");
	const key = generateRandomString();
	const isFound = keys[key];

	if (!isFound) {
		keys[user.steamid] = key;

		await app.locals.log(`[KEY] New user (SteamID: ${user.steamid}, TimeCreated: ${user.timecreated}, Key: ${key}).`);
		await db.push("/keys", keys);

		return key;
	} else return await _createKey(user);
}

/**
 * Validates that a course file content array is valid.
 *
 * @param {any[]} content The course file content array to validate
 * @returns {Boolean} True if the content is a valid course file array
 */
function isCourseFileValid(content) {
	if (content.length !== 6) return false;
	if (typeof content[0] !== "object" || typeof content[1] !== "object" || typeof content[2] !== "string" || typeof content[3] !== "number" || typeof content[4] !== "string" || typeof content[5] !== "object") return false;

	return true;
}

/**
 * Checks if an IP address is currently rate limited.
 *
 * Gets the current rate limits from the database.
 * If the IP already has a recent rate limit, returns true.
 * Otherwise, saves a new rate limit for the IP and returns false.
 *
 * @param {string} ip The IP address to check
 * @returns {Promise<boolean>} Whether the IP is currently rate limited
 */
async function isRatelimited(ip) {
	const rateLimits = await db.getData("/ratelimits");

	if (rateLimits[ip] && Date.now() - rateLimits[ip] <= config.rateLimitTime) return true;

	rateLimits[ip] = Date.now();

	await db.push("/ratelimits", rateLimits);

	return false;
}

async function isMultiAccount(ip, steamid) {
	const locked = await db.getData("/locked");
	const records = await db.getData("/records");

	if (locked[steamid]) return true;

	if (!records[steamid]) records[steamid] = {
		"ips": {
			[ip]: true,
		},
		"lastchanged": Date.now(),
	};

	// Clear IPs if the user has changed their ip more than ipChangeTime
	if (Date.now() - records[steamid]["lastchanged"] > config.ipChangeTime) {
		records[steamid]["ips"] = [];
		records[steamid]["lastchanged"] = Date.now();
	}

	// Lock account if the user changed their IP more than 3 time in ipChangeTime
	if (Object.keys(records[steamid]["ips"]).length > 2) {
		locked[steamid] = true;

		await db.push("/locked", locked);
		return true;
	}

	await db.push("/records", records);

	return false;
}

/**
 * Generates a random string of the given length.
 *
 * @param {number} [length=32] The length of the random string to generate.
 * @returns {string} The generated random string.
 */
function generateRandomString(length = 32) {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	let counter = 0;
	let result = "";

	while (counter < length) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
		counter += 1;
	}

	return result;
}

/**
 * Sanitizes a string by removing unwanted characters and replacing spaces with hyphens.
 *
 * @param {string} [string=""] The string to sanitize.
 * @param {boolean} [forceLowercase=true] Whether to force the string to lowercase.
 * @param {boolean} [strict=false] Whether to remove all non-alphanumeric characters.
 * @returns {string} The sanitized string.
 */
function sanitize(string = "", forceLowercase = true, strict = false) {
	string = string.toString();

	const strip = ["~", "`", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "=", "+", "[", "{", "]", "}", "\\", "|", ";", ":", "\"", "'", "&#8216;", "&#8217;", "&#8220;", "&#8221;", "&#8211;", "&#8212;", "â€”", "â€“", ",", "<", ".", ">", "/", "?"];

	let clean = string.trim().replace(strip, "").replace(/\s+/g, "-");
	clean = strict ? string.replace(/[^\u0400-\u04FF\w\d\s-]/g, "") : clean;

	return forceLowercase ? clean.toLowerCase() : clean;
}

/**
 * Logs a message to a log file.
 *
 * @param {string} message The message to log.
 */
async function log(message) {
	fs.writeFile("data/logs.log", `[${new Date(Date.now()).toLocaleString("ru-RU")}] - ${message}\n`, { flag: "a" }, err => {
		if (err) throw err;
		return true;
	});
}

// HTTP server

const http = require("http");

const port = normalizePort(config.port || "6547");
app.set("port", port);

const server = http.createServer(app);

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

function normalizePort(val) {
	const port = parseInt(val, 10);

	if (isNaN(port)) {
		// named pipe
		return val;
	}

	if (port >= 0) {
		// port number
		return port;
	}

	return false;
}

function onError(error) {
	if (error.syscall !== "listen") throw error;

	const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

	// handle specific listen errors with friendly messages
	switch (error.code) {
		case "EACCES":
			console.error(bind + " requires elevated privileges");
			process.exit(1);
			break;
		case "EADDRINUSE":
			console.error(bind + " is already in use");
			process.exit(1);
			break;
		default:
			throw error;
	}
}

function onListening() {
	const addr = server.address();
	const bind = typeof addr === "string" ? "pipe: " + addr : "port: " + addr.port;

	console.log("Now listening on " + bind);
}
