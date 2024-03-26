const express = require("express"),
	router = express.Router(),
	fs = require("fs"),
	openGraphScraper = require("open-graph-scraper");

async function isAdmin(req, res, next) {
	if (!req.user || !req.app.locals.admins[req.user.steamid]) return res.redirect("/key");

	const keys = await req.app.locals.db.getData("/keys");
	const steamIds = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
	const admins = req.app.locals.admins;
	const key = req.user.authKey;

	if (!admins[steamIds[key]]) return res.status(401).json({ message: "Unauthorized." });

	return next();
}

async function isUser(req, res, next) {
	// if (req.get("user-agent") !== "Valve/Steam HTTP Client 1.0 GMod/13") return res.status(401).json({ message: "Not in-game" });

	const keys = await req.app.locals.db.getData("/keys");
	const steamIds = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
	const key = req.headers.authorization;

	if (!key) return res.status(401).json({ message: "Unauthorized. Please provide a key." });
	if (!steamIds[key]) return res.status(401).json({ message: `Unauthorized. Get yourself a key on ${req.app.locals.config.domain}/key` });

	return next();
}

router.post("/", isUser, async (req, res) => {
	res.send("Hello World!");
});

router.get("/", isUser, async (req, res) => {
	res.send("Hello World!");
});

router.get("/download", isUser, async (req, res) => {
	const headers = req.headers;
	if (!headers.code) return res.status(401).json({ message: "No code provided. Please provide a valid course code." });
	if (!headers.map) return res.status(401).json({ message: "No map provided. Please provide a valid map." });

	const ip = req.headers["cf-connecting-ip"] || "Unknown";
	const key = headers.authorization;
	const keys = await req.app.locals.db.getData("/keys");
	const steamIds = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
	const steamid = steamIds[key];

	if (ip !== "Unknown" && (await req.app.locals.isRatelimited(ip))) return res.status(401).json({ message: "Too many requests. Please try again later." });
	if (ip !== "Unknown" && (await req.app.locals.isMultiAccount(ip, steamid))) return res.status(401).json({ message: "Your account was detected as multiaccount. Please open a ticket on our Discord server." });

	const courseData = await req.app.locals.db.getData(`/courses/${headers.code}`);

	if (courseData.map !== headers.map) return res.status(401).json({ message: "Invalid map. Please start a map that require by course you provided." });

	const file = fs.readFileSync(`public/${courseData.path}`, "utf-8");

	await req.app.locals.log(`[DOWNLOAD] Served a course for user (Course: ${headers.code}, SteamID: ${steamid}, Key ${key}).`);
	res.send(file);
});

router.post("/upload", isUser, async (req, res) => {
	const headers = req.headers;
	if (!headers.course) return res.status(401).json({ message: "No course provided. Please provide a valid course." });
	if (!headers.map) return res.status(401).json({ message: "No map provided. Please provide a valid map." });
	if (headers.mapid === null || headers.mapid === undefined) return res.status(401).json({ message: "No map id provided. Please provide a valid map id." });

	const ip = req.headers["cf-connecting-ip"] || "Unknown";
	const key = headers.authorization;
	const keys = await req.app.locals.db.getData("/keys");
	const steamIds = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));
	const steamid = steamIds[key];

	if (ip !== "Unknown" && (await req.app.locals.isRatelimited(ip))) return res.status(401).json({ message: "Too many requests. Please try again later." });
	if (ip !== "Unknown" && (await req.app.locals.isMultiAccount(ip, steamid))) return res.status(401).json({ message: "Your account was detected as multiaccount. Please open a ticket on our Discord server." });

	const course = Buffer.from(headers.course, "base64").toString("utf-8");
	if (!req.app.locals.isCourseFileValid(JSON.parse(course))) return res.status(401).json({ message: "Invalid course file. Please provide a valid course." });

	let code = generateCode(req.app.locals);
	let file = `public/courses/${code}.txt`;

	do {
		code = generateCode(req.app.locals);
		file = `public/courses/${code}.txt`;
	} while (fs.existsSync(file));

	console.log(code);

	fs.writeFileSync(file, course, "utf-8");

	const mapImage = headers.mapid !== 0 ? await openGraphScraper({ url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${headers.mapid}` }).then(data => data.result.ogImage[0].url) : 0;

	await req.app.locals.db.push("/courses", {
		[code]: {
			map: headers.map,
			uploader: {
				authkey: key,
				userid: steamIds[key],
			},
			time: Date.now(),
			path: `courses/${code}.txt`,
			mapid: headers.mapid,
			mapimg: mapImage,
		},
	}, false);

	await req.app.locals.log(`[UPLOAD] User uploaded a course (Course: ${code}, SteamID: ${steamIds[key]}, Key ${key}).`);
	res.send(code);
});

router.post("/admin", isAdmin, async (req, res) => {
	res.send("Hello post");
	console.log(req.headers);
});

router.get("/admin", isAdmin, async (req, res) => {
	res.send("Hello get");
	console.log(req.headers);
});

function generateCode(locals) {
	let code = "";

	for (let i = 0; i < 3; i++) {
		code += locals.generateRandomString(4);

		if (i === 0 || i === 1) code += "-";
	}

	return code.toUpperCase();
}

module.exports = router;
