const createError = require("http-errors"),
	express = require("express"),
	path = require("path"),
	session = require("express-session"),
	logger = require("morgan"),
	fs = require("fs"),
	passport = require("passport"),
	SteamStrategy = require("passport-steam").Strategy;

const { JsonDB, Config } = require("node-json-db");

const config = require("./config");
const db = new JsonDB(new Config(`data/${config.production ? "main" : "test"}_db`, true, true, "/"));

if (!fs.existsSync("public/courses/")) { fs.mkdirSync("public/courses/"); }
if (!fs.existsSync("data/")) { fs.mkdirSync("data/"); }

const indexRouter = require("./routes/index"),
	keyRouter = require("./routes/key"),
	adminRouter = require("./routes/admin");

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
			realm: "http://localhost:6547/",
			returnURL: "http://localhost:6547/auth/return",
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
app.use(express.urlencoded({ extended: false }));
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
app.get("/auth", passport.authenticate("steam"), () => {});
app.get("/auth/return", passport.authenticate("steam", { failureRedirect: "/" }), function (req, res) {
	res.redirect("/key");
});
app.get("/auth/logout", (req, res, next) => {
	req.logout(function (err) {
		if (err) return next(err);

		res.redirect("/key");
	});
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});

// Error Handler
app.use(function (err, req, res) {
	// render the error page
	res.status(err.status || 500);
	res.render("error");
});

// Locals
db.getData("/admins").then(data => {
	app.locals.admins = data;
});

app.locals = {
	config: config,
	db: db,
	log: log,
	sanitize: (string = "", force_lowercase = true, hard = false) => {
		const strip = ["~", "`", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "=", "+", "[", "{", "]",
			"}", "\\", "|", ";", ":", "\"", "'", "&#8216;", "&#8217;", "&#8220;", "&#8221;", "&#8211;", "&#8212;",
			"â€”", "â€“", ",", "<", ".", ">", "/", "?" ];

		let clean = string.trim().replace(strip, "").replace(/\s+/g, "-");
		clean = hard ? string.replace(/[^\u0400-\u04FF\w\d\s]/g, "") : clean;

		return force_lowercase ? clean.toLowerCase() : clean;
	},
	getKey: async (user) => {
		const keys = await db.getData("/keys");
		const key = keys[user.steamid];

		if (key) {
			await log(`[KEY] User logged in (SteamID: ${user.steamid}, Key ${key}).`);
			return key;
		} else
			return createKey(user);
	},
};

async function createKey(user) {
	const keys = await db.getData("/keys");
	const key = generateRandomString();
	const isFound = keys[key];

	if (!isFound) {
		keys[user.steamid] = key;

		await app.locals.log(`[KEY] New user (SteamID: ${user.steamid}, TimeCreated: ${user.timecreated}, Key: ${key}).`);
		await db.push("/keys", keys);

		return key;
	} else
		return await createKey(user);
}

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
 *
 * @param {String} message
 */
async function log(message) {
	fs.writeFile("data/logs.log", `[${new Date(Date.now()).toLocaleString("ru-RU")}] - ${message}\n`, { flag: "a" }, err => {
		if (err) throw err;
		return true;
	});
}

module.exports = app;
