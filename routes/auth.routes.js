const router = require("express").Router();
const { signup, login, me } = require("../controllers/auth.controller");
const { authRequired } = require("../middleware/auth");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authRequired, me);

module.exports = router;
