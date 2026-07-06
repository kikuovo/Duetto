module.exports = {
  apps: [
    {
      name: "duetto",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: {
        PORT: 4183,
      },
    },
  ],
};
