const cron = require("node-cron");
const User = require("../models/User");
const { buildDigestForUser } = require("../services/digest.service");

function startDailyDigestJob(app) {
  if (process.env.ENABLE_JOBS !== "true") return;

  const spec = process.env.CRON_SCHEDULE || "0 8 * * *";
  cron.schedule(spec, async () => {
    try {
      const users = await User.find({}, { _id: 1 }).lean();
      const today = new Date().toISOString().slice(0,10);
      for (const u of users) {
        try { await buildDigestForUser(u._id, today); } catch {}
      }
      if (app?.locals) app.locals.lastDigestRun = new Date();
      console.log(`[cron] Daily digest generated for ${users.length} users`);
    } catch (e) {
      console.error("[cron] digest error:", e.message);
    }
  }, { timezone: "UTC" });
}

module.exports = { startDailyDigestJob };
