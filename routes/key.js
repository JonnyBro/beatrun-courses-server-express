const express = require("express"),
	router = express.Router(),
	fetch = require("node-fetch");

router.get("/", async (req, res) => {
	if (req.user) {
		req.user.authKey = await registerUser(req.app, req.user);
	}

	res.render("key", {
		user: req.user,
		locals: req.app.locals,
	});
});

/**
 *
 * @param {import("../app")} app
 * @param {Array} user
 * @returns
 */
async function hasGame(app, user) {
	if ((await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${app.locals.config.steamKey}&steamid=${user.steamid}&format=json`).then(r => r.json())).response.games.find(g => g.appid === 4000)) return true;
	return false;
}

/**
 *
 * @param {import("../app")} app
 * @param {Array} user
 * @returns
 */
async function registerUser(app, user) {
	if (Math.floor((new Date() - new Date(user.timecreated * 1000)) / (1000 * 60 * 60 * 24 * 30)) < 3) {
		await app.locals.log(`[KEY] Account too young (SteamID: ${user.steamid}, TimeCreated: ${user.timecreated}).`);
		return "Account too young. Needs to be at least 3 months old.";
	}

	if (!hasGame(app, user)) {
		await app.locals.log(`[KEY] Game not found (SteamID: ${user.steamid})`);
		return "Account doesn't have Garry's mod. Make sure your game details are public.";
	}

	const usernames = await app.locals.db.getData("/usernames");
	const key = await app.locals.getKey(user);

	usernames[user.steamid] = app.locals.sanitize(user.personaname, false, true);
	await app.locals.db.push("/usernames", usernames);

	console.log("clean username: " + usernames[user.steamid]);

	return key;
}

module.exports = router;
