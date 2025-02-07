'use strict';

/**
 * agent worker is child_process forked by master.
 *
 * agent worker only exit in two cases:
 *  - receive signal SIGTERM, exit code 0 (exit gracefully)
 *  - receive disconnect event, exit code 110 (maybe master exit in accident)
 */

// $ node agent_worker.js options
const options = JSON.parse(process.argv[2]);
if (options.require) {
  // inject
  options.require.forEach(mod => {
    require(mod);
  });
}

let AgentWorker;
if (options.startMode === 'worker_threads') {
  AgentWorker = require('./utils/mode/impl/worker_threads/agent').AgentWorker;
} else {
  AgentWorker = require('./utils/mode/impl/process/agent').AgentWorker;
}

const debug = require('debug')('egg-cluster');
const ConsoleLogger = require('egg-logger').EggConsoleLogger;
const consoleLogger = new ConsoleLogger({ level: process.env.EGG_AGENT_WORKER_LOGGER_LEVEL });

const Agent = require(options.framework).Agent;
debug('new Agent with options %j', options);
let agent;
try {
  agent = new Agent(options);
} catch (err) {
  consoleLogger.error(err);
  throw err;
}

function startErrorHandler(err) {
  consoleLogger.error(err);
  consoleLogger.error('[agent_worker] start error, exiting with code:1');
  AgentWorker.kill();
}

agent.ready(err => {
  // don't send started message to master when start error
  if (err) return;

  agent.removeListener('error', startErrorHandler);
  AgentWorker.send({ action: 'agent-start', to: 'master' });
});

// exit if agent start error
agent.once('error', startErrorHandler);

AgentWorker.gracefulExit({
  logger: consoleLogger,
  label: 'agent_worker',
  beforeExit: () => agent.close(),
});
