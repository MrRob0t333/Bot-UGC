module.exports = {
  testDir: "./tests",
  timeout: 30000,
  reporter: "list",
  use: {
    browserName: "chromium",
    headless: true,
  },
};
