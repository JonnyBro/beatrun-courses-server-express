const express = require("express"),
	router = express.Router();

router.get("/:code", async (req, res) => {
	res.render("stats", {
		user: req.user,
		locals: req.app.locals,
		code: req.params.code,
	});
});

module.exports = router;
