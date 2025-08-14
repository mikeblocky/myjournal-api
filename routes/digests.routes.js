const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/digests.controller");

router.use(authRequired);

// Important: put /generate before /:date so it isn't captured by the param route
router.post("/generate", ctrl.generate);
router.get("/:date", ctrl.getOne);

module.exports = router;
