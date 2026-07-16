// Startup timing instrumentation. T0 = first require of this module (top of
// main.js). Logs "[startup] <name> +<ms>" so cold-start phases are measurable.
const STARTUP_T0 = Date.now();
const debugLogger = require("./debugLogger");

function markStartup(name) {
  debugLogger.info(`[startup] ${name} +${Date.now() - STARTUP_T0}ms`);
}

module.exports = { STARTUP_T0, markStartup };
