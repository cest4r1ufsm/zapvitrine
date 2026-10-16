// Run on the target installation. Prints key names/status only, not values.
require('dotenv').config({ quiet: true });
const { inspectIntegrations } = require('../src/lib/integrationReadiness');
const report = { kind: 'configuration_only', checkedAt: new Date().toISOString(), integrations: inspectIntegrations() };
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--strict') && Object.values(report.integrations).some(item => item.status !== 'configured_not_verified')) process.exitCode = 1;
