const express = require("express"),
	router = express.Router();

function isAdmin(req, res, next) {
	if (req.user && req.app.locals.admins[req.user.steamid]) return next();
	else if (!req.user || !req.app.locals.admins[req.user.steamid]) return res.redirect("/key");
}

const response = "xd";

// eslint-disable-next-line no-unused-vars
router.get("/", isAdmin, async (req, res, next) => {
	res.render("admin", {
		user: req.user,
		locals: req.app.locals,
		response: response,
	});
});

module.exports = router;
