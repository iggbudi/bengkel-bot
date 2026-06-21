/**
 * PM2 ecosystem config for BengkelBot production.
 *
 * Usage:
 *   pm2 startOrReload ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'cmaestro-bengkelbot',
      script: 'dist/web/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      max_memory_restart: '512M',
      node_args: '--disable-warning=ExperimentalWarning',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}