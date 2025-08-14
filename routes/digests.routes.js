// backend/src/routes/digests.routes.js
const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/digests.controller");

router.use(authRequired);
router.get("/:date", ctrl.getByDate);
router.post("/generate", ctrl.generate);

module.exports = router;
