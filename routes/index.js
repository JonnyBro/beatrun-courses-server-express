const express = require("express"),
	router = express.Router();

// eslint-disable-next-line no-unused-vars
router.get("/", async (req, res, next) => {
	res.render("index", {
		user: req.user,
		locals: req.app.locals,
	});
});

module.exports = router;
