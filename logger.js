const fs = require("fs");

function logg(content, file = "log.txt") {
  fs.appendFileSync(file, new Date().toISOString() + " : " + content + "\n");
}
function dumpObj(content, file = "obj_log") {
  fs.writeFileSync(file, JSON.stringify(content, null, 2));
}

function loadObj(file = "obj_log") {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
function clearLogObj(file = "obj_log") {
  fs.writeFileSync(file, JSON.stringify("", null, 2));
}
module.exports = { logg, dumpObj, loadObj, clearLogObj };
