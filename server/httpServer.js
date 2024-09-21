const express = require("express");
const path = require("path");

const app = express();
const port = 3001;

// Serve static files from the public_html directory
app.use(express.static(path.join(__dirname, "..", "public_html")));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${port}/`);
});
