// backend/src/routes/articles.routes.js
const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ctrl = require("../controllers/articles.controller");

router.use(authRequired);

router.post("/import", ctrl.importByUrl);
router.post("/refresh", ctrl.refresh);
router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
