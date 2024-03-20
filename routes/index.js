const express = require("express"),
	router = express.Router();

// eslint-disable-next-line no-unused-vars
router.get("/", async (req, res, next) => {
	res.render("index", {
		admins: await req.app.locals.admins,
		user: req.user,
	});
});

module.exports = router;
