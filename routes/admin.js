const express = require("express"),
	router = express.Router();

async function isAdmin(req, res, next) {
	const admins = req.app.locals.admins;

	if (req.user && admins[req.user.steamid]) return next();
	else if (!req.user || !admins[req.user.steamid]) return res.redirect("/key");
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
