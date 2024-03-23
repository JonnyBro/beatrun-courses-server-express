const express = require("express"),
	router = express.Router();

async function isAdmin(req, res, next) {
	const admins = await req.app.locals.db.getData("/admins");
	const keys = await req.app.locals.db.getData("/keys");
	const reverseKeys = Object.fromEntries(Object.entries(keys).map(([k, v]) => [v, k]));

	const key = req.headers["authorization"];
	if (!key) return res.status(401).json({ message: "Unauthorized" });
	if (!admins[reverseKeys[key]]) return res.status(401).json({ message: "Unauthorized" });

	if (req.query) return next();
	else if (!req.user || !req.app.locals.admins[req.user.steamid]) return res.redirect("/key");
}

router.post("/", async (req, res) => {
	res.send("Hello World");
});

router.post("/admin", isAdmin, async (req, res) => {
	res.send("Hello asd");
});

module.exports = router;
