const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/calendar.controller");

router.use(authRequired);

// Events
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.getOne);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

// AI day plan
router.get("/daily/:date", ctrl.getDaily);
router.post("/daily/:date/generate", ctrl.generateDaily);

module.exports = router;
