/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./views/*.ejs",
		"./components/*.html",
	],
	plugins: [require("daisyui")],
	daisyui: {
		themes: ["light", "black", "cyberpunk"],
		darkTheme: "black",
	},
};
