const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const { summarizeCtrl } = require("../controllers/ai.controller");

router.use(authRequired);
router.post("/summarize", summarizeCtrl);

module.exports = router;
