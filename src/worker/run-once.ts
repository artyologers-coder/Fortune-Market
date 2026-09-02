import { runResyncPass } from "./sync";

runResyncPass()
  .then((r) => console.log("Done:", r.length))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });