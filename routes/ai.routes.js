// backend/src/routes/ai.routes.js
const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const { summarizeCtrl } = require("../controllers/ai.controller");

// Add CORS debugging for AI routes
router.use((req, res, next) => {
  console.log(`AI Route - Method: ${req.method}, Path: ${req.path}, Origin: ${req.headers.origin}`);
  next();
});

router.use(authRequired);

router.post("/summarize", summarizeCtrl);

module.exports = router;
