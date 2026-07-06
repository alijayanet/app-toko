module.exports = {
  apps: [
    {
      name: "pos-central",
      script: "./src/server.js",
      instances: 1, // SQLite cocok dengan 1 instance (fork mode) untuk menghindari isu locking database pada concurrent writes
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0"
      }
    }
  ]
};
