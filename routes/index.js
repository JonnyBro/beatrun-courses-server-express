const express = require("express"),
	router = express.Router(),
	fs = require("fs");

const courseCardComponent = fs.readFileSync("components/course_card.html", "utf-8");
const pagesComponent = fs.readFileSync("components/page_dropdown.html", "utf-8");

router.get("/", async (req, res) => {
	const courses = await req.app.locals.db.getData("/courses");
	const codes = Object.keys(courses);

	/* Pages Count */
	const coursesCount = Object.keys(courses).length;
	const pagesCount = Math.max(Math.floor(coursesCount / 20), 0);
	let options = "";

	for (let i = 1; i <= pagesCount; i++) {
		if (req.query.page && req.query.page.toString() === i.toString())
			options += `<option selected value="${i}">${i}</option>`;
		else
			options += `<option value="${i}">${i}</option>`;
	}

	const pagesDropdownDone = pagesComponent.replace("{options}", options);

	/* Courses Cards */
	const usernames = await req.app.locals.db.getData("/usernames");
	const ratings = await req.app.locals.db.getData("/rating");
	const codesData = [];
	const cards = [];

	codes.forEach(async code => {
		const codeData = courses[code];

		let codeFile = "";
		try {
			codeFile = fs.readFileSync(`public/${codeData.path}`, "utf-8");
		} catch (e) { return console.log("not found file for: " + code); }

		const parsedCodeFile = JSON.parse(codeFile);

		if (!isCourseFileValid(parsedCodeFile)) console.log("course is not valid: " + code);

		let codeMapImage = "img/unknown.jpg";

		const codeMap = codeData["map"];
		if (codeMap === "gm_flatgrass" || codeMap === "gm_construct")
			if (fs.existsSync(`img/${codeMap}.jpg`))
				codeMapImage = `img/${codeMap}.jpg`;

		if (codeData["mapimg"] && codeData["mapimg"].length > 0)
			codeMapImage = codeData["mapimg"];

		let codeMapId = "2818480138"; // le troll
		if (codeData["mapid"] && codeData["mapid"].length > 0 && codeData["mapid"] !== "0")
			codeMapId = codeData["mapid"];

		const codeUserId = codeData["uploader"]["userid"];
		const codeUsername = usernames[codeUserId] ? usernames[codeUserId] : codeUserId;
		const rating = getCourseRating(ratings, code);

		codesData.push({
			"name": parsedCodeFile[4],
			"code": code,
			"map": codeData["map"],
			"username": codeUsername,
			"userid": codeUserId,
			"elements": parsedCodeFile[5].length + parsedCodeFile[0].length,
			"download": codeData["path"],
			"likes": rating.likes,
			"dislikes": rating.dislikes,
			"rates": rating.ratings,
			"scoresmart": rating.rateSmart,
			"scoredumb": rating.rateDumb,
			"mapimg": codeMapImage,
			"mapwid": codeMapId,
			"time": codeData["time"] * 1000,
		});
	});

	codesData.forEach(data => cards.push(generateCourseCard(data)));

	let sortType = "none";
	if (req.query.sort) sortType = req.app.locals.sanitize(req.query.sort, true, false);

	const sortKeys = {
		"date": "time",
		"ratesmart": "scoresmart",
		"ratedumb": "scoredumb",
		"elementcount": "elements",
		"coursename": "name",
		"mapname": "map",
	};

	let sortedCards = [];
	if (sortType === "none") sortedCards = cards;
	else {
		console.log(req.query.sort);
		const sortKey = sortKeys[sortType];

		sortedCards = cards.sort((a, b) => {
			const aVal = a[sortKey];
			const bVal = b[sortKey];
			return aVal > bVal ? -1 : 1;
		});
	}

	if (req.query.searchquery) sortedCards = sortedCards.filter(c => {
		const query = req.app.locals.sanitize(req.query.searchquery, true, false);
		let searchString = "";
		searchString += c["name"];
		searchString += c["code"];
		searchString += c["userid"];
		searchString += c["username"];
		searchString += c["map"];
		searchString += c["mapwid"];

		return searchString.includes(query);
	});

	let page = 0;
	if (req.query.page) page = req.query.page;
	if (page * 20 > sortedCards.length) page = 0;

	sortedCards = sortedCards.splice(Math.max((page - 1) * 20 - 1, 0), Math.max((page - 1) * 20 - 1, 0) + 20).join("\n");

	res.render("index", {
		user: req.user,
		locals: req.app.locals,
		pagesDropdown: pagesDropdownDone,
		coursesList: sortedCards,
	});
});

/**
 * Validates that a course file content array is valid.
 *
 * @param {any[]} content The course file content array to validate
 * @returns {Boolean} True if the content is a valid course file array
 */
function isCourseFileValid(content) {
	if (content.length !== 6) return false;
	if (typeof content[0] !== "object" || typeof content[1] !== "object" || typeof content[2] !== "string" || typeof content[3] !== "number" || typeof content[4] !== "string" || typeof content[5] !== "object") return false;

	return true;
}

/**
 * Gets the rating data for a course based on its code.
 *
 * @param {Object} data Object containing rating data mapped by course code
 * @param {String} code Course code to get rating data for
 * @returns {Object} Object containing rating data
 */
function getCourseRating(data, code) {
	if (!data[code]) return { likes: 0, dislikes: 0, ratings: 0, rateSmart: 0, rateDumb: 0 };

	const ratings = Object.keys(data[code]).length;
	let likes = 0,
		dislikes = 0,
		rateSmart = 0,
		rateDumb = 0;

	if (ratings <= 0) return { likes: 0, dislikes: 0, ratings: 0, rateSmart: 0, rateDumb: 0 };

	for (const r in data[code])
		if (data[code][r]) likes += 1;

	dislikes = ratings - likes;
	rateSmart = ratings + likes - dislikes;
	rateDumb = likes / ratings;

	return { likes: likes, dislikes: dislikes, ratings: ratings, rateSmart: rateSmart, rateDumb: rateDumb };
}

/**
 * Generates an HTML string for a course card component.
 *
 * @param {Object} course The course data object
 * @returns {String} The generated HTML string for the course card
 */
function generateCourseCard(course) {
	const templates = {
		"{coursename}": course["name"],
		"{coursecode}": course["code"],
		"{uploaderuid}": course["userid"],
		"{uploadername}": course["username"],
		"{coursemap}": course["map"],
		"{coursedownload}": course["download"],
		"{likecount}": course["likes"],
		"{dislikecount}": course["dislikes"],
		"{ratesmart}": course["scoresmart"],
		"{ratedumb}": course["scoredumb"],
		"{time}": course["time"],
		"{mapimagesrc}": course["mapimg"],
		"{mapwid}": course["mapwid"],
		"{elementcount}": course["elements"] + " elements",
		"{fdate}": new Date(course["time"]).toLocaleString("ru-RU").split(", ")[0],
	};

	let output = courseCardComponent;

	for (const t in templates)
		output = output.replace(new RegExp(t, "g"), templates[t]);

	return output;
}

module.exports = router;
