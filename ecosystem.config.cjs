module.exports = {
  apps: [
    {
      name: "duetto",
      script: "server/index.mjs",
      cwd: __dirname,
      env: {
        PORT: 4183,
      },
    },
  ],
};
