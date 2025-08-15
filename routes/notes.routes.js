const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/notes.controller");

router.use(authRequired);

// CRUD
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.getOne);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

// Daily AI summary
router.get("/daily/:date", ctrl.getDaily);
router.post("/daily/:date/generate", ctrl.generateDaily);

// Calendar sync
router.post("/sync-to-calendar", ctrl.syncToCalendar);
router.post("/daily/:date/sync-to-calendar", ctrl.syncDateToCalendar);

module.exports = router;
