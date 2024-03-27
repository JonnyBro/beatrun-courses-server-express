const express = require("express"),
	router = express.Router();

async function isAdmin(req, res, next) {
	if (!req.user || !req.app.locals.admins[req.user.steamid]) return res.redirect("/key");

	const admins = req.app.locals.admins;
	const steamid = req.user.steamid;

	if (!admins[steamid]) return res.status(401).json({ res: res.statusCode, message: "Unauthorized." });

	return next();
}

const response = "xd";

router.get("/", isAdmin, async (req, res) => {
	res.render("admin", {
		user: req.user,
		locals: req.app.locals,
		response: response,
	});
});

module.exports = router;
