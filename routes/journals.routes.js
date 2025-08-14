const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/journals.controller");

// public first (no auth)
router.get("/public", ctrl.listPublic);
router.get("/public/:slug", ctrl.getPublic);

// owner (auth)
router.use(authRequired);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.getOne);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.post("/:id/publish", ctrl.publish);
router.post("/:id/unpublish", ctrl.unpublish);

module.exports = router;
