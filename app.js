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

module.exports = app;
