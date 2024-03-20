const express = require("express"),
	router = express.Router();

// eslint-disable-next-line no-unused-vars
router.get("/", async (req, res, next) => {
	try {
		res.render("key", {
			admins: await req.app.locals.admins,
			user: req.user,
		});
	} catch (error) {
		res.redirect("/");

		console.error(error);
	}
});

module.exports = router;
